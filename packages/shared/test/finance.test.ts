import { describe, expect, it } from 'vitest';
import {
  type Budget,
  type Debt,
  accountEffects,
  computeBalances,
  computeInvoiceTotals,
  debtState,
  effectDelta,
  evaluateBudget,
  flowsByAccount,
  invoicePaymentStatus,
  monthlySeries,
  netPosition,
  nextOccurrence,
  reconcileAccounts,
  savingsProgress,
  spendingByCategory,
  spendingByNature,
  summarize,
  validateInvoicePayment,
  validateRepayment,
  validateSavingsMovement,
  validateTransaction,
} from '../src';
import { account, tx } from './fixtures';

const MARCH = { start: '2026-03-01', end: '2026-03-31' };

describe('ledger effects', () => {
  it('income increases and expense decreases the account', () => {
    const accts = [account('momo', 10000)];
    const b = computeBalances(accts, [tx({ type: 'income', amountMinor: 5000 }), tx({ type: 'expense', amountMinor: 1250 })]);
    expect(b.get('momo')).toBe(13750);
  });

  it('a GH₵500 transfer MoMo → Bank moves money without changing net position', () => {
    const accts = [account('momo', 100000, { type: 'mobile_money' }), account('bank', 20000)];
    const transfer = tx({ type: 'transfer', amountMinor: 50000, accountId: 'momo', toAccountId: 'bank' });
    const before = computeBalances(accts, []);
    const after = computeBalances(accts, [transfer]);
    expect(after.get('momo')).toBe(before.get('momo')! - 50000);
    expect(after.get('bank')).toBe(before.get('bank')! + 50000);
    const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    expect(total(after)).toBe(total(before));
    const s = summarize([transfer], MARCH, 'GHS');
    expect(s.incomeMinor).toBe(0);
    expect(s.netSpendingMinor).toBe(0);
    expect(s.cashFlowMinor).toBe(0);
  });

  it('refunds increase the account and reduce spending in their category', () => {
    const txs = [
      tx({ type: 'expense', amountMinor: 20000, categoryId: 'shopping' }),
      tx({ type: 'refund', amountMinor: 5000, categoryId: 'shopping' }),
    ];
    expect(computeBalances([account('momo', 0)], txs).get('momo')).toBe(-15000);
    const s = summarize(txs, MARCH, 'GHS');
    expect(s.grossSpendingMinor).toBe(20000);
    expect(s.refundsMinor).toBe(5000);
    expect(s.netSpendingMinor).toBe(15000);
    expect(spendingByCategory(txs, MARCH, 'GHS')[0]).toMatchObject({ categoryId: 'shopping', netMinor: 15000 });
  });

  it('adjustments change balances but are neither income nor spending', () => {
    const txs = [
      tx({ type: 'adjustment', amountMinor: 700, adjustmentDirection: 'increase' }),
      tx({ type: 'adjustment', amountMinor: 200, adjustmentDirection: 'decrease' }),
    ];
    expect(computeBalances([account('momo', 0)], txs).get('momo')).toBe(500);
    const s = summarize(txs, MARCH, 'GHS');
    expect(s.incomeMinor).toBe(0);
    expect(s.netSpendingMinor).toBe(0);
    expect(s.adjustmentsMinor).toBe(500);
  });

  it('void entries have no effect', () => {
    const t = tx({ type: 'expense', amountMinor: 999, status: 'void' });
    expect(accountEffects(t)).toEqual([]);
    expect(summarize([t], MARCH, 'GHS').netSpendingMinor).toBe(0);
  });

  it('editing an entry produces exact balance deltas', () => {
    const before = tx({ type: 'expense', amountMinor: 1000, accountId: 'momo' });
    const after = { ...before, amountMinor: 1500, accountId: 'bank' };
    const d = effectDelta(before, after);
    expect(Object.fromEntries(d)).toEqual({ momo: 1000, bank: -1500 });
    expect(Object.fromEntries(effectDelta(before, null))).toEqual({ momo: 1000 }); // void/reversal
    expect(Object.fromEntries(effectDelta(null, before))).toEqual({ momo: -1000 }); // create
    expect(effectDelta(before, { ...before }).size).toBe(0); // no-op edit
    const tr = tx({ type: 'transfer', amountMinor: 300, accountId: 'momo', toAccountId: 'bank' });
    expect(Object.fromEntries(effectDelta(tr, { ...tr, toAccountId: 'cash' }))).toEqual({ bank: -300, cash: 300 });
  });

  it('cash flow equals the change in total balances for every entry type', () => {
    const accts = [account('momo', 0), account('bank', 0)];
    const txs = [
      tx({ type: 'income', amountMinor: 100000 }),
      tx({ type: 'expense', amountMinor: 30000 }),
      tx({ type: 'refund', amountMinor: 1000 }),
      tx({ type: 'transfer', amountMinor: 20000, toAccountId: 'bank' }),
      tx({ type: 'adjustment', amountMinor: 50, adjustmentDirection: 'decrease' }),
      tx({ type: 'loan_disbursement', amountMinor: 10000, debtId: 'd1' }),
      tx({ type: 'loan_receipt', amountMinor: 5000, debtId: 'd2', accountId: 'bank' }),
      tx({ type: 'repayment_received', amountMinor: 3000, debtId: 'd1' }),
      tx({ type: 'repayment_made', amountMinor: 2000, debtId: 'd2', accountId: 'bank' }),
      tx({ type: 'repayment_made', amountMinor: 999, debtId: 'd2', accountId: null }), // untracked account
    ];
    const balances = computeBalances(accts, txs);
    const totalChange = [...balances.values()].reduce((a, b) => a + b, 0);
    const s = summarize(txs, MARCH, 'GHS');
    expect(s.cashFlowMinor).toBe(totalChange);
    expect(totalChange).toBe(100000 - 30000 + 1000 - 50 - 10000 + 5000 + 3000 - 2000);
    // Loans are not income or spending.
    expect(s.incomeMinor).toBe(100000);
    expect(s.netSpendingMinor).toBe(29000);
    const flows = flowsByAccount(txs, MARCH, 'GHS');
    expect(flows.reduce((a, f) => a + f.netMinor, 0)).toBe(totalChange);
  });

  it('reconciliation detects drift between cached and computed balances', () => {
    const accts = [account('momo', 1000, { balanceMinor: 1500 }), account('bank', 0, { balanceMinor: -200 })];
    const txs = [tx({ type: 'income', amountMinor: 500 }), tx({ type: 'expense', amountMinor: 300, accountId: 'bank' })];
    const r = reconcileAccounts(accts, txs);
    expect(r.find((x) => x.accountId === 'momo')?.driftMinor).toBe(0);
    expect(r.find((x) => x.accountId === 'bank')).toMatchObject({ computedMinor: -300, driftMinor: 100 });
  });

  it('respects period boundaries inclusively and ignores other currencies', () => {
    const txs = [
      tx({ type: 'income', amountMinor: 1, date: '2026-02-28' }),
      tx({ type: 'income', amountMinor: 10, date: '2026-03-01' }),
      tx({ type: 'income', amountMinor: 100, date: '2026-03-31' }),
      tx({ type: 'income', amountMinor: 1000, date: '2026-04-01' }),
      tx({ type: 'income', amountMinor: 5000, date: '2026-03-10', currency: 'USD' }),
    ];
    expect(summarize(txs, MARCH, 'GHS').incomeMinor).toBe(110);
    expect(monthlySeries(txs, { start: '2026-02-01', end: '2026-04-30' }, 'GHS').map((m) => m.incomeMinor)).toEqual([1, 110, 1000]);
  });

  it('savings rate is null without income, never NaN', () => {
    expect(summarize([tx({ type: 'expense', amountMinor: 100 })], MARCH, 'GHS').savingsRatePercent).toBeNull();
    expect(summarize([], MARCH, 'GHS').savingsRatePercent).toBeNull();
    const s = summarize([tx({ type: 'income', amountMinor: 1000 }), tx({ type: 'expense', amountMinor: 750 })], MARCH, 'GHS');
    expect(s.savingsRatePercent).toBe(25);
  });

  it('breaks spending down by need/want', () => {
    const txs = [
      tx({ type: 'expense', amountMinor: 600, nature: 'need' }),
      tx({ type: 'expense', amountMinor: 300, nature: 'want' }),
      tx({ type: 'expense', amountMinor: 100 }),
    ];
    const byNature = spendingByNature(txs, MARCH, 'GHS');
    expect(byNature).toEqual([
      { nature: 'need', grossMinor: 600, sharePercent: 60 },
      { nature: 'want', grossMinor: 300, sharePercent: 30 },
      { nature: 'unclassified', grossMinor: 100, sharePercent: 10 },
    ]);
  });
});

