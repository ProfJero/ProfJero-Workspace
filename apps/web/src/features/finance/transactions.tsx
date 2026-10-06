import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, MoreHorizontal, Plus, Receipt, Scale } from 'lucide-react';
import {
  SPENDING_NATURES,
  SPENDING_NATURE_LABELS,
  TRANSACTION_TYPE_LABELS,
  USER_TRANSACTION_TYPES,
  accountEffects,
  categoryName,
  formatIsoDate,
  isIsoDate,
  minorToDecimalString,
  presetRange,
  summarize,
  validateTransaction,
  type DateRange,
  type PeriodPreset,
  type TransactionInput,
} from '@profjero/shared';
import { useAction } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, Field, IconButton, Input, Select, Spinner, StatTile } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Notice } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { useClients, useProjects } from '../workspace/hooks';
import { accountName, useAccounts, useLedger, type StoredTransaction } from './data';

const TYPE_ICON = { income: ArrowDownLeft, expense: ArrowUpRight, refund: ArrowDownLeft, transfer: ArrowLeftRight, adjustment: Scale } as const;

// ───────────────────────────── Form ─────────────────────────────

export function TransactionDialog({ open, onOpenChange, tx }: { open: boolean; onOpenChange: (o: boolean) => void; tx: StoredTransaction | null }) {
  const { tenantId, currency, today, categories } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.toAccountId);
  const projects = useProjects().data ?? [];
  const clients = useClients().data ?? [];
  const create = useAction<{ transactionId: string }>('createTransaction');
  const update = useAction<{ version: number }>('updateTransaction');
  const action = tx ? update : create;

  const schema = z
    .object({
      type: z.enum(USER_TRANSACTION_TYPES),
      amount: z.string(),
      date: z.string().refine(isIsoDate, 'Choose a date'),
      accountId: z.string().min(1, 'Choose an account'),
      toAccountId: z.string(),
      categoryId: z.string(),
      nature: z.string(),
      adjustmentDirection: z.enum(['increase', 'decrease']),
      description: z.string().max(300),
      payee: z.string().max(120),
      reference: z.string().max(120),
      projectId: z.string(),
      clientId: z.string(),
    })
    .superRefine((v, ctx) => {
      const m = moneyError(v.amount, currency);
      if (m) ctx.addIssue({ code: 'custom', path: ['amount'], message: m });
      if (v.type === 'transfer' && !v.toAccountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose where the money went' });
      if (v.type === 'transfer' && v.toAccountId === v.accountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose a different account' });
      if ((v.type === 'income' || v.type === 'expense' || v.type === 'refund') && !v.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category' });
    });
  type V = z.infer<typeof schema>;
  const defaults = (t: StoredTransaction | null): V => ({
    type: (t?.type as V['type']) ?? 'expense',
    amount: t ? minorToDecimalString(t.amountMinor, currency) : '',
    date: t?.date ?? today,
    accountId: t?.accountId ?? accounts[0]?.id ?? '',
    toAccountId: t?.toAccountId ?? '',
    categoryId: t?.categoryId ?? '',
    nature: t?.nature ?? '',
    adjustmentDirection: t?.adjustmentDirection ?? 'increase',
    description: t?.description ?? '',
    payee: t?.payee ?? '',
    reference: t?.reference ?? '',
    projectId: t?.projectId ?? '',
    clientId: t?.clientId ?? '',
  });
  const f = useForm<V>({ resolver: zodResolver(schema), defaultValues: defaults(tx) });
  useEffect(() => {
    if (open) {
      f.reset(defaults(tx));
      action.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tx?.id]);
  const e = f.formState.errors;
  const type = f.watch('type');
  const categoryId = f.watch('categoryId');
  const amountText = f.watch('amount');
  const accountId = f.watch('accountId');
  const kind = type === 'income' ? 'income' : 'expense';
  const categoryOptions = [...categories.values()].filter((c) => c.kind === kind);

  // Suggest the category's usual nature when an expense category is picked.
  useEffect(() => {
    if (type !== 'expense' || f.getValues('nature')) return;
    const n = categories.get(categoryId)?.defaultNature;
    if (n) f.setValue('nature', n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, type]);

  const account = accounts.find((a) => a.id === accountId);
  const amountMinor = moneyError(amountText, currency) ? 0 : toMinor(amountText, currency);
  const outflow = type === 'expense' || type === 'transfer' || (type === 'adjustment' && f.watch('adjustmentDirection') === 'decrease');
  const previousOwnEffect = tx && tx.accountId === accountId ? accountEffects(tx).find((x) => x.accountId === accountId)?.deltaMinor ?? 0 : 0;
  const projected = account ? account.balanceMinor - previousOwnEffect - (outflow ? amountMinor : -amountMinor) : 0;
  const overdraw = account && outflow && (account.type === 'cash' || account.type === 'mobile_money') && projected < 0;

  const submit = f.handleSubmit(async (v) => {
    const input: TransactionInput = {
      type: v.type,
      amountMinor: toMinor(v.amount, currency),
      date: v.date,
      accountId: v.accountId,
      toAccountId: v.type === 'transfer' ? v.toAccountId : null,
      categoryId: v.type === 'transfer' || v.type === 'adjustment' ? null : v.categoryId,
      nature: v.type === 'expense' && v.nature ? (v.nature as TransactionInput['nature']) : null,
      adjustmentDirection: v.type === 'adjustment' ? v.adjustmentDirection : null,
      description: v.description.trim(),
      payee: v.payee.trim() || null,
      reference: v.reference.trim() || null,
      refundOfId: v.type === 'refund' ? (tx?.refundOfId ?? null) : null,
      projectId: v.projectId || null,
      clientId: v.clientId || null,
      goalId: null,
    };
    // Same structural validation the server applies.
    const issues = validateTransaction({ ...input, currency, debtId: null, invoiceId: null }, new Map(accounts.map((a) => [a.id, a])));
    if (issues.length) {
      for (const i of issues) f.setError(i.field as keyof V, { message: i.message });
      return;
    }
    const r = tx
      ? await update.run({ tenantId, transactionId: tx.id, expectedVersion: tx.version, transaction: input })
      : await create.run({ tenantId, transaction: input });
    if (r) {
      toast(tx ? 'Transaction updated' : 'Transaction recorded');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={tx ? 'Edit transaction' : 'Record a transaction'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={action.pending} disabled={accounts.length === 0} onClick={() => void submit()}>{tx ? 'Save changes' : 'Record'}</Button></>}>
      {accounts.length === 0 ? (
        <Notice>Add an account first (Finance → Accounts) — every entry belongs to an account such as Cash, MoMo or a bank account.</Notice>
      ) : (
        <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
          {action.error && <div className="sm:col-span-2"><InlineError message={action.error.message} /></div>}
          <Field label="Type" className="sm:col-span-2">
            {(id) => (
              <div id={id} role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 sm:grid-cols-5">
                {USER_TRANSACTION_TYPES.map((t) => (
                  <label key={t} className={clsx('cursor-pointer rounded-md px-2 py-1.5 text-center text-sm font-medium', type === t ? 'bg-surface shadow-sm text-ink' : 'text-ink-2')}>
                    <input type="radio" value={t} className="sr-only" {...f.register('type')} disabled={!!tx?.refundOfId} />
                    {TRANSACTION_TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <Field label="Amount" required error={e.amount?.message}>{(id) => <MoneyInput id={id} currency={currency} autoFocus invalid={!!e.amount} {...f.register('amount')} />}</Field>
          <Field label="Date" error={e.date?.message}>{(id) => <Input id={id} type="date" invalid={!!e.date} {...f.register('date')} />}</Field>
          <Field label={type === 'transfer' ? 'From account' : 'Account'} error={e.accountId?.message}>
            {(id) => <Select id={id} invalid={!!e.accountId} {...f.register('accountId')}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
          </Field>
          {type === 'transfer' && (
            <Field label="To account" error={e.toAccountId?.message}>
              {(id) => <Select id={id} invalid={!!e.toAccountId} {...f.register('toAccountId')}><option value="">Choose…</option>{accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
            </Field>
          )}
          {type === 'adjustment' && (
            <Field label="Direction" hint="Use adjustments only to correct a balance, e.g. after counting cash.">
              {(id, d) => <Select id={id} aria-describedby={d} {...f.register('adjustmentDirection')}><option value="increase">Increase balance</option><option value="decrease">Decrease balance</option></Select>}
            </Field>
          )}
          {(type === 'income' || type === 'expense' || type === 'refund') && (
            <Field label="Category" error={e.categoryId?.message}>
              {(id) => <Select id={id} invalid={!!e.categoryId} {...f.register('categoryId')}><option value="">Choose…</option>{categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
            </Field>
          )}
          {type === 'expense' && (
            <Field label="Kind of spending" hint="Powers needs-vs-wants insights.">
              {(id, d) => <Select id={id} aria-describedby={d} {...f.register('nature')}><option value="">Not classified</option>{SPENDING_NATURES.map((n) => <option key={n} value={n}>{SPENDING_NATURE_LABELS[n]}</option>)}</Select>}
            </Field>
          )}
          {overdraw && account && (
            <div className="sm:col-span-2"><Notice tone="warning">This would take {account.name} to <Money minor={projected} currency={currency} />. Check the amount, or record the income or transfer that came first.</Notice></div>
          )}
          <Field label="Description" className="sm:col-span-2">{(id) => <Input id={id} {...f.register('description')} />}</Field>
          {type !== 'transfer' && type !== 'adjustment' && <Field label={type === 'income' ? 'From (payer)' : 'Paid to'}>{(id) => <Input id={id} {...f.register('payee')} />}</Field>}
          <Field label="Reference" hint="Receipt, MoMo or bank reference.">{(id, d) => <Input id={id} aria-describedby={d} {...f.register('reference')} />}</Field>
          <Field label="Project">{(id) => <Select id={id} {...f.register('projectId')}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          {clients.length > 0 && <Field label="Client">{(id) => <Select id={id} {...f.register('clientId')}><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

// ───────────────────────────── Row ─────────────────────────────

export function TransactionRow({ tx, onEdit, onVoid }: { tx: StoredTransaction; onEdit?: () => void; onVoid?: () => void }) {
  const { currency, categories } = useTenant();
  const accounts = useAccounts().data;
  const Icon = TYPE_ICON[tx.type as keyof typeof TYPE_ICON] ?? Receipt;
  const signed = tx.type === 'transfer' ? tx.amountMinor : accountEffects({ ...tx, status: 'posted' }).reduce((a, e) => a + e.deltaMinor, 0);
  const title = tx.description || tx.payee || (tx.categoryId ? categoryName(tx.categoryId, categories) : TRANSACTION_TYPE_LABELS[tx.type]);
  const subtitle = tx.type === 'transfer'
    ? `${accountName(accounts, tx.accountId)} → ${accountName(accounts, tx.toAccountId)}`
    : [tx.categoryId ? categoryName(tx.categoryId, categories) : TRANSACTION_TYPE_LABELS[tx.type], accountName(accounts, tx.accountId)].join(' · ');
  const editable = tx.status === 'posted' && !tx.debtId && !tx.invoiceId && (USER_TRANSACTION_TYPES as readonly string[]).includes(tx.type);
  return (
    <li className={clsx('flex items-center gap-3 px-4 py-3 sm:px-5', tx.status === 'void' && 'opacity-60')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate text-sm font-medium', tx.status === 'void' && 'line-through')}>{title}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
        {tx.status === 'void' && <p className="text-xs text-critical-ink">Void{tx.voidReason ? ` — ${tx.voidReason}` : ''}</p>}
      </div>
      <div className="text-right">
        <Money minor={tx.type === 'transfer' ? tx.amountMinor : signed} currency={currency} signed={tx.type !== 'transfer'} className={clsx('text-sm font-semibold', tx.type !== 'transfer' && signed > 0 && 'text-good-ink')} />
        {tx.type === 'expense' && tx.nature && <p className="text-[11px] text-muted">{SPENDING_NATURE_LABELS[tx.nature].split(' ')[0]}</p>}
      </div>
      {(onEdit || onVoid) && tx.status === 'posted' && (
        <Menu label="Transaction actions" trigger={<IconButton label="Transaction actions"><MoreHorizontal className="size-4" /></IconButton>}
          items={[
            { label: 'Edit', onSelect: () => onEdit?.(), hidden: !onEdit || !editable },
            { label: 'Void…', danger: true, onSelect: () => onVoid?.(), hidden: !onVoid || tx.type === 'loan_disbursement' || tx.type === 'loan_receipt' },
          ]} />
      )}
    </li>
  );
}

export function VoidTransactionDialog({ tx, onClose }: { tx: StoredTransaction | null; onClose: () => void }) {
  const { tenantId, currency } = useTenant();
  const action = useAction('voidTransaction');
  return (
    <ConfirmDialog
      open={!!tx}
      onOpenChange={(o) => !o && onClose()}
      title="Void this transaction?"
      confirmLabel="Void"
      requireReason
      pending={action.pending}
      error={action.error?.message}
      body={tx && <>The entry of <Money minor={tx.amountMinor} currency={currency} /> stays in your history marked as void, and every balance it affected is reversed{tx.debtId ? ', including the linked debt' : tx.invoiceId ? ', including the linked invoice' : ''}.</>}
      onConfirm={async (reason) => {
        if (!tx) return;
        if (await action.run({ tenantId, transactionId: tx.id, reason })) {
          toast('Transaction voided');
          onClose();
        }
      }}
    />
  );
}

// ───────────────────────────── Page ─────────────────────────────

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' }, { value: 'last_12_months', label: 'Last 12 months' },
];
const PAGE = 50;

export function TransactionsPage() {
  const { today, currency, categories, can } = useTenant();
  const accounts = useAccounts().data ?? [];
  const [params, setParams] = useSearchParams();
  const [preset, setPreset] = useState<PeriodPreset | 'custom'>('this_month');
  const [custom, setCustom] = useState<DateRange>(presetRange('this_month', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const ledger = useLedger(range);
  const [type, setType] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<StoredTransaction | null>(null);
  const [voiding, setVoiding] = useState<StoredTransaction | null>(null);
  const creating = params.get('new') === '1';

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (ledger.data ?? [])
      .filter((t) => showVoid || t.status === 'posted')
      .filter((t) => !type || t.type === type)
      .filter((t) => !account || t.accountId === account || t.toAccountId === account)
      .filter((t) => !category || t.categoryId === category)
      .filter((t) => !term || [t.description, t.payee ?? '', t.reference ?? ''].some((x) => x.toLowerCase().includes(term)))
      .sort((a, b) => (a.date === b.date ? (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) : b.date.localeCompare(a.date)));
  }, [ledger.data, showVoid, type, account, category, q]);
  const s = summarize(filtered, range, currency);
  const byDate = new Map<string, StoredTransaction[]>();
  for (const t of filtered.slice(0, limit)) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select aria-label="Period" value={preset} onChange={(e) => { setPreset(e.target.value as PeriodPreset); setLimit(PAGE); }} className="w-44">
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          <option value="custom">Custom range</option>
        </Select>
        {preset === 'custom' && (
          <>
            <Input aria-label="From" type="date" value={custom.start} max={custom.end} onChange={(e) => isIsoDate(e.target.value) && setCustom({ ...custom, start: e.target.value })} className="w-40" />
            <Input aria-label="To" type="date" value={custom.end} min={custom.start} onChange={(e) => isIsoDate(e.target.value) && setCustom({ ...custom, end: e.target.value })} className="w-40" />
          </>
        )}
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-40">
          <option value="">All types</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)} className="w-40">
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
          <option value="">All categories</option>
          {[...categories.values()].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-40" />
        <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} /> Show void</label>
        {can('finance.write') && <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>Record</Button>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Income" value={<Money minor={s.incomeMinor} currency={currency} />} />
        <StatTile label="Spending" value={<Money minor={s.netSpendingMinor} currency={currency} />} sub={s.refundsMinor > 0 ? <>after <Money minor={s.refundsMinor} currency={currency} /> refunds</> : undefined} />
        <StatTile label="Net" value={<Money minor={s.netIncomeMinor} currency={currency} signed />} tone={s.netIncomeMinor < 0 ? 'critical' : s.netIncomeMinor > 0 ? 'good' : undefined} />
        <StatTile label="Entries" value={String(s.transactionCount)} sub={`${formatIsoDate(range.start)} – ${formatIsoDate(range.end)}`} />
      </div>

      <Card>
        {ledger.loading ? <Spinner /> : ledger.error ? <div className="p-4"><InlineError message={ledger.error} /></div> : filtered.length === 0 ? (
          <EmptyState icon={<Receipt className="size-5" />} title="No transactions" body="Nothing matches this period and these filters." />
        ) : (
          <>
            {[...byDate.entries()].map(([date, items]) => (
              <section key={date}>
                <h3 className="sticky top-14 z-10 border-b border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold text-ink-2 sm:px-5">{formatIsoDate(date, 'long')}</h3>
                <ul className="divide-y divide-line">
                  {items.map((t) => <TransactionRow key={t.id} tx={t} onEdit={can('finance.write') ? () => setEditing(t) : undefined} onVoid={can('finance.write') ? () => setVoiding(t) : undefined} />)}
                </ul>
              </section>
            ))}
            {filtered.length > limit && (
              <div className="border-t border-line p-3 text-center">
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit}</Button>
              </div>
            )}
          </>
        )}
      </Card>
      <Badge className="mt-3">All amounts in {currency}</Badge>

      <TransactionDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setParams({}, { replace: true }); setEditing(null); } }} tx={editing} />
      <VoidTransactionDialog tx={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

