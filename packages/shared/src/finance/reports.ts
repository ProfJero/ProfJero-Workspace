import { type DateRange, inRange, monthsInRange, monthKey } from '../dates';
import { percentOf, sumMinor } from '../money';
import { accountEffects } from './ledger';
import type { LedgerTransaction, SpendingNature } from './types';

/**
 * All reports are pure functions of posted ledger entries in a single currency.
 * Dashboard, Finance overview, Reports and the health score all use these —
 * there is exactly one definition of "income", "spending" and "cash flow".
 *
 * Definitions (for entries whose date is within the inclusive range):
 *   income          Σ income
 *   grossSpending   Σ expense
 *   refunds         Σ refund
 *   netSpending     grossSpending − refunds
 *   netIncome       income − netSpending            ("what I kept")
 *   adjustments     Σ signed adjustments            (excluded from income/spending)
 *   cashFlow        Σ account effects of all entries (equals the change in total account balances)
 *   savingsRate     netIncome / income              (null when income is zero)
 */
export interface PeriodSummary {
  range: DateRange;
  incomeMinor: number;
  grossSpendingMinor: number;
  refundsMinor: number;
  netSpendingMinor: number;
  netIncomeMinor: number;
  adjustmentsMinor: number;
  transfersMinor: number;
  lentMinor: number;
  borrowedMinor: number;
  repaymentsReceivedMinor: number;
  repaymentsMadeMinor: number;
  cashFlowMinor: number;
  savingsRatePercent: number | null;
  transactionCount: number;
}

export function postedInRange(transactions: LedgerTransaction[], range: DateRange, currency: string): LedgerTransaction[] {
  return transactions.filter((t) => t.status === 'posted' && t.currency === currency && inRange(t.date, range));
}

export function summarize(transactions: LedgerTransaction[], range: DateRange, currency: string): PeriodSummary {
  const txs = postedInRange(transactions, range, currency);
  const total = (type: LedgerTransaction['type']) => sumMinor(txs.filter((t) => t.type === type).map((t) => t.amountMinor));
  const incomeMinor = total('income');
  const grossSpendingMinor = total('expense');
  const refundsMinor = total('refund');
  const netSpendingMinor = grossSpendingMinor - refundsMinor;
  const netIncomeMinor = incomeMinor - netSpendingMinor;
  const adjustmentsMinor = sumMinor(
    txs.filter((t) => t.type === 'adjustment').map((t) => (t.adjustmentDirection === 'decrease' ? -t.amountMinor : t.amountMinor)),
  );
  const cashFlowMinor = sumMinor(txs.flatMap((t) => accountEffects(t).map((e) => e.deltaMinor)));
  return {
    range,
    incomeMinor,
    grossSpendingMinor,
    refundsMinor,
    netSpendingMinor,
    netIncomeMinor,
    adjustmentsMinor,
    transfersMinor: total('transfer'),
    lentMinor: total('loan_disbursement'),
    borrowedMinor: total('loan_receipt'),
    repaymentsReceivedMinor: total('repayment_received'),
    repaymentsMadeMinor: total('repayment_made'),
    cashFlowMinor,
    savingsRatePercent: percentOf(netIncomeMinor, incomeMinor),
    transactionCount: txs.length,
  };
}

export interface CategoryTotal {
  categoryId: string;
  /** expenses − refunds in this category (may be negative if refunds exceed spending in-period) */
  netMinor: number;
  count: number;
  sharePercent: number | null;
}