describe('transaction validation', () => {
  const accounts = new Map([
    ['momo', { currency: 'GHS' as const, archived: false }],
    ['bank', { currency: 'GHS' as const, archived: false }],
    ['usd', { currency: 'USD' as const, archived: false }],
    ['old', { currency: 'GHS' as const, archived: true }],
  ]);
  const base = (p: Parameters<typeof tx>[0]) => {
    const { id: _id, status: _s, ...rest } = tx(p);
    return rest;
  };
  it('accepts well-formed entries', () => {
    expect(validateTransaction(base({ type: 'expense', amountMinor: 100 }), accounts)).toEqual([]);
    expect(validateTransaction(base({ type: 'transfer', amountMinor: 100, toAccountId: 'bank' }), accounts)).toEqual([]);
  });
  it('rejects zero, negative and fractional amounts', () => {
    for (const amountMinor of [0, -100, 1.5, Number.NaN]) {
      expect(validateTransaction(base({ type: 'expense', amountMinor }), accounts).map((i) => i.field)).toContain('amountMinor');
    }
  });
  it('rejects self-transfers, missing destinations and currency mismatches', () => {
    expect(validateTransaction(base({ type: 'transfer', amountMinor: 1, toAccountId: 'momo' }), accounts).length).toBeGreaterThan(0);
    expect(validateTransaction(base({ type: 'transfer', amountMinor: 1 }), accounts).length).toBeGreaterThan(0);
    expect(validateTransaction(base({ type: 'transfer', amountMinor: 1, toAccountId: 'usd' }), accounts).length).toBeGreaterThan(0);
    expect(validateTransaction(base({ type: 'expense', amountMinor: 1, accountId: 'old' }), accounts).length).toBeGreaterThan(0);
    expect(validateTransaction(base({ type: 'expense', amountMinor: 1, accountId: 'ghost' }), accounts).length).toBeGreaterThan(0);
  });
  it('enforces type-specific fields', () => {
    expect(validateTransaction(base({ type: 'adjustment', amountMinor: 1 }), accounts).map((i) => i.field)).toContain('adjustmentDirection');
    expect(validateTransaction(base({ type: 'income', amountMinor: 1, categoryId: null }), accounts).map((i) => i.field)).toContain('categoryId');
    expect(validateTransaction(base({ type: 'income', amountMinor: 1, nature: 'want' }), accounts).map((i) => i.field)).toContain('nature');
    expect(validateTransaction(base({ type: 'loan_disbursement', amountMinor: 1 }), accounts).map((i) => i.field)).toContain('debtId');
  });
});

