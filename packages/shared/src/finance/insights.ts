import { type IsoDate, addDays, addMonths, endOfMonth, startOfMonth, daysBetween, monthKey } from '../dates';
import { formatMoney, percentOf, type CurrencyCode } from '../money';
import { type Category, categoryName } from './categories';
import { debtState, evaluateBudget, savingsProgress } from './planning';
import { spendingByCategory, summarize, postedInRange } from './reports';
import type { Budget, Debt, LedgerTransaction, SavingsGoal } from './types';

/**
 * Deterministic financial insights. Each insight states WHY it is shown and the
 * numbers behind it. There is no randomness and no generated prose; a future
 * AI layer may rephrase or prioritise these, but must not invent new facts.
 */
export interface Insight {
  id: string;
  kind:
    | 'spending_increase'
    | 'category_concentration'
    | 'unusual_expense'
    | 'high_frequency'
    | 'recurring_expense'
    | 'budget_warning'
    | 'budget_exceeded'
    | 'negative_cash_flow'
    | 'debt_overdue'
    | 'debt_due_soon'
    | 'savings_behind';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  reason: string;
  evidence: { label: string; value: string }[];
}

interface Ctx {
  transactions: LedgerTransaction[];
  debts: Debt[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  categories: Map<string, Category>;
  currency: CurrencyCode;
  today: IsoDate;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export function financeInsights(ctx: Ctx): Insight[] {
  const { transactions, currency, today, categories } = ctx;
  const fmt = (m: number) => formatMoney(m, currency);
  const cat = (id: string) => categoryName(id === 'uncategorised' ? null : id, categories);
  const out: Insight[] = [];

  // Period definitions: current month to date vs the average of the previous 3 complete months.
  const monthStart = startOfMonth(today);
  const mtd = { start: monthStart, end: today };
  const prev3 = { start: addMonths(monthStart, -3), end: addDays(monthStart, -1) };
  const elapsedDays = daysBetween(monthStart, today) + 1;
  const monthDays = daysBetween(monthStart, endOfMonth(today)) + 1;

  // 1. Category increase — only judged after 10 days of the month, pro-rated against history.
  if (elapsedDays >= 10) {
    const current = spendingByCategory(transactions, mtd, currency);
    const history = new Map(spendingByCategory(transactions, prev3, currency).map((c) => [c.categoryId, c.netMinor]));
    for (const c of current) {
      const avgMonthly = Math.round((history.get(c.categoryId) ?? 0) / 3);
      if (avgMonthly <= 0) continue;
      const expectedSoFar = Math.round((avgMonthly * elapsedDays) / monthDays);
      const increase = percentOf(c.netMinor - expectedSoFar, expectedSoFar);
      if (increase !== null && increase >= 30 && c.netMinor - expectedSoFar >= 5000) {
        out.push({
          id: `increase:${c.categoryId}`,
          kind: 'spending_increase',
          severity: increase >= 75 ? 'warning' : 'info',
          title: `${cat(c.categoryId)} spending is up ${Math.round(increase)}%`,
          detail: `You have spent ${fmt(c.netMinor)} on ${cat(c.categoryId)} this month.`,
          reason: `By day ${elapsedDays} of the month you would usually have spent about ${fmt(expectedSoFar)}, based on your average of the previous 3 months.`,
          evidence: [
            { label: 'This month so far', value: fmt(c.netMinor) },
            { label: 'Usual by this date', value: fmt(expectedSoFar) },
            { label: '3-month monthly average', value: fmt(avgMonthly) },
          ],
        });
      }
    }
  }

  // 2. Concentration — one category > 40% of the last 30 days' spending.
  const last30 = { start: addDays(today, -29), end: today };
  const recentCats = spendingByCategory(transactions, last30, currency);
  const top = recentCats[0];
  if (top && recentCats.length >= 3 && (top.sharePercent ?? 0) >= 40) {
    out.push({
      id: `concentration:${top.categoryId}`,
      kind: 'category_concentration',
      severity: 'info',
      title: `${cat(top.categoryId)} is ${Math.round(top.sharePercent ?? 0)}% of your spending`,
      detail: `${fmt(top.netMinor)} of your spending in the last 30 days went to ${cat(top.categoryId)}.`,
      reason: 'A single category above 40% of spending is worth reviewing to make sure it is intentional.',
      evidence: [{ label: 'Share of spending (30 days)', value: `${top.sharePercent}%` }],
    });
  }

  // 3. Unusual expense — > 3× the category median over the previous 90 days (≥ 5 samples).
  const window90 = { start: addDays(today, -97), end: addDays(today, -8) };
  const recent = postedInRange(transactions, { start: addDays(today, -7), end: today }, currency).filter((t) => t.type === 'expense');
  const history90 = postedInRange(transactions, window90, currency).filter((t) => t.type === 'expense');
  for (const t of recent) {
    const peers = history90.filter((h) => h.categoryId === t.categoryId).map((h) => h.amountMinor);
    if (peers.length < 5) continue;
    const med = median(peers);
    if (med > 0 && t.amountMinor >= med * 3 && t.amountMinor - med >= 10000) {
      out.push({
        id: `unusual:${t.id}`,
        kind: 'unusual_expense',
        severity: 'info',
        title: `Unusually large ${cat(t.categoryId ?? 'uncategorised')} expense`,
        detail: `${t.description || 'An expense'} of ${fmt(t.amountMinor)} on ${t.date}.`,
        reason: `It is ${Math.round((t.amountMinor / med) * 10) / 10}× your typical ${cat(t.categoryId ?? 'uncategorised')} expense.`,
        evidence: [
          { label: 'This expense', value: fmt(t.amountMinor) },
          { label: 'Typical (median, prior 90 days)', value: fmt(med) },
          { label: 'Expenses compared', value: String(peers.length) },
        ],
      });
    }
  }

  // 4. High-frequency — 15+ expenses in one category in 30 days.
  for (const c of recentCats) {
    if (c.count >= 15) {
      out.push({
        id: `frequency:${c.categoryId}`,
        kind: 'high_frequency',
        severity: 'info',
        title: `${c.count} ${cat(c.categoryId)} purchases in 30 days`,
        detail: `Small frequent purchases added up to ${fmt(c.netMinor)}.`,
        reason: 'Frequent small spending is easy to underestimate.',
        evidence: [{ label: 'Purchases', value: String(c.count) }, { label: 'Total', value: fmt(c.netMinor) }],
      });
    }
  }

  // 5. Recurring expenses — same payee/description, amounts within 10%, in 3+ distinct months of the last 4.
  const fourMonths = { start: addMonths(monthStart, -3), end: today };
  const groups = new Map<string, LedgerTransaction[]>();
  for (const t of postedInRange(transactions, fourMonths, currency)) {
    if (t.type !== 'expense') continue;
    const key = (t.payee || t.description).trim().toLowerCase();
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => monthKey(t.date)));
    if (months.size < 3) continue;
    const med = median(txs.map((t) => t.amountMinor));
    if (!txs.every((t) => Math.abs(t.amountMinor - med) * 10 <= med)) continue;
    out.push({
      id: `recurring:${key}`,
      kind: 'recurring_expense',
      severity: 'info',
      title: `Recurring expense: ${txs[0]!.payee || txs[0]!.description}`,
      detail: `About ${fmt(med)} per month.`,
      reason: `It appeared in ${months.size} of the last 4 months with a consistent amount.`,
      evidence: [{ label: 'Typical amount', value: fmt(med) }, { label: 'Months seen', value: String(months.size) }],
    });
  }