/** Net spending per category; refunds reduce the category they belong to. Sorted largest first. */
export function spendingByCategory(transactions: LedgerTransaction[], range: DateRange, currency: string): CategoryTotal[] {
  const totals = new Map<string, { net: number; count: number }>();
  for (const t of postedInRange(transactions, range, currency)) {
    if (t.type !== 'expense' && t.type !== 'refund') continue;
    const key = t.categoryId ?? 'uncategorised';
    const cur = totals.get(key) ?? { net: 0, count: 0 };
    cur.net += t.type === 'expense' ? t.amountMinor : -t.amountMinor;
    if (t.type === 'expense') cur.count += 1;
    totals.set(key, cur);
  }
  const overall = sumMinor([...totals.values()].map((v) => Math.max(0, v.net)));
  return [...totals.entries()]
    .map(([categoryId, v]) => ({
      categoryId,
      netMinor: v.net,
      count: v.count,
      sharePercent: percentOf(Math.max(0, v.net), overall),
    }))
    .sort((a, b) => b.netMinor - a.netMinor);
}

export function incomeByCategory(transactions: LedgerTransaction[], range: DateRange, currency: string): CategoryTotal[] {
  const totals = new Map<string, { net: number; count: number }>();
  for (const t of postedInRange(transactions, range, currency)) {
    if (t.type !== 'income') continue;
    const key = t.categoryId ?? 'uncategorised';
    const cur = totals.get(key) ?? { net: 0, count: 0 };
    cur.net += t.amountMinor;
    cur.count += 1;
    totals.set(key, cur);
  }
  const overall = sumMinor([...totals.values()].map((v) => v.net));
  return [...totals.entries()]
    .map(([categoryId, v]) => ({ categoryId, netMinor: v.net, count: v.count, sharePercent: percentOf(v.net, overall) }))
    .sort((a, b) => b.netMinor - a.netMinor);
}

export interface NatureTotal {
  nature: SpendingNature | 'unclassified';
  grossMinor: number;
  sharePercent: number | null;
}

/** Gross spending by nature (need/want/…). Refunds are not attributed to a nature. */
export function spendingByNature(transactions: LedgerTransaction[], range: DateRange, currency: string): NatureTotal[] {
  const totals = new Map<NatureTotal['nature'], number>();
  for (const t of postedInRange(transactions, range, currency)) {
    if (t.type !== 'expense') continue;
    const key = t.nature ?? 'unclassified';
    totals.set(key, (totals.get(key) ?? 0) + t.amountMinor);
  }
  const overall = sumMinor(totals.values());
  return [...totals.entries()]
    .map(([nature, grossMinor]) => ({ nature, grossMinor, sharePercent: percentOf(grossMinor, overall) }))
    .sort((a, b) => b.grossMinor - a.grossMinor);
}

export interface AccountFlow {
  accountId: string;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
}

export function flowsByAccount(transactions: LedgerTransaction[], range: DateRange, currency: string): AccountFlow[] {
  const flows = new Map<string, AccountFlow>();
  for (const t of postedInRange(transactions, range, currency)) {
    for (const e of accountEffects(t)) {
      const f = flows.get(e.accountId) ?? { accountId: e.accountId, inflowMinor: 0, outflowMinor: 0, netMinor: 0 };
      if (e.deltaMinor >= 0) f.inflowMinor += e.deltaMinor;
      else f.outflowMinor += -e.deltaMinor;
      f.netMinor += e.deltaMinor;
      flows.set(e.accountId, f);
    }
  }
  return [...flows.values()];
}

export interface MonthPoint {
  month: string; // YYYY-MM
  incomeMinor: number;
  netSpendingMinor: number;
  netIncomeMinor: number;
  cashFlowMinor: number;
}

/** One point per calendar month touched by the range (partial months are clipped to the range). */
export function monthlySeries(transactions: LedgerTransaction[], range: DateRange, currency: string): MonthPoint[] {
  return monthsInRange(range).map((m) => {
    const s = summarize(transactions, m, currency);
    return {
      month: monthKey(m.start),
      incomeMinor: s.incomeMinor,
      netSpendingMinor: s.netSpendingMinor,
      netIncomeMinor: s.netIncomeMinor,
      cashFlowMinor: s.cashFlowMinor,
    };
  });
}
