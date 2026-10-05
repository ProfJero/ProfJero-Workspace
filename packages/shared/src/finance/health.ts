import { type IsoDate, addMonths, endOfMonth, startOfMonth } from '../dates';
import { formatMoney, percentOf, type CurrencyCode } from '../money';
import { netPosition } from './ledger';
import { evaluateBudget } from './planning';
import { spendingByNature, summarize } from './reports';
import type { Account, Budget, Debt, LedgerTransaction } from './types';

/**
 * Financial health score.
 *
 * Six components, each scored 0–100 with a plain-language explanation.
 * A component without enough data is marked unavailable and excluded; the
 * remaining weights are re-normalised. The overall score is the weighted mean.
 * Nothing is hard-coded and nothing is random.
 *
 * Window: the last 3 COMPLETE calendar months (the current partial month
 * would make every early-month score look artificially good or bad).
 */
export interface HealthComponent {
  key: 'savings_rate' | 'emergency_reserve' | 'debt_burden' | 'overdue' | 'budget_adherence' | 'discretionary';
  label: string;
  weight: number;
  available: boolean;
  score: number;
  explanation: string;
}

export interface HealthScore {
  score: number | null;
  band: 'strong' | 'fair' | 'weak' | 'insufficient_data';
  components: HealthComponent[];
  window: { start: IsoDate; end: IsoDate };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Linear score: `good` maps to 100, `bad` maps to 0. Works in either direction. */
const linear = (value: number, bad: number, good: number) => clamp(((value - bad) / (good - bad)) * 100);

export function financialHealth(input: {
  accounts: Account[];
  transactions: LedgerTransaction[];
  debts: Debt[];
  budgets: Budget[];
  currency: CurrencyCode;
  today: IsoDate;
}): HealthScore {
  const { accounts, transactions, debts, budgets, currency, today } = input;
  const windowEnd = endOfMonth(addMonths(startOfMonth(today), -1));
  const windowStart = addMonths(startOfMonth(today), -3);
  const window = { start: windowStart, end: windowEnd };
  const s = summarize(transactions, window, currency);
  const avgIncome = Math.round(s.incomeMinor / 3);
  const avgSpending = Math.round(s.netSpendingMinor / 3);
  const fmt = (m: number) => formatMoney(m, currency);
  const components: HealthComponent[] = [];

  // 1. Savings rate — 20%+ of income kept = 100, spending ≥ income = 0.
  if (s.incomeMinor > 0) {
    const rate = percentOf(s.netIncomeMinor, s.incomeMinor) ?? 0;
    components.push({
      key: 'savings_rate', label: 'Savings rate', weight: 25, available: true, score: linear(rate, 0, 20),
      explanation: `You kept ${rate}% of your income over the last 3 complete months (target: 20% or more).`,
    });
  } else {
    components.push({ key: 'savings_rate', label: 'Savings rate', weight: 25, available: false, score: 0, explanation: 'No income recorded in the last 3 complete months.' });
  }

  // 2. Emergency reserve — liquid money covers 6+ months of spending = 100.
  const pos = netPosition(accounts.filter((a) => !a.archived), debts, currency);
  if (avgSpending > 0) {
    const months = pos.liquidMinor / avgSpending;
    components.push({
      key: 'emergency_reserve', label: 'Emergency reserve', weight: 20, available: true, score: linear(months, 0, 6),
      explanation: `Your available balances (${fmt(pos.liquidMinor)}) cover about ${Math.max(0, Math.round(months * 10) / 10)} months of average spending (target: 6 months).`,
    });
  } else {
    components.push({ key: 'emergency_reserve', label: 'Emergency reserve', weight: 20, available: false, score: 0, explanation: 'No spending recorded yet to measure reserves against.' });
  }

  // 3. Debt burden — outstanding borrowing vs monthly income; none = 100, ≥ 3 months income = 0.
  if (avgIncome > 0) {
    const ratio = pos.payablesMinor / avgIncome;
    components.push({
      key: 'debt_burden', label: 'Debt burden', weight: 20, available: true, score: linear(ratio, 3, 0),
      explanation: pos.payablesMinor === 0
        ? 'You have no outstanding borrowing.'
        : `You owe ${fmt(pos.payablesMinor)}, about ${Math.round(ratio * 10) / 10}× your average monthly income.`,
    });
  } else {
    components.push({
      key: 'debt_burden', label: 'Debt burden', weight: 20, available: pos.payablesMinor === 0, score: 100,
      explanation: pos.payablesMinor === 0 ? 'You have no outstanding borrowing.' : 'Debt cannot be compared with income because no income was recorded.',
    });
  }

  // 4. Overdue obligations — each overdue borrowing costs 35 points.
  const overdue = debts.filter((d) => d.direction === 'borrowed' && d.status === 'open' && d.dueDate && d.dueDate < today && d.principalMinor > d.paidMinor);
  components.push({
    key: 'overdue', label: 'Overdue obligations', weight: 15, available: true, score: clamp(100 - overdue.length * 35),
    explanation: overdue.length === 0 ? 'Nothing you owe is overdue.' : `${overdue.length} debt${overdue.length > 1 ? 's are' : ' is'} past the due date.`,
  });

  // 5. Budget adherence — share of last month's budgets not exceeded.
  const lastMonth = { start: startOfMonth(windowEnd), end: windowEnd };
  const relevant = budgets.filter((b) => b.currency === currency && b.amountMinor > 0);
  if (relevant.length > 0) {
    const evals = relevant.map((b) => evaluateBudget(b, transactions, today, b.period.kind === 'monthly' ? lastMonth : undefined));
    const kept = evals.filter((e) => e.status !== 'exceeded').length;
    components.push({
      key: 'budget_adherence', label: 'Budget adherence', weight: 10, available: true, score: clamp((kept / evals.length) * 100),
      explanation: `${kept} of ${evals.length} budgets stayed within their limit last period.`,
    });
  } else {
    components.push({ key: 'budget_adherence', label: 'Budget adherence', weight: 10, available: false, score: 0, explanation: 'No budgets set.' });
  }

  // 6. Discretionary share — "wants" ≤ 30% of classified spending = 100, ≥ 70% = 0.
  const natures = spendingByNature(transactions, window, currency).filter((n) => n.nature !== 'unclassified');
  const classified = natures.reduce((a, n) => a + n.grossMinor, 0);
  if (classified > 0) {
    const wants = natures.find((n) => n.nature === 'want')?.grossMinor ?? 0;
    const share = percentOf(wants, classified) ?? 0;
    components.push({
      key: 'discretionary', label: 'Discretionary spending', weight: 10, available: true, score: linear(share, 70, 30),
      explanation: `${share}% of your classified spending was on wants (guide: 30% or less).`,
    });
  } else {
    components.push({ key: 'discretionary', label: 'Discretionary spending', weight: 10, available: false, score: 0, explanation: 'No expenses classified as needs or wants yet.' });
  }

  const available = components.filter((c) => c.available);
  const totalWeight = available.reduce((a, c) => a + c.weight, 0);
  // Require the two income/spending-based anchors before showing a score at all.
  const enough = components.find((c) => c.key === 'savings_rate')?.available && totalWeight >= 50;
  const score = enough ? Math.round(available.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight) : null;
  const band: HealthScore['band'] = score === null ? 'insufficient_data' : score >= 75 ? 'strong' : score >= 50 ? 'fair' : 'weak';
  return { score, band, components, window };
}
