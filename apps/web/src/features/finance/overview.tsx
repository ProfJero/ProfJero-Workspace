import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, Info, Lightbulb, Plus, XCircle } from 'lucide-react';
import {
  addMonths,
  categoryName,
  debtState,
  evaluateBudget,
  financeInsights,
  financialHealth,
  formatIsoDate,
  monthlySeries,
  netPosition,
  presetRange,
  spendingByCategory,
  startOfMonth,
  summarize,
  type Insight,
} from '@profjero/shared';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, PageHeader, Spinner, StatTile } from '@/ui/primitives';
import { EmptyState, InlineError } from '@/ui/overlays';
import { Money } from '@/ui/money';
import { GroupedBarChart, RankedBars, ScoreRing } from './charts';
import { useAccounts, useAnalysisLedger, useBudgets, useDebts, useSavingsGoals } from './data';
import { BUDGET_STATUS } from './planning';
import { TransactionDialog } from './transactions';

const TABS = [
  { to: '', label: 'Overview' }, { to: 'transactions', label: 'Transactions' }, { to: 'accounts', label: 'Accounts' },
  { to: 'budgets', label: 'Budgets' }, { to: 'savings', label: 'Savings' }, { to: 'debts', label: 'Lent & borrowed' },
  { to: 'invoices', label: 'Invoices' }, { to: 'reports', label: 'Reports' },
];