  // 6. Budgets.
  for (const b of ctx.budgets) {
    if (b.currency !== currency) continue;
    const e = evaluateBudget(b, transactions, today);
    if (today < e.range.start || today > e.range.end) continue;
    if (e.status === 'exceeded') {
      out.push({
        id: `budget:${b.id}`, kind: 'budget_exceeded', severity: 'critical',
        title: `${b.name} budget exceeded`,
        detail: `Spent ${fmt(e.actualMinor)} of ${fmt(e.plannedMinor)} — ${fmt(e.exceededMinor)} over.`,
        reason: 'Spending in this budget\'s categories is above the planned amount for the period.',
        evidence: [{ label: 'Planned', value: fmt(e.plannedMinor) }, { label: 'Actual', value: fmt(e.actualMinor) }, { label: 'Days left', value: String(e.daysLeft) }],
      });
    } else if (e.status === 'warning' || e.status === 'at_limit') {
      out.push({
        id: `budget:${b.id}`, kind: 'budget_warning', severity: 'warning',
        title: `${b.name} budget is ${e.percentUsed}% used`,
        detail: `${fmt(e.remainingMinor)} left with ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} remaining.`,
        reason: 'Budgets are flagged once 80% of the planned amount is used.',
        evidence: [{ label: 'Planned', value: fmt(e.plannedMinor) }, { label: 'Actual', value: fmt(e.actualMinor) }],
      });
    }
  }