describe('budgets', () => {
  const budget = (amountMinor: number, extra: Partial<Budget> = {}): Budget => ({
    id: 'b1', name: 'Food', categoryIds: ['groceries'], period: { kind: 'monthly' }, amountMinor, currency: 'GHS', accountIds: [], ...extra,
  });
  const spend = (amountMinor: number, date = '2026-03-10', categoryId = 'groceries') => tx({ type: 'expense', amountMinor, date, categoryId });

  it('computes planned, actual, remaining and percentages', () => {
    const e = evaluateBudget(budget(100000), [spend(25000), spend(5000, '2026-02-28'), spend(9999, '2026-03-11', 'shopping')], '2026-03-20');
    expect(e).toMatchObject({ plannedMinor: 100000, actualMinor: 25000, remainingMinor: 75000, exceededMinor: 0, percentUsed: 25, percentRemaining: 75, status: 'on_track', daysLeft: 12 });
  });
  it('flags warning at 80% and exceeded above 100%', () => {
    expect(evaluateBudget(budget(1000), [spend(800)], '2026-03-20').status).toBe('warning');
    expect(evaluateBudget(budget(1000), [spend(1000)], '2026-03-20').status).toBe('at_limit');
    const over = evaluateBudget(budget(1000), [spend(1250)], '2026-03-20');
    expect(over).toMatchObject({ status: 'exceeded', exceededMinor: 250, remainingMinor: 0, percentUsed: 125, percentRemaining: 0 });
  });
  it('handles zero budgets without NaN or Infinity', () => {
    const unused = evaluateBudget(budget(0), [], '2026-03-20');
    expect(unused).toMatchObject({ percentUsed: null, percentRemaining: null, status: 'unused' });
    const spent = evaluateBudget(budget(0), [spend(10)], '2026-03-20');
    expect(spent).toMatchObject({ percentUsed: null, status: 'exceeded', exceededMinor: 10 });
  });
  it('subtracts refunds and never goes below zero', () => {
    const e = evaluateBudget(budget(1000), [spend(300), tx({ type: 'refund', amountMinor: 500, categoryId: 'groceries', date: '2026-03-12' })], '2026-03-20');
    expect(e.actualMinor).toBe(0);
  });
  it('supports custom periods and account filters', () => {
    const b = budget(1000, { period: { kind: 'custom', start: '2026-03-05', end: '2026-03-15' }, accountIds: ['bank'] });
    const e = evaluateBudget(b, [spend(100, '2026-03-04'), spend(200, '2026-03-05'), spend(400, '2026-03-15'), tx({ type: 'expense', amountMinor: 50, date: '2026-03-10', categoryId: 'groceries', accountId: 'bank' })], '2026-03-10');
    expect(e.actualMinor).toBe(50);
    expect(e.daysLeft).toBe(6);
  });
});

