import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  SPENDING_NATURE_LABELS,
  TRANSACTION_TYPE_LABELS,
  categoryName,
  flowsByAccount,
  formatIsoDate,
  incomeByCategory,
  isIsoDate,
  minorToDecimalString,
  monthlySeries,
  presetRange,
  spendingByCategory,
  spendingByNature,
  summarize,
  type DateRange,
  type PeriodPreset,
} from '@profjero/shared';
import { useTenant } from '@/app/tenant';
import { Button, Card, CardHeader, Input, Select, Spinner } from '@/ui/primitives';
import { InlineError } from '@/ui/overlays';
import { Money } from '@/ui/money';
import { GroupedBarChart, RankedBars } from './charts';
import { accountName, useAccounts, useLedger, type StoredTransaction } from './data';

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' }, { value: 'last_12_months', label: 'Last 12 months' },
];

/** CSV export of the ledger for the period. Cells are quoted; formulas are neutralised against CSV injection. */
function exportCsv(txs: StoredTransaction[], range: DateRange, accounts: ReturnType<typeof useAccounts>['data'], categories: Parameters<typeof categoryName>[1], currency: string) {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ['Date', 'Type', 'Status', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Spending kind', 'Description', 'Payee', 'Reference'];
  const rows = txs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      t.date, TRANSACTION_TYPE_LABELS[t.type], t.status, minorToDecimalString(t.amountMinor, t.currency), t.currency,
      accountName(accounts, t.accountId), t.toAccountId ? accountName(accounts, t.toAccountId) : '', t.categoryId ? categoryName(t.categoryId, categories) : '',
      t.nature ? SPENDING_NATURE_LABELS[t.nature] : '', t.description, t.payee ?? '', t.reference ?? '',
    ].map(String).map(cell).join(','));
  const blob = new Blob([[header.map(cell).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `transactions_${currency}_${range.start}_${range.end}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ReportsPage() {
  const { today, currency, categories } = useTenant();
  const accounts = useAccounts().data;
  const [preset, setPreset] = useState<PeriodPreset | 'custom'>('last_12_months');
  const [custom, setCustom] = useState<DateRange>(presetRange('this_year', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const ledger = useLedger(range);
  const txs = ledger.data ?? [];
  const s = summarize(txs, range, currency);
  const series = monthlySeries(txs, range, currency);
  const cats = spendingByCategory(txs, range, currency);
  const incomes = incomeByCategory(txs, range, currency);
  const natures = spendingByNature(txs, range, currency);
  const flows = flowsByAccount(txs, range, currency);
  const label = (id: string) => categoryName(id === 'uncategorised' ? null : id, categories);

  const rows: [string, number, string?][] = [
    ['Income', s.incomeMinor],
    ['Spending (before refunds)', s.grossSpendingMinor],
    ['Refunds', s.refundsMinor],
    ['Spending (after refunds)', s.netSpendingMinor],
    ['Net income (kept)', s.netIncomeMinor, s.savingsRatePercent === null ? 'No income in period' : `${s.savingsRatePercent}% of income`],
    ['Balance adjustments', s.adjustmentsMinor, 'Not counted as income or spending'],
    ['Money lent out', s.lentMinor],
    ['Money borrowed', s.borrowedMinor],
    ['Repayments received', s.repaymentsReceivedMinor],
    ['Repayments made', s.repaymentsMadeMinor],
    ['Transfers between accounts', s.transfersMinor, 'Moves money; net position unchanged'],
    ['Change in account balances', s.cashFlowMinor, 'Cash flow: every entry’s effect on accounts'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Report period" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className="w-48">
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          <option value="custom">Custom range</option>
        </Select>
        {preset === 'custom' && (
          <>
            <Input aria-label="From" type="date" value={custom.start} max={custom.end} onChange={(e) => isIsoDate(e.target.value) && e.target.value <= custom.end && setCustom({ ...custom, start: e.target.value })} className="w-40" />
            <Input aria-label="To" type="date" value={custom.end} min={custom.start} onChange={(e) => isIsoDate(e.target.value) && e.target.value >= custom.start && setCustom({ ...custom, end: e.target.value })} className="w-40" />
          </>
        )}
        <span className="text-sm text-muted">{formatIsoDate(range.start)} – {formatIsoDate(range.end)} (both days included)</span>
        <Button className="ml-auto" size="sm" icon={<Download className="size-4" />} disabled={txs.length === 0} onClick={() => exportCsv(txs, range, accounts, categories, currency)}>Export CSV</Button>
      </div>
      {ledger.loading ? <Spinner /> : ledger.error ? <InlineError message={ledger.error} /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Summary" description="Voided entries are excluded." />
              <table className="w-full text-sm">
                <tbody className="tabular divide-y divide-line">
                  {rows.map(([name, v, note]) => (
                    <tr key={name}>
                      <th scope="row" className="px-5 py-2 text-left font-normal text-ink-2">{name}{note && <span className="block text-xs text-muted">{note}</span>}</th>
                      <td className="px-5 py-2 text-right font-medium"><Money minor={v} currency={currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardHeader title="Monthly income and spending" />
              <div className="p-4">
                <GroupedBarChart title="Monthly income and spending" currency={currency}
                  series={[{ name: 'Income', color: 'var(--series-1)' }, { name: 'Spending', color: 'var(--series-2)' }]}
                  groups={series.map((m) => ({ label: formatIsoDate(`${m.month}-01`, 'month'), values: [m.incomeMinor, Math.max(0, m.netSpendingMinor)] }))} />
              </div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Spending by category" description="After refunds." />
              <div className="p-4"><RankedBars currency={currency} max={12} rows={cats.map((c) => ({ label: label(c.categoryId), valueMinor: c.netMinor, share: c.sharePercent }))} /></div>
            </Card>
            <Card>
              <CardHeader title="Income by source" />
              <div className="p-4"><RankedBars currency={currency} max={12} color="var(--series-3)" rows={incomes.map((c) => ({ label: label(c.categoryId), valueMinor: c.netMinor, share: c.sharePercent }))} /></div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Needs, wants and commitments" description="Spending classified when it was recorded." />
              <div className="p-4"><RankedBars currency={currency} color="var(--series-7)" rows={natures.map((n) => ({ label: n.nature === 'unclassified' ? 'Not classified' : SPENDING_NATURE_LABELS[n.nature], valueMinor: n.grossMinor, share: n.sharePercent }))} /></div>
            </Card>
            <Card>
              <CardHeader title="By account" />
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-2 font-medium">Account</th><th className="px-2 py-2 text-right font-medium">In</th><th className="px-2 py-2 text-right font-medium">Out</th><th className="px-5 py-2 text-right font-medium">Net</th></tr></thead>
                <tbody className="tabular divide-y divide-line">
                  {flows.map((f) => (
                    <tr key={f.accountId}>
                      <td className="px-5 py-2">{accountName(accounts, f.accountId)}</td>
                      <td className="px-2 py-2 text-right"><Money minor={f.inflowMinor} currency={currency} /></td>
                      <td className="px-2 py-2 text-right"><Money minor={f.outflowMinor} currency={currency} /></td>
                      <td className="px-5 py-2 text-right font-medium"><Money minor={f.netMinor} currency={currency} signed /></td>
                    </tr>
                  ))}
                  {flows.length === 0 && <tr><td colSpan={4} className="px-5 py-4 text-center text-muted">No activity in this period.</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
