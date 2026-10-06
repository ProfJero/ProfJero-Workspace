import { type DateRange, type IsoDate, daysBetween, endOfMonth, inRange, startOfMonth, addMonths, addDays, parseIsoDate } from '../dates';
import { percentOf } from '../money';
import type { Budget, Debt, LedgerTransaction, SavingsGoal } from './types';

// ───────────────────────────── Budgets ─────────────────────────────

export type BudgetStatus = 'on_track' | 'warning' | 'at_limit' | 'exceeded' | 'unused';

export interface BudgetEvaluation {
  budgetId: string;
  range: DateRange;
  plannedMinor: number;
  actualMinor: number;
  /** planned − actual, floored at 0 */
  remainingMinor: number;
  /** actual − planned, floored at 0 */
  exceededMinor: number;
  /** null when planned is zero (no meaningful percentage) */
  percentUsed: number | null;
  percentRemaining: number | null;
  status: BudgetStatus;
  /** Inclusive days left in the period counting `today`; 0 once the period is over. */
  daysLeft: number;
}

export const BUDGET_WARNING_PERCENT = 80;

/** The active period of a budget on `today`. Monthly budgets use the calendar month containing today. */
export function budgetRange(budget: Pick<Budget, 'period'>, today: IsoDate): DateRange {
  if (budget.period.kind === 'custom') return { start: budget.period.start, end: budget.period.end };
  return { start: startOfMonth(today), end: endOfMonth(today) };
}

/**
 * actual = Σ expenses − Σ refunds in the budget's categories (and accounts, if set)
 * within the period, never below zero.
 */
export function evaluateBudget(
  budget: Budget,
  transactions: LedgerTransaction[],
  today: IsoDate,
  range: DateRange = budgetRange(budget, today),
): BudgetEvaluation {
  const cats = new Set(budget.categoryIds);
  const accounts = new Set(budget.accountIds);
  let actual = 0;
  for (const t of transactions) {
    if (t.status !== 'posted' || t.currency !== budget.currency || !inRange(t.date, range)) continue;
    if (t.type !== 'expense' && t.type !== 'refund') continue;
    if (!t.categoryId || !cats.has(t.categoryId)) continue;
    if (accounts.size > 0 && (!t.accountId || !accounts.has(t.accountId))) continue;
    actual += t.type === 'expense' ? t.amountMinor : -t.amountMinor;
  }
  actual = Math.max(0, actual);
  const planned = budget.amountMinor;
  const percentUsed = percentOf(actual, planned);
  let status: BudgetStatus;
  if (planned === 0) status = actual > 0 ? 'exceeded' : 'unused';
  else if (actual > planned) status = 'exceeded';
  else if (actual === planned) status = 'at_limit';
  else if (actual * 100 >= planned * BUDGET_WARNING_PERCENT) status = 'warning';
  else if (actual === 0) status = 'unused';
  else status = 'on_track';

  const daysLeft = today > range.end ? 0 : today < range.start ? daysBetween(range.start, range.end) + 1 : daysBetween(today, range.end) + 1;
  return {
    budgetId: budget.id,
    range,
    plannedMinor: planned,
    actualMinor: actual,
    remainingMinor: Math.max(0, planned - actual),
    exceededMinor: Math.max(0, actual - planned),
    percentUsed,
    percentRemaining: percentUsed === null ? null : Math.max(0, Math.round((100 - percentUsed) * 10) / 10),
    status,
    daysLeft,
  };
}

// ───────────────────────────── Savings ─────────────────────────────

export interface SavingsProgress {
  targetMinor: number;
  savedMinor: number;
  remainingMinor: number;
  overfundedMinor: number;
  /** 0–100, capped; use overfundedMinor to show the surplus. */
  percent: number;
  achieved: boolean;
  /** Months (rounded up) between today and the target date; null without a target date. */
  monthsLeft: number | null;
  /** Even monthly contribution required to reach the target by the target date. */
  requiredMonthlyMinor: number | null;
  behindSchedule: boolean;
}

