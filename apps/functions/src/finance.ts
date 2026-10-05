import { FieldValue } from 'firebase-admin/firestore';
import {
  LOAN_TYPES,
  computeBalances,
  createAccountInput,
  createDebtInput,
  createTransactionInput,
  deleteBudgetInput,
  reconcileInput,
  recordRepaymentInput,
  saveBudgetInput,
  saveSavingsGoalInput,
  savingsMovementInput,
  updateAccountInput,
  updateDebtInput,
  updateTransactionInput,
  validateRepayment,
  validateSavingsMovement,
  validateTransaction,
  voidDebtInput,
  voidTransactionInput,
  type Account,
  type Debt,
  type LedgerTransaction,
} from '@profjero/shared';
import { audit, createdMeta, db, fail, getOrFail, idempotent, requireMemberTx, tenantCallable, tenantRef, updatedMeta } from './lib/core';
import {
  accountsCol,
  applyDeltas,
  checkCategory,
  checkLinks,
  fromInput,
  ledgerDelta,
  ledgerDocument,
  loadAccounts,
  toLedger,
  transactionsCol,
} from './lib/ledger';

const issuesToFields = (issues: { field: string; message: string }[]) => Object.fromEntries(issues.map((i) => [i.field, i.message]));
const accountView = (m: Map<string, { data: Account }>) => new Map([...m].map(([k, v]) => [k, v.data]));

async function tenantCurrency(t: FirebaseFirestore.Transaction, tenantId: string): Promise<string> {
  const tenant = await getOrFail(t, tenantRef(tenantId), 'workspace');
  return tenant.currency as string;
}

// ═══════════════════════════════ Accounts ═══════════════════════════════

export const createAccount = tenantCallable('finance.manage', createAccountInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.manage');
    const { replay, commit } = await idempotent<{ accountId: string }>(t, ctx, input.requestId, 'account.create');
    if (replay) return replay;
    const ref = accountsCol(ctx.tenantId).doc();
    const a = input.account;
    t.create(ref, { ...a, balanceMinor: a.openingBalanceMinor, archived: false, ...createdMeta(ctx.uid) });
    audit(t, ctx, 'finance.account.create', { type: 'account', id: ref.id }, { name: a.name, type: a.type, openingBalanceMinor: a.openingBalanceMinor });
    const result = { accountId: ref.id };
    commit(result);
    return result;
  }),
);