  // 7. Negative cash flow this month (only after day 10 to avoid salary-timing noise).
  if (elapsedDays >= 10) {
    const s = summarize(transactions, mtd, currency);
    if (s.incomeMinor > 0 && s.netSpendingMinor > s.incomeMinor) {
      out.push({
        id: 'cashflow:negative', kind: 'negative_cash_flow', severity: 'warning',
        title: 'Spending is above income this month',
        detail: `Income ${fmt(s.incomeMinor)}, spending ${fmt(s.netSpendingMinor)}.`,
        reason: 'You have spent more than you earned so far this month.',
        evidence: [{ label: 'Income', value: fmt(s.incomeMinor) }, { label: 'Spending', value: fmt(s.netSpendingMinor) }],
      });
    }
  }

  // 8. Debts.
  for (const d of ctx.debts) {
    if (d.currency !== currency) continue;
    const st = debtState(d, today);
    const who = d.counterparty;
    if (st.status === 'overdue') {
      out.push({
        id: `debt:${d.id}`, kind: 'debt_overdue', severity: d.direction === 'borrowed' ? 'critical' : 'warning',
        title: d.direction === 'borrowed' ? `Repayment to ${who} is overdue` : `${who}'s repayment is overdue`,
        detail: `${fmt(st.remainingMinor)} outstanding, ${st.daysOverdue} day${st.daysOverdue === 1 ? '' : 's'} past the due date.`,
        reason: `The due date was ${d.dueDate}.`,
        evidence: [{ label: 'Outstanding', value: fmt(st.remainingMinor) }, { label: 'Due date', value: d.dueDate ?? '' }],
      });
    } else if ((st.status === 'outstanding' || st.status === 'partially_paid') && st.dueInDays !== null && st.dueInDays <= 7) {
      out.push({
        id: `debt:${d.id}`, kind: 'debt_due_soon', severity: 'info',
        title: d.direction === 'borrowed' ? `Repayment to ${who} due soon` : `${who}'s repayment due soon`,
        detail: `${fmt(st.remainingMinor)} due ${st.dueInDays === 0 ? 'today' : `in ${st.dueInDays} day${st.dueInDays === 1 ? '' : 's'}`}.`,
        reason: 'Debts are highlighted 7 days before their due date.',
        evidence: [{ label: 'Outstanding', value: fmt(st.remainingMinor) }],
      });
    }
  }

  // 9. Savings goals behind schedule.
  for (const g of ctx.savingsGoals) {
    if (g.status !== 'active' || g.currency !== currency) continue;
    const p = savingsProgress(g, today);
    if (p.behindSchedule && p.requiredMonthlyMinor) {
      out.push({
        id: `savings:${g.id}`, kind: 'savings_behind', severity: 'info',
        title: `"${g.name}" is behind schedule`,
        detail: `Save about ${fmt(p.requiredMonthlyMinor)} per month to reach ${fmt(g.targetMinor)} by ${g.targetDate}.`,
        reason: 'Your saved amount is below a steady pace from when the goal started to its target date.',
        evidence: [{ label: 'Saved', value: fmt(p.savedMinor) }, { label: 'Target', value: fmt(p.targetMinor) }],
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