export function savingsProgress(goal: Pick<SavingsGoal, 'targetMinor' | 'savedMinor' | 'targetDate' | 'createdDate'>, today: IsoDate): SavingsProgress {
  const target = goal.targetMinor;
  const saved = Math.max(0, goal.savedMinor);
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, (percentOf(saved, target) ?? 0)) : 100;
  let monthsLeft: number | null = null;
  let requiredMonthly: number | null = null;
  let behind = false;
  if (goal.targetDate) {
    const t = parseIsoDate(today);
    const d = parseIsoDate(goal.targetDate);
    let months = (d.year - t.year) * 12 + (d.month - t.month);
    if (d.day >= t.day) months += 1; // partial month still allows a contribution
    monthsLeft = Math.max(0, months);
    requiredMonthly = remaining === 0 ? 0 : monthsLeft === 0 ? remaining : Math.ceil(remaining / monthsLeft);
    // Expected linear progress between creation and target date.
    const total = daysBetween(goal.createdDate, goal.targetDate);
    if (total > 0 && remaining > 0) {
      const elapsed = Math.min(total, Math.max(0, daysBetween(goal.createdDate, today)));
      const expected = Math.floor((target * elapsed) / total);
      behind = saved < expected;
    } else if (remaining > 0 && today > goal.targetDate) {
      behind = true;
    }
  }
  return {
    targetMinor: target,
    savedMinor: saved,
    remainingMinor: remaining,
    overfundedMinor: Math.max(0, saved - target),
    percent: pct,
    achieved: saved >= target,
    monthsLeft,
    requiredMonthlyMinor: requiredMonthly,
    behindSchedule: behind,
  };
}

/** Validate a contribution/withdrawal against the current saved amount. */
export function validateSavingsMovement(savedMinor: number, kind: 'deposit' | 'withdrawal', amountMinor: number): string | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 'Amount must be greater than zero.';
  if (kind === 'withdrawal' && amountMinor > savedMinor) return 'You cannot withdraw more than has been saved.';
  return null;
}

// ───────────────────────────── Debts ─────────────────────────────

export type DebtDisplayStatus = 'outstanding' | 'partially_paid' | 'overdue' | 'settled' | 'void';

export interface DebtState {
  principalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  percentPaid: number;
  status: DebtDisplayStatus;
  daysOverdue: number;
  dueInDays: number | null;
}

export function debtState(debt: Pick<Debt, 'principalMinor' | 'paidMinor' | 'status' | 'dueDate'>, today: IsoDate): DebtState {
  const remaining = Math.max(0, debt.principalMinor - debt.paidMinor);
  const percentPaid = Math.min(100, percentOf(debt.paidMinor, debt.principalMinor) ?? 0);
  let status: DebtDisplayStatus;
  let daysOverdue = 0;
  const dueInDays = debt.dueDate ? daysBetween(today, debt.dueDate) : null;
  if (debt.status === 'void') status = 'void';
  else if (remaining === 0) status = 'settled';
  else if (debt.dueDate && today > debt.dueDate) {
    status = 'overdue';
    daysOverdue = daysBetween(debt.dueDate, today);
  } else status = debt.paidMinor > 0 ? 'partially_paid' : 'outstanding';
  return { principalMinor: debt.principalMinor, paidMinor: debt.paidMinor, remainingMinor: remaining, percentPaid, status, daysOverdue, dueInDays };
}

/** A repayment must be positive and must not exceed what is still owed. */
export function validateRepayment(debt: Pick<Debt, 'principalMinor' | 'paidMinor' | 'status'>, amountMinor: number): string | null {
  if (debt.status === 'void') return 'This debt has been voided.';
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 'Amount must be greater than zero.';
  const remaining = debt.principalMinor - debt.paidMinor;
  if (remaining <= 0) return 'This debt is already settled.';
  if (amountMinor > remaining) return 'Repayment is larger than the outstanding balance.';
  return null;
}

// ─────────────────────── Recurring commitments ───────────────────────

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Next occurrence on/after `from` for a schedule anchored at `anchor`. */
export function nextOccurrence(anchor: IsoDate, frequency: Frequency, from: IsoDate): IsoDate {
  if (anchor >= from) return anchor;
  if (frequency === 'weekly') {
    const diff = daysBetween(anchor, from);
    return addDays(anchor, Math.ceil(diff / 7) * 7);
  }
  const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  let k = 0;
  let next = anchor;
  // Always compute from the anchor so the day-of-month is preserved (Jan 31 → Feb 28 → Mar 31).
  while (next < from) {
    k += step;
    next = addMonths(anchor, k);
  }
  return next;
}