/** Changing the opening balance shifts the current balance by exactly the same amount. */
export const updateAccount = tenantCallable('finance.manage', updateAccountInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.manage');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'account.update');
    if (replay) return replay;
    const ref = accountsCol(ctx.tenantId).doc(input.accountId);
    const before = await getOrFail<Account>(t, ref, 'account');
    const c = input.changes;
    const update: Record<string, unknown> = { ...updatedMeta(ctx.uid) };
    if (c.name !== undefined) update.name = c.name;
    if (c.type !== undefined) update.type = c.type;
    if (c.archived !== undefined) update.archived = c.archived;
    if (c.openingBalanceMinor !== undefined && c.openingBalanceMinor !== before.openingBalanceMinor) {
      update.openingBalanceMinor = c.openingBalanceMinor;
      update.balanceMinor = before.balanceMinor + (c.openingBalanceMinor - before.openingBalanceMinor);
    }
    t.update(ref, update);
    audit(t, ctx, 'finance.account.update', { type: 'account', id: input.accountId }, {
      changed: Object.keys(c),
      ...(update.openingBalanceMinor !== undefined ? { openingBalanceFrom: before.openingBalanceMinor, openingBalanceTo: c.openingBalanceMinor } : {}),
    });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

// ═════════════════════════════ Transactions ═════════════════════════════

export const createTransaction = tenantCallable('finance.write', createTransactionInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ transactionId: string }>(t, ctx, input.requestId, 'transaction.create');
    if (replay) return replay;

    const currency = await tenantCurrency(t, ctx.tenantId);
    const entry = fromInput(input.transaction, currency);
    const accounts = await loadAccounts(t, ctx.tenantId, [entry.accountId, entry.toAccountId]);
    const issues = validateTransaction(entry, accountView(accounts));
    if (issues.length) fail('invalid_input', issues[0]!.message, issuesToFields(issues));
    await checkCategory(t, ctx.tenantId, entry.type, entry.categoryId);
    await checkLinks(t, ctx.tenantId, entry);

    // Refunds: must reference a posted expense and cannot exceed what is left to refund.
    let original: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData } | null = null;
    if (entry.type === 'refund' && entry.refundOfId) {
      const ref = transactionsCol(ctx.tenantId).doc(entry.refundOfId);
      const data = await getOrFail(t, ref, 'original expense');
      if (data.type !== 'expense' || data.status !== 'posted') fail('invalid_input', 'Refunds must reference a posted expense.');
      if (entry.amountMinor > data.amountMinor - (data.refundedMinor ?? 0)) {
        fail('invalid_input', 'The refund is larger than the amount still refundable.', { amountMinor: 'Larger than the refundable amount' });
      }
      original = { ref, data };
    }

    const ref = transactionsCol(ctx.tenantId).doc();
    const full: LedgerTransaction = { ...entry, id: ref.id, status: 'posted' };
    applyDeltas(t, accounts, ledgerDelta(null, full), ctx.uid);
    t.create(ref, ledgerDocument({ ...entry, status: 'posted' }, ctx.uid));
    if (original) t.update(original.ref, { refundedMinor: FieldValue.increment(entry.amountMinor), ...updatedMeta(ctx.uid) });
    audit(t, ctx, 'finance.transaction.create', { type: 'transaction', id: ref.id }, { type: entry.type, amountMinor: entry.amountMinor, date: entry.date });
    const result = { transactionId: ref.id };
    commit(result);
    return result;
  }),
);

/**
 * Edits use optimistic concurrency: the caller sends the version it edited.
 * If anyone changed the entry since (another tab, another member), the edit is
 * rejected rather than silently overwriting it.
 */
export const updateTransaction = tenantCallable('finance.write', updateTransactionInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ version: number }>(t, ctx, input.requestId, 'transaction.update');
    if (replay) return replay;

    const ref = transactionsCol(ctx.tenantId).doc(input.transactionId);
    const stored = await getOrFail(t, ref, 'transaction');
    if (stored.version !== input.expectedVersion) fail('conflict');
    if (stored.status !== 'posted') fail('conflict', 'Voided entries cannot be edited.');
    if (LOAN_TYPES.includes(stored.type) || stored.invoiceId) {
      fail('conflict', 'Loan and invoice payments are managed from the debt or invoice. Void and re-record instead.');
    }
    const before = toLedger(ref.id, stored);
    const entry = fromInput(input.transaction, stored.currency);
    if (stored.refundOfId !== (entry.refundOfId ?? null)) fail('invalid_input', 'The refunded expense cannot be changed. Void and re-record instead.');
    if ((stored.refundedMinor ?? 0) > 0) {
      if (entry.type !== 'expense') fail('conflict', 'This expense has refunds. Void the refunds before changing its type.');
      if (entry.amountMinor < stored.refundedMinor) fail('invalid_input', 'The amount cannot be lower than what has already been refunded.');
    }
    const after: LedgerTransaction = { ...entry, id: ref.id, status: 'posted' };
    const accounts = await loadAccounts(t, ctx.tenantId, [before.accountId, before.toAccountId, after.accountId, after.toAccountId]);
    // Validate only against accounts the new version uses.
    const newAccounts = new Map([...accountView(accounts)].filter(([id]) => id === after.accountId || id === after.toAccountId));
    const issues = validateTransaction(entry, newAccounts);
    if (issues.length) fail('invalid_input', issues[0]!.message, issuesToFields(issues));
    await checkCategory(t, ctx.tenantId, entry.type, entry.categoryId);
    await checkLinks(t, ctx.tenantId, entry);

    let original: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData } | null = null;
    if (entry.type === 'refund' && entry.refundOfId) {
      const oRef = transactionsCol(ctx.tenantId).doc(entry.refundOfId);
      const data = await getOrFail(t, oRef, 'original expense');
      const refundable = data.amountMinor - (data.refundedMinor ?? 0) + before.amountMinor;
      if (entry.amountMinor > refundable) fail('invalid_input', 'The refund is larger than the amount still refundable.');
      original = { ref: oRef, data };
    }

    applyDeltas(t, accounts, ledgerDelta(before, after), ctx.uid);
    const version = stored.version + 1;
    t.update(ref, { ...entry, version, ...updatedMeta(ctx.uid) });
    if (original && entry.amountMinor !== before.amountMinor) {
      t.update(original.ref, { refundedMinor: FieldValue.increment(entry.amountMinor - before.amountMinor) });
    }
    audit(t, ctx, 'finance.transaction.update', { type: 'transaction', id: ref.id }, {
      before: { type: before.type, amountMinor: before.amountMinor, date: before.date, accountId: before.accountId, toAccountId: before.toAccountId },
      after: { type: after.type, amountMinor: after.amountMinor, date: after.date, accountId: after.accountId, toAccountId: after.toAccountId },
    });
    commit({ version });
    return { version };
  }),
);

