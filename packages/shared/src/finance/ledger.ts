import { assertMinor, sumMinor } from '../money';
import type { Account, Debt, LedgerTransaction } from './types';
import { LIQUID_ACCOUNT_TYPES, LOAN_TYPES } from './types';

export interface AccountEffect {
  accountId: string;
  deltaMinor: number;
}

/**
 * THE definition of how a ledger entry changes account balances.
 * Every balance in the system (account cards, dashboard, reports,
 * reconciliation, Cloud Functions) derives from this function.
 */
export function accountEffects(tx: LedgerTransaction): AccountEffect[] {
  if (tx.status !== 'posted') return [];
  const amount = assertMinor(tx.amountMinor);
  const acct = tx.accountId;
  switch (tx.type) {
    case 'income':
    case 'refund':
    case 'loan_receipt':
    case 'repayment_received':
      return acct ? [{ accountId: acct, deltaMinor: amount }] : [];
    case 'expense':
    case 'loan_disbursement':
    case 'repayment_made':
      return acct ? [{ accountId: acct, deltaMinor: -amount }] : [];
    case 'adjustment':
      if (!acct) return [];
      return [{ accountId: acct, deltaMinor: tx.adjustmentDirection === 'decrease' ? -amount : amount }];
    case 'transfer':
      if (!acct || !tx.toAccountId) return [];
      return [
        { accountId: acct, deltaMinor: -amount },
        { accountId: tx.toAccountId, deltaMinor: amount },
      ];
  }
}

/** Net change per account when `before` is replaced by `after` (either may be null for create/void). */
export function effectDelta(before: LedgerTransaction | null, after: LedgerTransaction | null): Map<string, number> {
  const delta = new Map<string, number>();
  for (const e of before ? accountEffects(before) : []) delta.set(e.accountId, (delta.get(e.accountId) ?? 0) - e.deltaMinor);
  for (const e of after ? accountEffects(after) : []) delta.set(e.accountId, (delta.get(e.accountId) ?? 0) + e.deltaMinor);
  for (const [k, v] of delta) if (v === 0) delta.delete(k);
  return delta;
}

/** Recompute balances from scratch: opening balance + Σ effects. */
export function computeBalances(
  accounts: Pick<Account, 'id' | 'openingBalanceMinor'>[],
  transactions: LedgerTransaction[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const a of accounts) balances.set(a.id, assertMinor(a.openingBalanceMinor));
  for (const tx of transactions) {
    for (const e of accountEffects(tx)) {
      if (!balances.has(e.accountId)) continue; // entry for an unknown account — reported by validateLedger
      balances.set(e.accountId, (balances.get(e.accountId) ?? 0) + e.deltaMinor);
    }
  }
  return balances;
}

export interface ReconciliationResult {
  accountId: string;
  storedMinor: number;
  computedMinor: number;
  driftMinor: number;
}

/** Compare the denormalized balances with the ledger. Any non-zero drift is a defect. */
export function reconcileAccounts(accounts: Account[], transactions: LedgerTransaction[]): ReconciliationResult[] {
  const computed = computeBalances(accounts, transactions);
  return accounts.map((a) => {
    const c = computed.get(a.id) ?? a.openingBalanceMinor;
    return { accountId: a.id, storedMinor: a.balanceMinor, computedMinor: c, driftMinor: a.balanceMinor - c };
  });
}

export interface NetPosition {
  /** Σ balances of all non-archived accounts in the currency (credit accounts are typically negative). */
  accountsMinor: number;
  liquidMinor: number;
  /** Outstanding money others owe me. */
  receivablesMinor: number;
  /** Outstanding money I owe others. */
  payablesMinor: number;
  /** accounts + receivables − payables */
  netMinor: number;
}

export function outstandingMinor(debt: Pick<Debt, 'principalMinor' | 'paidMinor' | 'status'>): number {
  if (debt.status === 'void') return 0;
  return Math.max(0, debt.principalMinor - debt.paidMinor);
}