describe('savings goals', () => {
  const goal = { targetMinor: 120000, savedMinor: 30000, targetDate: '2026-12-31', createdDate: '2026-01-01' };
  it('remaining = target − current', () => {
    const p = savingsProgress(goal, '2026-07-01');
    expect(p.remainingMinor).toBe(90000);
    expect(p.percent).toBe(25);
    expect(p.achieved).toBe(false);
  });
  it('handles overfunding', () => {
    const p = savingsProgress({ ...goal, savedMinor: 150000 }, '2026-07-01');
    expect(p).toMatchObject({ remainingMinor: 0, overfundedMinor: 30000, percent: 100, achieved: true, requiredMonthlyMinor: 0 });
  });
  it('computes required monthly contributions and schedule status', () => {
    const p = savingsProgress(goal, '2026-07-01');
    expect(p.monthsLeft).toBe(6);
    expect(p.requiredMonthlyMinor).toBe(15000);
    expect(p.behindSchedule).toBe(true);
    expect(savingsProgress({ ...goal, savedMinor: 70000 }, '2026-07-01').behindSchedule).toBe(false);
  });
  it('rejects withdrawals larger than the saved amount', () => {
    expect(validateSavingsMovement(100, 'withdrawal', 101)).not.toBeNull();
    expect(validateSavingsMovement(100, 'withdrawal', 100)).toBeNull();
    expect(validateSavingsMovement(100, 'deposit', 0)).not.toBeNull();
  });
});