/**
 * Financial entries are never hard-deleted. Voiding keeps the record (with who,
 * when and why), reverses its effect on balances, and keeps linked debts,
 * invoices and refunded expenses consistent.
 */
export const voidTransaction = tenantCallable('finance.write', voidTransactionInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'transaction.void');
    if (replay) return replay;
    const ref = transactionsCol(ctx.tenantId).doc(input.transactionId);
    const stored = await getOrFail(t, ref, 'transaction');
    if (stored.status === 'void') fail('conflict', 'This entry is already void.');
    if (stored.type === 'loan_disbursement' || stored.type === 'loan_receipt') {
      fail('conflict', 'This entry records the loan itself. Void the debt instead.');
    }
    if ((stored.refundedMinor ?? 0) > 0) fail('conflict', 'Void the refunds linked to this expense first.');
    const before = toLedger(ref.id, stored);
    const accounts = await loadAccounts(t, ctx.tenantId, [before.accountId, before.toAccountId]);

    // Linked records (read before any write).
    const debtRef = stored.debtId ? tenantRef(ctx.tenantId).collection('debts').doc(stored.debtId) : null;
    const debt = debtRef ? await getOrFail<Debt>(t, debtRef, 'debt') : null;
    const invoiceRef = stored.invoiceId ? tenantRef(ctx.tenantId).collection('invoices').doc(stored.invoiceId) : null;
    const invoice = invoiceRef ? await getOrFail(t, invoiceRef, 'invoice') : null;
    const refundOfRef = stored.refundOfId ? transactionsCol(ctx.tenantId).doc(stored.refundOfId) : null;
    if (refundOfRef) await getOrFail(t, refundOfRef, 'original expense');

    applyDeltas(t, accounts, ledgerDelta(before, null), ctx.uid);
    t.update(ref, {
      status: 'void',
      version: stored.version + 1,
      voidedAt: FieldValue.serverTimestamp(),
      voidedBy: ctx.uid,
      voidReason: input.reason,
      ...updatedMeta(ctx.uid),
    });
    if (debtRef && debt) {
      const paid = debt.paidMinor - stored.amountMinor;
      t.update(debtRef, { paidMinor: paid, status: debt.status === 'void' ? 'void' : paid >= debt.principalMinor ? 'settled' : 'open', ...updatedMeta(ctx.uid) });
    }
    if (invoiceRef && invoice) {
      const paid = invoice.paidMinor - stored.amountMinor;
      t.update(invoiceRef, { paidMinor: paid, status: invoice.status === 'void' ? 'void' : paid >= invoice.totalMinor ? 'paid' : paid > 0 ? 'partially_paid' : 'sent', ...updatedMeta(ctx.uid) });
      t.create(invoiceRef.collection('events').doc(), { kind: 'payment_voided', amountMinor: stored.amountMinor, transactionId: ref.id, by: ctx.uid, at: FieldValue.serverTimestamp() });
    }
    if (refundOfRef) t.update(refundOfRef, { refundedMinor: FieldValue.increment(-stored.amountMinor) });
    audit(t, ctx, 'finance.transaction.void', { type: 'transaction', id: ref.id }, { reason: input.reason, type: stored.type, amountMinor: stored.amountMinor });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