export function netPosition(
  accounts: Pick<Account, 'balanceMinor' | 'type' | 'archived' | 'currency'>[],
  debts: Pick<Debt, 'direction' | 'principalMinor' | 'paidMinor' | 'status' | 'currency'>[],
  currency: string,
): NetPosition {
  const live = accounts.filter((a) => a.currency === currency);
  const accountsMinor = sumMinor(live.map((a) => a.balanceMinor));
  const liquidMinor = sumMinor(
    live.filter((a) => !a.archived && LIQUID_ACCOUNT_TYPES.includes(a.type)).map((a) => a.balanceMinor),
  );
  const ds = debts.filter((d) => d.currency === currency);
  const receivablesMinor = sumMinor(ds.filter((d) => d.direction === 'lent').map(outstandingMinor));
  const payablesMinor = sumMinor(ds.filter((d) => d.direction === 'borrowed').map(outstandingMinor));
  return { accountsMinor, liquidMinor, receivablesMinor, payablesMinor, netMinor: accountsMinor + receivablesMinor - payablesMinor };
}

export type LedgerIssue = { field: string; message: string };

/**
 * Structural validity of a ledger entry. Server functions reject any entry
 * with issues; the UI uses the same function for inline validation.
 */
export function validateTransaction(
  tx: Omit<LedgerTransaction, 'id' | 'status'>,
  accounts: Map<string, Pick<Account, 'currency' | 'archived'>>,
): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  if (!Number.isSafeInteger(tx.amountMinor) || tx.amountMinor <= 0) {
    issues.push({ field: 'amountMinor', message: 'Amount must be greater than zero.' });
  }
  const isLoan = LOAN_TYPES.includes(tx.type);
  const needsAccount = !isLoan;
  const checkAccount = (field: 'accountId' | 'toAccountId', id: string | null) => {
    if (!id) return;
    const a = accounts.get(id);
    if (!a) issues.push({ field, message: 'Account not found.' });
    else {
      if (a.archived) issues.push({ field, message: 'Account is archived.' });
      if (a.currency !== tx.currency) issues.push({ field, message: `Account currency is ${a.currency}, not ${tx.currency}.` });
    }
  };
  if (needsAccount && !tx.accountId) issues.push({ field: 'accountId', message: 'Choose an account.' });
  checkAccount('accountId', tx.accountId);

  if (tx.type === 'transfer') {
    if (!tx.toAccountId) issues.push({ field: 'toAccountId', message: 'Choose the destination account.' });
    else if (tx.toAccountId === tx.accountId) issues.push({ field: 'toAccountId', message: 'Source and destination must differ.' });
    checkAccount('toAccountId', tx.toAccountId);
  } else if (tx.toAccountId) {
    issues.push({ field: 'toAccountId', message: 'Only transfers have a destination account.' });
  }
  if (tx.type === 'adjustment' && !tx.adjustmentDirection) {
    issues.push({ field: 'adjustmentDirection', message: 'Choose whether the adjustment increases or decreases the balance.' });
  }
  if (tx.type !== 'adjustment' && tx.adjustmentDirection) {
    issues.push({ field: 'adjustmentDirection', message: 'Only adjustments have a direction.' });
  }
  if ((tx.type === 'income' || tx.type === 'expense' || tx.type === 'refund') && !tx.categoryId) {
    issues.push({ field: 'categoryId', message: 'Choose a category.' });
  }
  if (tx.type !== 'expense' && tx.nature) issues.push({ field: 'nature', message: 'Only expenses have a spending nature.' });
  if (isLoan && !tx.debtId) issues.push({ field: 'debtId', message: 'Loan entries must reference a debt.' });
  if (!isLoan && tx.debtId) issues.push({ field: 'debtId', message: 'Only loan entries reference a debt.' });
  return issues;
}