describe('debts: money lent and borrowed', () => {
  const loan: Debt = {
    id: 'd1', direction: 'lent', counterparty: 'Kofi', principalMinor: 100000, currency: 'GHS',
    date: '2026-01-10', dueDate: '2026-03-01', paidMinor: 0, status: 'open', notes: '',
  };
  it('GH₵1,000 loan with repayments of 300 and 200 leaves GH₵500', () => {
    let d = { ...loan };
    for (const r of [30000, 20000]) {
      expect(validateRepayment(d, r)).toBeNull();
      d = { ...d, paidMinor: d.paidMinor + r };
    }
    const st = debtState(d, '2026-02-01');
    expect(st.remainingMinor).toBe(50000);
    expect(st.paidMinor).toBe(50000);
    expect(st.status).toBe('partially_paid');
    expect(st.percentPaid).toBe(50);
  });
  it('blocks overpayment, zero payments and payments on settled debts', () => {
    expect(validateRepayment({ ...loan, paidMinor: 90000 }, 10001)).not.toBeNull();
    expect(validateRepayment(loan, 0)).not.toBeNull();
    expect(validateRepayment({ ...loan, paidMinor: 100000 }, 1)).not.toBeNull();
    expect(validateRepayment({ ...loan, status: 'void' }, 1)).not.toBeNull();
  });
  it('derives overdue and settled states', () => {
    expect(debtState(loan, '2026-03-05')).toMatchObject({ status: 'overdue', daysOverdue: 4 });
    expect(debtState({ ...loan, paidMinor: 100000 }, '2026-03-05').status).toBe('settled');
  });
  it('net position includes receivables and payables', () => {
    const accounts = [account('momo', 0, { balanceMinor: 50000, type: 'mobile_money' })];
    const debts: Debt[] = [
      { ...loan, paidMinor: 50000 },
      { ...loan, id: 'd2', direction: 'borrowed', principalMinor: 20000, paidMinor: 5000 },
      { ...loan, id: 'd3', direction: 'borrowed', principalMinor: 99999, status: 'void' },
    ];
    expect(netPosition(accounts, debts, 'GHS')).toEqual({
      accountsMinor: 50000, liquidMinor: 50000, receivablesMinor: 50000, payablesMinor: 15000, netMinor: 85000,
    });
  });
});

describe('invoices', () => {
  it('computes totals with discount and tax', () => {
    const t = computeInvoiceTotals(
      [
        { description: 'Design', quantityMilli: 1500, unitPriceMinor: 20000 },
        { description: 'Hosting', quantityMilli: 1000, unitPriceMinor: 4999 },
      ],
      1000,
      1500,
    );
    expect(t).toEqual({ lineTotalsMinor: [30000, 4999], subtotalMinor: 34999, discountMinor: 1000, taxableMinor: 33999, taxMinor: 5100, totalMinor: 39099 });
  });
  it('rejects discounts above subtotal and invalid tax rates', () => {
    expect(() => computeInvoiceTotals([{ description: 'x', quantityMilli: 1000, unitPriceMinor: 100 }], 101, 0)).toThrow();
    expect(() => computeInvoiceTotals([{ description: 'x', quantityMilli: 1000, unitPriceMinor: 100 }], 0, 10001)).toThrow();
  });
  it('tracks partial payments', () => {
    expect(invoicePaymentStatus('sent', 1000, 400)).toBe('partially_paid');
    expect(invoicePaymentStatus('partially_paid', 1000, 1000)).toBe('paid');
    expect(invoicePaymentStatus('void', 1000, 1000)).toBe('void');
    expect(validateInvoicePayment({ status: 'partially_paid', totalMinor: 1000, paidMinor: 400 }, 601)).not.toBeNull();
    expect(validateInvoicePayment({ status: 'draft', totalMinor: 1000, paidMinor: 0 }, 1)).not.toBeNull();
  });
});

describe('recurrence', () => {
  it('preserves the anchor day across short months', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31');
    expect(nextOccurrence('2026-01-05', 'weekly', '2026-01-13')).toBe('2026-01-19');
    expect(nextOccurrence('2024-02-29', 'yearly', '2024-03-01')).toBe('2025-02-28');
    expect(nextOccurrence('2026-05-01', 'quarterly', '2026-01-01')).toBe('2026-05-01');
  });
});