// ═══════════════════════════════ Debts ═══════════════════════════════

const debtsCol = (tenantId: string) => tenantRef(tenantId).collection('debts');

export const createDebt = tenantCallable('finance.write', createDebtInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ debtId: string }>(t, ctx, input.requestId, 'debt.create');
    if (replay) return replay;
    const d = input.debt;
    if (d.dueDate && d.dueDate < d.date) fail('invalid_input', 'The due date cannot be before the loan date.', { dueDate: 'Before the loan date' });
    const accounts = await loadAccounts(t, ctx.tenantId, [d.accountId]);
    const debtRef = debtsCol(ctx.tenantId).doc();
    let transactionId: string | null = null;
    if (d.accountId) {
      const entry: Omit<LedgerTransaction, 'id' | 'status'> = {
        type: d.direction === 'lent' ? 'loan_disbursement' : 'loan_receipt',
        amountMinor: d.principalMinor, currency: d.currency, date: d.date, accountId: d.accountId, toAccountId: null,
        categoryId: null, nature: null, adjustmentDirection: null,
        description: d.direction === 'lent' ? `Lent to ${d.counterparty}` : `Borrowed from ${d.counterparty}`,
        payee: d.counterparty, reference: null, debtId: debtRef.id, invoiceId: null, refundOfId: null, projectId: null, clientId: null, goalId: null,
      };
      const issues = validateTransaction(entry, accountView(accounts));
      if (issues.length) fail('invalid_input', issues[0]!.message, issuesToFields(issues));
      const txRef = transactionsCol(ctx.tenantId).doc();
      transactionId = txRef.id;
      applyDeltas(t, accounts, ledgerDelta(null, { ...entry, id: txRef.id, status: 'posted' }), ctx.uid);
      t.create(txRef, ledgerDocument({ ...entry, status: 'posted' }, ctx.uid));
    }
    t.create(debtRef, {
      direction: d.direction, counterparty: d.counterparty, principalMinor: d.principalMinor, currency: d.currency,
      date: d.date, dueDate: d.dueDate, notes: d.notes, accountId: d.accountId, principalTransactionId: transactionId,
      paidMinor: 0, status: 'open', ...createdMeta(ctx.uid),
    });
    audit(t, ctx, 'finance.debt.create', { type: 'debt', id: debtRef.id }, { direction: d.direction, principalMinor: d.principalMinor });
    const result = { debtId: debtRef.id };
    commit(result);
    return result;
  }),
);

export const updateDebt = tenantCallable('finance.write', updateDebtInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'debt.update');
    if (replay) return replay;
    const ref = debtsCol(ctx.tenantId).doc(input.debtId);
    const debt = await getOrFail<Debt>(t, ref, 'debt');
    if (debt.status === 'void') fail('conflict', 'This debt has been voided.');
    if (input.changes.dueDate && input.changes.dueDate < debt.date) fail('invalid_input', 'The due date cannot be before the loan date.');
    t.update(ref, { ...input.changes, ...updatedMeta(ctx.uid) });
    audit(t, ctx, 'finance.debt.update', { type: 'debt', id: input.debtId }, { changed: Object.keys(input.changes) });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

/**
 * Partial repayments: the debt's paid amount is read and updated in the same
 * transaction, so concurrent repayments are serialised and can never be
 * double-counted or push the debt past its principal.
 */
