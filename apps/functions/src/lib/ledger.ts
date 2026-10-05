import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_CATEGORIES,
  effectDelta,
  isMinor,
  type Account,
  type LedgerTransaction,
  type TransactionInput,
} from '@profjero/shared';
import { createdMeta, fail, tenantRef } from './core';

export interface LoadedAccount {
  ref: DocumentReference;
  data: Account;
}

export const accountsCol = (tenantId: string) => tenantRef(tenantId).collection('accounts');
export const transactionsCol = (tenantId: string) => tenantRef(tenantId).collection('transactions');

export async function loadAccounts(t: Transaction, tenantId: string, ids: (string | null | undefined)[]): Promise<Map<string, LoadedAccount>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, LoadedAccount>();
  if (unique.length === 0) return map;
  const refs = unique.map((id) => accountsCol(tenantId).doc(id));
  const snaps = await t.getAll(...refs);
  snaps.forEach((s, i) => {
    if (s.exists) map.set(s.id, { ref: refs[i]!, data: { id: s.id, ...(s.data() as Omit<Account, 'id'>) } });
  });
  return map;
}

/**
 * Apply balance deltas to already-loaded accounts. Because the accounts were
 * read inside the same transaction, the new balance is exact and serialised
 * against every other write to the same account.
 */
export function applyDeltas(t: Transaction, accounts: Map<string, LoadedAccount>, deltas: Map<string, number>, uid: string): void {
  for (const [id, delta] of deltas) {
    const acct = accounts.get(id);
    if (!acct) fail('not_found', 'An account involved in this entry no longer exists.');
    const next = acct.data.balanceMinor + delta;
    if (!isMinor(next)) fail('invalid_input', 'The resulting balance is out of range.');
    t.update(acct.ref, { balanceMinor: next, updatedBy: uid, updatedAt: createdMeta(uid).updatedAt });
    acct.data = { ...acct.data, balanceMinor: next };
  }
}

export function ledgerDelta(before: LedgerTransaction | null, after: LedgerTransaction | null): Map<string, number> {
  return effectDelta(before, after);
}

/** Stored transaction document → domain object. */
export function toLedger(id: string, d: FirebaseFirestore.DocumentData): LedgerTransaction {
  return {
    id,
    type: d.type,
    status: d.status,
    amountMinor: d.amountMinor,
    currency: d.currency,
    date: d.date,
    accountId: d.accountId ?? null,
    toAccountId: d.toAccountId ?? null,
    categoryId: d.categoryId ?? null,
    nature: d.nature ?? null,
    adjustmentDirection: d.adjustmentDirection ?? null,
    description: d.description ?? '',
    payee: d.payee ?? null,
    reference: d.reference ?? null,
    debtId: d.debtId ?? null,
    invoiceId: d.invoiceId ?? null,
    refundOfId: d.refundOfId ?? null,
    projectId: d.projectId ?? null,
    clientId: d.clientId ?? null,
    goalId: d.goalId ?? null,
  };
}

export function fromInput(input: TransactionInput, currency: string): Omit<LedgerTransaction, 'id' | 'status'> {
  return {
    ...input,
    currency: currency as LedgerTransaction['currency'],
    toAccountId: input.type === 'transfer' ? input.toAccountId : null,
    adjustmentDirection: input.type === 'adjustment' ? input.adjustmentDirection : null,
    nature: input.type === 'expense' ? input.nature : null,
    categoryId: input.type === 'transfer' || input.type === 'adjustment' ? null : input.categoryId,
    refundOfId: input.type === 'refund' ? input.refundOfId : null,
    debtId: null,
    invoiceId: null,
  };
}

/** Category must exist (built-in or tenant custom, not archived) and match the entry kind. */
export async function checkCategory(t: Transaction, tenantId: string, type: string, categoryId: string | null): Promise<void> {
  if (type !== 'income' && type !== 'expense' && type !== 'refund') return;
  if (!categoryId) fail('invalid_input', 'Choose a category.', { categoryId: 'Choose a category' });
  const expected = type === 'income' ? 'income' : 'expense';
  const builtIn = DEFAULT_CATEGORIES.find((c) => c.id === categoryId);
  if (builtIn) {
    if (builtIn.kind !== expected) fail('invalid_input', `Choose an ${expected} category.`, { categoryId: `Choose an ${expected} category` });
    return;
  }
  const snap = await t.get(tenantRef(tenantId).collection('categories').doc(categoryId));
  const c = snap.data();
  if (!c || c.archived) fail('invalid_input', 'That category does not exist.', { categoryId: 'Unknown category' });
  if (c.kind !== expected) fail('invalid_input', `Choose an ${expected} category.`, { categoryId: `Choose an ${expected} category` });
}

/** Linked records must exist in the same tenant (prevents dangling or forged references). */
export async function checkLinks(
  t: Transaction,
  tenantId: string,
  links: { projectId?: string | null; clientId?: string | null; goalId?: string | null },
): Promise<void> {
  const checks: [string, string][] = [];
  if (links.projectId) checks.push(['projects', links.projectId]);
  if (links.clientId) checks.push(['clients', links.clientId]);
  if (links.goalId) checks.push(['goals', links.goalId]);
  if (checks.length === 0) return;
  const snaps = await t.getAll(...checks.map(([col, id]) => tenantRef(tenantId).collection(col).doc(id)));
  snaps.forEach((s, i) => {
    if (!s.exists) fail('invalid_input', `The linked ${checks[i]![0].slice(0, -1)} does not exist.`);
  });
}

export function ledgerDocument(tx: Omit<LedgerTransaction, 'id'>, uid: string) {
  return { ...tx, version: 1, refundedMinor: 0, voidedAt: null, voidedBy: null, voidReason: null, ...createdMeta(uid) };
}