export function FinanceLayout() {
  const { tenantId, can } = useTenant();
  const [recording, setRecording] = useState(false);
  return (
    <>
      <PageHeader title="Finance" description="Every balance here is traceable to transactions you can see."
        actions={can('finance.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRecording(true)}>Record transaction</Button>} />
      <nav aria-label="Finance sections" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
        {TABS.map((t) => (
          <NavLink key={t.to} to={`/w/${tenantId}/finance/${t.to}`} end={t.to === ''}
            className={({ isActive }) => clsx('relative whitespace-nowrap px-3 py-2 text-sm font-medium', isActive ? 'text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand' : 'text-ink-2 hover:text-ink')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
      <TransactionDialog open={recording} onOpenChange={setRecording} tx={null} />
    </>
  );
}

const SEVERITY = {
  critical: { icon: XCircle, cls: 'text-critical' },
  warning: { icon: AlertTriangle, cls: 'text-warning-ink' },
  info: { icon: Info, cls: 'text-brand' },
} as const;

export function InsightItem({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const S = SEVERITY[insight.severity];
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex gap-3">
        <S.icon className={clsx('mt-0.5 size-4 shrink-0', S.cls)} aria-label={insight.severity} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{insight.title}</p>
          <p className="text-sm text-ink-2">{insight.detail}</p>
          <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand" aria-expanded={open} onClick={() => setOpen(!open)}>
            Why am I seeing this? <ChevronDown className={clsx('size-3 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <div className="mt-2 rounded-lg bg-surface-2 p-2.5 text-xs">
              <p className="text-ink-2">{insight.reason}</p>
              <dl className="tabular mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {insight.evidence.map((e) => (
                  <div key={e.label} className="contents"><dt className="text-muted">{e.label}</dt><dd className="text-ink">{e.value}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function useFinanceInsights() {
  const { today, currency, categories } = useTenant();
  const ledger = useAnalysisLedger();
  const debts = useDebts().data ?? [];
  const budgets = useBudgets().data ?? [];
  const goals = useSavingsGoals().data ?? [];
  const insights = useMemo(
    () => financeInsights({ transactions: ledger.data ?? [], debts, budgets, savingsGoals: goals, categories, currency, today }),
    [ledger.data, debts, budgets, goals, categories, currency, today],
  );
  return { insights, loading: ledger.loading };
}

export function FinanceOverview() {
  const { tenantId, today, currency, categories } = useTenant();
  const ledger = useAnalysisLedger();
  const accounts = useAccounts();
  const debts = useDebts().data ?? [];
  const budgets = useBudgets().data ?? [];
  const { insights } = useFinanceInsights();
  const txs = ledger.data ?? [];
  const live = (accounts.data ?? []).filter((a) => !a.archived);
  const month = presetRange('this_month', today);
  const lastMonth = presetRange('last_month', today);
  const s = summarize(txs, month, currency);
  const prev = summarize(txs, lastMonth, currency);
  const pos = netPosition(live, debts, currency);
  const health = useMemo(() => financialHealth({ accounts: accounts.data ?? [], transactions: txs, debts, budgets, currency, today }), [accounts.data, txs, debts, budgets, currency, today]);
  const series = monthlySeries(txs, { start: addMonths(startOfMonth(today), -5), end: month.end }, currency);
  const cats = spendingByCategory(txs, month, currency);
  const budgetEvals = budgets.map((b) => ({ b, e: evaluateBudget(b, txs, today) })).filter(({ e }) => e.status === 'warning' || e.status === 'exceeded' || e.status === 'at_limit');
  const upcoming = debts.map((d) => ({ d, st: debtState(d, today) })).filter(({ st }) => st.status === 'overdue' || (st.dueInDays !== null && st.dueInDays <= 30 && st.remainingMinor > 0 && st.status !== 'void')).sort((a, b) => (a.d.dueDate ?? '').localeCompare(b.d.dueDate ?? ''));

  if (ledger.loading || accounts.loading) return <Spinner />;
  if (ledger.error) return <InlineError message={ledger.error} />;
  if (live.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Lightbulb className="size-5" />} title="Start by adding your accounts" body="Add Cash, Mobile Money and bank accounts with their current balances. Then record income, expenses and transfers — everything else is calculated from them."
          action={<Link to={`/w/${tenantId}/finance/accounts`}><Button variant="primary">Add accounts</Button></Link>} />
      </Card>
    );
  }
  const vsLast = prev.netSpendingMinor > 0 ? Math.round(((s.netSpendingMinor - prev.netSpendingMinor) / prev.netSpendingMinor) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Net position" value={<Money minor={pos.netMinor} currency={currency} />} sub="Accounts + owed to you − you owe" tone={pos.netMinor < 0 ? 'critical' : undefined} />
        <StatTile label="Available now" value={<Money minor={pos.liquidMinor} currency={currency} />} sub="Cash, MoMo, bank & savings" />
        <StatTile label="Income this month" value={<Money minor={s.incomeMinor} currency={currency} />} sub={`${formatIsoDate(month.start)} – today`} />
        <StatTile label="Spending this month" value={<Money minor={s.netSpendingMinor} currency={currency} />}
          sub={vsLast === null ? 'No spending last month to compare' : `${vsLast >= 0 ? '+' : ''}${vsLast}% vs all of last month`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Income and spending" description="Last 6 months. Transfers and loans are excluded; refunds reduce spending." />
          <div className="p-4">
            <GroupedBarChart title="Income and spending by month" currency={currency}
              series={[{ name: 'Income', color: 'var(--series-1)' }, { name: 'Spending', color: 'var(--series-2)' }]}
              groups={series.map((m) => ({ label: formatIsoDate(`${m.month}-01`, 'month').split(' ')[0]!, values: [m.incomeMinor, Math.max(0, m.netSpendingMinor)] }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Financial health" description={`Based on ${formatIsoDate(health.window.start, 'month')} – ${formatIsoDate(health.window.end, 'month')}`} />
          <div className="p-4">
            {health.score === null ? (
              <p className="text-sm text-ink-2">Not enough history yet. A score appears once at least one complete month of income and spending is recorded — it is never estimated from guesses.</p>
            ) : (
              <div className="flex items-center gap-4">
                <ScoreRing score={health.score} label="Financial health score" />
                <p className="text-sm text-ink-2">{health.band === 'strong' ? 'Strong' : health.band === 'fair' ? 'Fair' : 'Needs attention'} — each part of the score is explained below.</p>
              </div>
            )}
            <ul className="mt-4 space-y-2.5">
              {health.components.map((c) => (
                <li key={c.key} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.label}</span>
                    {c.available ? <span className="tabular text-xs text-ink-2">{c.score}/100 · weight {c.weight}%</span> : <Badge>Not scored</Badge>}
                  </div>
                  <p className="text-xs text-muted">{c.explanation}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Insights" description="Patterns found in your own records. Each explains why it is shown." />
          {insights.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nothing needs attention right now.</p> : <ul className="divide-y divide-line">{insights.slice(0, 8).map((i) => <InsightItem key={i.id} insight={i} />)}</ul>}
        </Card>
        <Card>
          <CardHeader title="Spending this month by category" />
          <div className="p-4">
            <RankedBars currency={currency} rows={cats.map((c) => ({ label: categoryName(c.categoryId === 'uncategorised' ? null : c.categoryId, categories), valueMinor: c.netMinor, share: c.sharePercent }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Accounts" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/finance/accounts`}>Manage</Link>} />
          <ul className="divide-y divide-line">
            {live.map((a) => <li key={a.id} className="flex justify-between px-5 py-2.5 text-sm"><span>{a.name}</span><Money minor={a.balanceMinor} currency={a.currency} className={a.balanceMinor < 0 ? 'text-critical-ink' : ''} /></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Budgets needing attention" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/finance/budgets`}>All budgets</Link>} />
          {budgetEvals.length === 0 ? <p className="px-5 py-4 text-sm text-muted">{budgets.length ? 'All budgets are on track.' : 'No budgets set.'}</p> : (
            <ul className="divide-y divide-line">{budgetEvals.map(({ b, e }) => (
              <li key={b.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"><span className="truncate">{b.name}</span><Badge tone={BUDGET_STATUS[e.status].tone}>{e.percentUsed === null ? BUDGET_STATUS[e.status].label : `${e.percentUsed}%`}</Badge></li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Repayments due" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/finance/debts`}>All debts</Link>} />
          {upcoming.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Nothing due in the next 30 days.</p> : (
            <ul className="divide-y divide-line">{upcoming.slice(0, 6).map(({ d, st }) => (
              <li key={d.id} className="px-5 py-2.5 text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{d.direction === 'lent' ? `${d.counterparty} owes you` : `You owe ${d.counterparty}`}</span><Money minor={st.remainingMinor} currency={currency} /></div>
                <p className={clsx('text-xs', st.status === 'overdue' ? 'text-critical-ink' : 'text-muted')}>{st.status === 'overdue' ? `${st.daysOverdue} days overdue` : `Due ${formatIsoDate(d.dueDate!)}`}</p>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