export const recordRepayment = tenantCallable('finance.write', recordRepaymentInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ transactionId: string; remainingMinor: number }>(t, ctx, input.requestId, 'debt.repay');
    if (replay) return replay;
    const debtRef = debtsCol(ctx.tenantId).doc(input.debtId);
    const debt = await getOrFail<Debt>(t, debtRef, 'debt');
    const problem = validateRepayment(debt, input.amountMinor);
    if (problem) fail('invalid_input', problem, { amountMinor: problem });
    if (input.date < debt.date) fail('invalid_input', 'A repayment cannot be dated before the loan.', { date: 'Before the loan date' });
    const accounts = await loadAccounts(t, ctx.tenantId, [input.accountId]);
    const entry: Omit<LedgerTransaction, 'id' | 'status'> = {
      type: debt.direction === 'lent' ? 'repayment_received' : 'repayment_made',
      amountMinor: input.amountMinor, currency: debt.currency, date: input.date, accountId: input.accountId, toAccountId: null,
      categoryId: null, nature: null, adjustmentDirection: null,
      description: input.note || (debt.direction === 'lent' ? `Repayment from ${debt.counterparty}` : `Repayment to ${debt.counterparty}`),
      payee: debt.counterparty, reference: null, debtId: input.debtId, invoiceId: null, refundOfId: null, projectId: null, clientId: null, goalId: null,
    };
    const issues = validateTransaction(entry, accountView(accounts));
    if (issues.length) fail('invalid_input', issues[0]!.message, issuesToFields(issues));
    const txRef = transactionsCol(ctx.tenantId).doc();
    applyDeltas(t, accounts, ledgerDelta(null, { ...entry, id: txRef.id, status: 'posted' }), ctx.uid);
    t.create(txRef, ledgerDocument({ ...entry, status: 'posted' }, ctx.uid));
    const paid = debt.paidMinor + input.amountMinor;
    t.update(debtRef, { paidMinor: paid, status: paid >= debt.principalMinor ? 'settled' : 'open', ...updatedMeta(ctx.uid) });
    audit(t, ctx, 'finance.debt.repayment', { type: 'debt', id: input.debtId }, { amountMinor: input.amountMinor, transactionId: txRef.id });
    const result = { transactionId: txRef.id, remainingMinor: debt.principalMinor - paid };
    commit(result);
    return result;
  }),
);

/** Voids the debt and every ledger entry linked to it, reversing their balance effects. */
export const voidDebt = tenantCallable('finance.manage', voidDebtInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.manage');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'debt.void');
    if (replay) return replay;
    const debtRef = debtsCol(ctx.tenantId).doc(input.debtId);
    const debt = await getOrFail<Debt>(t, debtRef, 'debt');
    if (debt.status === 'void') fail('conflict', 'This debt is already void.');
    const linked = await t.get(transactionsCol(ctx.tenantId).where('debtId', '==', input.debtId).where('status', '==', 'posted'));
    const entries = linked.docs.map((d) => toLedger(d.id, d.data()));
    const accounts = await loadAccounts(t, ctx.tenantId, entries.map((e) => e.accountId));
    const total = new Map<string, number>();
    for (const e of entries) for (const [k, v] of ledgerDelta(e, null)) total.set(k, (total.get(k) ?? 0) + v);
    applyDeltas(t, accounts, total, ctx.uid);
    for (const d of linked.docs) {
      t.update(d.ref, { status: 'void', version: (d.data().version ?? 1) + 1, voidedAt: FieldValue.serverTimestamp(), voidedBy: ctx.uid, voidReason: `Debt voided: ${input.reason}`, ...updatedMeta(ctx.uid) });
    }
    t.update(debtRef, { status: 'void', voidReason: input.reason, voidedBy: ctx.uid, voidedAt: FieldValue.serverTimestamp(), ...updatedMeta(ctx.uid) });
    audit(t, ctx, 'finance.debt.void', { type: 'debt', id: input.debtId }, { reason: input.reason, voidedEntries: linked.size });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

// ═══════════════════════════════ Budgets ═══════════════════════════════

export const saveBudget = tenantCallable('finance.write', saveBudgetInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ budgetId: string }>(t, ctx, input.requestId, 'budget.save');
    if (replay) return replay;
    const b = input.budget;
    if (b.period.kind === 'custom' && b.period.start > b.period.end) fail('invalid_input', 'The budget period ends before it starts.');
    for (const c of b.categoryIds) await checkCategory(t, ctx.tenantId, 'expense', c);
    const col = tenantRef(ctx.tenantId).collection('budgets');
    const ref = input.budgetId ? col.doc(input.budgetId) : col.doc();
    if (input.budgetId) {
      await getOrFail(t, ref, 'budget');
      t.update(ref, { ...b, ...updatedMeta(ctx.uid) });
    } else {
      t.create(ref, { ...b, ...createdMeta(ctx.uid) });
    }
    audit(t, ctx, input.budgetId ? 'finance.budget.update' : 'finance.budget.create', { type: 'budget', id: ref.id }, { amountMinor: b.amountMinor });
    const result = { budgetId: ref.id };
    commit(result);
    return result;
  }),
);

export const deleteBudget = tenantCallable('finance.write', deleteBudgetInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'budget.delete');
    if (replay) return replay;
    const ref = tenantRef(ctx.tenantId).collection('budgets').doc(input.budgetId);
    const before = await getOrFail(t, ref, 'budget');
    t.delete(ref); // budgets are plans, not financial records; the audit log keeps what was deleted
    audit(t, ctx, 'finance.budget.delete', { type: 'budget', id: input.budgetId }, { name: before.name, amountMinor: before.amountMinor });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

// ═══════════════════════════════ Savings ═══════════════════════════════

const savingsCol = (tenantId: string) => tenantRef(tenantId).collection('savingsGoals');

export const saveSavingsGoal = tenantCallable('finance.write', saveSavingsGoalInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ goalId: string }>(t, ctx, input.requestId, 'savings.save');
    if (replay) return replay;
    const g = input.goal;
    if (g.accountId) {
      const accounts = await loadAccounts(t, ctx.tenantId, [g.accountId]);
      const a = accounts.get(g.accountId);
      if (!a) fail('invalid_input', 'Account not found.', { accountId: 'Account not found' });
      if (a.data.currency !== g.currency) fail('invalid_input', 'The account currency does not match the goal.');
    }
    const ref = input.goalId ? savingsCol(ctx.tenantId).doc(input.goalId) : savingsCol(ctx.tenantId).doc();
    if (input.goalId) {
      const before = await getOrFail(t, ref, 'savings goal');
      if (before.currency !== g.currency && before.savedMinor > 0) fail('conflict', 'The currency cannot change after contributions exist.');
      t.update(ref, { ...g, ...(input.status ? { status: input.status } : {}), ...updatedMeta(ctx.uid) });
    } else {
      const tenant = await getOrFail(t, tenantRef(ctx.tenantId), 'workspace');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tenant.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      t.create(ref, { ...g, savedMinor: 0, status: 'active', createdDate: today, ...createdMeta(ctx.uid) });
    }
    audit(t, ctx, input.goalId ? 'finance.savings.update' : 'finance.savings.create', { type: 'savingsGoal', id: ref.id }, { targetMinor: g.targetMinor });
    const result = { goalId: ref.id };
    commit(result);
    return result;
  }),
);

/**
 * Contributions allocate money to a goal. If the goal has an account and the
 * caller names a source account, the deposit also records a real transfer
 * (source → goal account) in the same transaction.
 */
export const recordSavingsMovement = tenantCallable('finance.write', savingsMovementInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ contributionId: string; savedMinor: number }>(t, ctx, input.requestId, 'savings.movement');
    if (replay) return replay;
    const goalRef = savingsCol(ctx.tenantId).doc(input.goalId);
    const goal = await getOrFail(t, goalRef, 'savings goal');
    if (goal.status === 'archived') fail('conflict', 'This goal is archived.');
    const problem = validateSavingsMovement(goal.savedMinor, input.kind, input.amountMinor);
    if (problem) fail('invalid_input', problem, { amountMinor: problem });

    const withTransfer = input.kind === 'deposit' && !!input.fromAccountId && !!goal.accountId && input.fromAccountId !== goal.accountId;
    const accounts = withTransfer ? await loadAccounts(t, ctx.tenantId, [input.fromAccountId, goal.accountId]) : new Map();
    let transactionId: string | null = null;
    if (withTransfer) {
      const entry: Omit<LedgerTransaction, 'id' | 'status'> = {
        type: 'transfer', amountMinor: input.amountMinor, currency: goal.currency, date: input.date,
        accountId: input.fromAccountId, toAccountId: goal.accountId, categoryId: null, nature: null, adjustmentDirection: null,
        description: `Savings: ${goal.name}`, payee: null, reference: null, debtId: null, invoiceId: null, refundOfId: null,
        projectId: null, clientId: null, goalId: null,
      };
      const issues = validateTransaction(entry, accountView(accounts));
      if (issues.length) fail('invalid_input', issues[0]!.message, issuesToFields(issues));
      const txRef = transactionsCol(ctx.tenantId).doc();
      transactionId = txRef.id;
      applyDeltas(t, accounts, ledgerDelta(null, { ...entry, id: txRef.id, status: 'posted' }), ctx.uid);
      t.create(txRef, ledgerDocument({ ...entry, status: 'posted' }, ctx.uid));
    }
    const saved = goal.savedMinor + (input.kind === 'deposit' ? input.amountMinor : -input.amountMinor);
    const contribRef = tenantRef(ctx.tenantId).collection('savingsContributions').doc();
    t.create(contribRef, { goalId: input.goalId, kind: input.kind, amountMinor: input.amountMinor, date: input.date, note: input.note, transactionId, ...createdMeta(ctx.uid) });
    t.update(goalRef, { savedMinor: saved, status: saved >= goal.targetMinor ? 'achieved' : 'active', ...updatedMeta(ctx.uid) });
    audit(t, ctx, `finance.savings.${input.kind}`, { type: 'savingsGoal', id: input.goalId }, { amountMinor: input.amountMinor, transactionId });
    const result = { contributionId: contribRef.id, savedMinor: saved };
    commit(result);
    return result;
  }),
);

// ═════════════════════════════ Reconciliation ═════════════════════════════

/**
 * Recomputes every account balance from the ledger and reports drift. With
 * fix=true each account is corrected inside its own transaction that re-reads
 * the account's entries, so concurrent writes cannot be lost.
 */
export const reconcileAccounts = tenantCallable('finance.manage', reconcileInput, async (input, ctx) => {
  const accountsSnap = await accountsCol(ctx.tenantId).get();
  const report: { accountId: string; name: string; storedMinor: number; computedMinor: number; driftMinor: number }[] = [];
  for (const a of accountsSnap.docs) {
    const outcome = await db.runTransaction(async (t) => {
      const acct = await t.get(a.ref);
      const data = acct.data() as Account;
      const [from, to] = await Promise.all([
        t.get(transactionsCol(ctx.tenantId).where('accountId', '==', a.id)),
        t.get(transactionsCol(ctx.tenantId).where('toAccountId', '==', a.id)),
      ]);
      const seen = new Set<string>();
      const entries = [...from.docs, ...to.docs].filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => toLedger(d.id, d.data()));
      const computed = computeBalances([{ id: a.id, openingBalanceMinor: data.openingBalanceMinor }], entries).get(a.id)!;
      const drift = data.balanceMinor - computed;
      if (drift !== 0 && input.fix) {
        t.update(a.ref, { balanceMinor: computed, ...updatedMeta(ctx.uid) });
        audit(t, ctx, 'finance.account.reconcile', { type: 'account', id: a.id }, { storedMinor: data.balanceMinor, computedMinor: computed });
      }
      return { accountId: a.id, name: data.name, storedMinor: data.balanceMinor, computedMinor: computed, driftMinor: drift };
    });
    report.push(outcome);
  }
  return { accounts: report, fixed: input.fix };
});
