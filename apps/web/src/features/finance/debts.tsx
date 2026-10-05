import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { where } from 'firebase/firestore';
import { HandCoins, MoreHorizontal, Plus } from 'lucide-react';
import { debtState, formatIsoDate, isIsoDate, minorToDecimalString, type DebtDisplayStatus } from '@profjero/shared';
import { useAction } from '@/lib/api';
import { useTenantCollection } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, Field, IconButton, Input, ProgressBar, Select, Spinner, StatTile, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Tabs } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { accountName, useAccounts, useDebts, type StoredDebt, type StoredTransaction } from './data';
import { VoidTransactionDialog } from './transactions';

const STATUS: Record<DebtDisplayStatus, { label: string; tone: Tone }> = {
  outstanding: { label: 'Outstanding', tone: 'neutral' },
  partially_paid: { label: 'Partly repaid', tone: 'brand' },
  overdue: { label: 'Overdue', tone: 'critical' },
  settled: { label: 'Settled', tone: 'good' },
  void: { label: 'Void', tone: 'neutral' },
};

function DebtDialog({ open, onOpenChange, direction }: { open: boolean; onOpenChange: (o: boolean) => void; direction: 'lent' | 'borrowed' }) {
  const { tenantId, currency, today } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived);
  const action = useAction('createDebt');
  const schema = z
    .object({
      direction: z.enum(['lent', 'borrowed']),
      counterparty: z.string().trim().min(1, 'Who is it?').max(120),
      amount: z.string().refine((v) => moneyError(v, currency) === null, 'Enter an amount above zero'),
      date: z.string().refine(isIsoDate, 'Choose a date'),
      dueDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
      accountId: z.string(),
      notes: z.string().max(2000),
    })
    .refine((v) => !v.dueDate || v.dueDate >= v.date, { path: ['dueDate'], message: 'Due date is before the loan date' });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { direction, counterparty: '', amount: '', date: today, dueDate: '', accountId: accounts[0]?.id ?? '', notes: '' } });
  useEffect(() => {
    if (open) { f.reset({ direction, counterparty: '', amount: '', date: today, dueDate: '', accountId: accounts[0]?.id ?? '', notes: '' }); action.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction]);
  const e = f.formState.errors;
  const dir = f.watch('direction');
  const submit = f.handleSubmit(async (v) => {
    const r = await action.run({ tenantId, debt: { direction: v.direction, counterparty: v.counterparty, principalMinor: toMinor(v.amount, currency), currency, date: v.date, dueDate: v.dueDate || null, notes: v.notes, accountId: v.accountId || null } });
    if (r) { toast('Recorded'); onOpenChange(false); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={dir === 'lent' ? 'Money I lent' : 'Money I borrowed'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {action.error && <div className="sm:col-span-2"><InlineError message={action.error.message} /></div>}
        <Field label="Type">{(id) => <Select id={id} {...f.register('direction')}><option value="lent">I lent money</option><option value="borrowed">I borrowed money</option></Select>}</Field>
        <Field label={dir === 'lent' ? 'Borrower' : 'Lender'} error={e.counterparty?.message}>{(id) => <Input id={id} autoFocus invalid={!!e.counterparty} {...f.register('counterparty')} />}</Field>
        <Field label="Amount" error={e.amount?.message}>{(id) => <MoneyInput id={id} currency={currency} invalid={!!e.amount} {...f.register('amount')} />}</Field>
        <Field label="Date" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>
        <Field label="Due date" hint="Optional" error={e.dueDate?.message}>{(id, d) => <Input id={id} type="date" aria-describedby={d} invalid={!!e.dueDate} {...f.register('dueDate')} />}</Field>
        <Field label={dir === 'lent' ? 'Paid out of' : 'Received into'} hint="Leave empty if the money didn’t pass through a tracked account.">
          {(id, d) => <Select id={id} aria-describedby={d} {...f.register('accountId')}><option value="">Not tracked</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        </Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} {...f.register('notes')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function RepaymentDialog({ debt, onClose }: { debt: StoredDebt | null; onClose: () => void }) {
  const { tenantId, currency, today } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived);
  const action = useAction<{ remainingMinor: number }>('recordRepayment');
  const remaining = debt ? debt.principalMinor - debt.paidMinor : 0;
  const schema = z.object({
    amount: z.string().superRefine((v, ctx) => {
      const m = moneyError(v, currency);
      if (m) ctx.addIssue({ code: 'custom', message: m });
      else if (toMinor(v, currency) > remaining) ctx.addIssue({ code: 'custom', message: 'More than the outstanding balance' });
    }),
    date: z.string().refine(isIsoDate, 'Choose a date'),
    accountId: z.string(),
    note: z.string().max(300),
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { amount: '', date: today, accountId: '', note: '' } });
  useEffect(() => {
    if (debt) { f.reset({ amount: '', date: today, accountId: debt.accountId ?? '', note: '' }); action.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit(async (v) => {
    if (!debt) return;
    const r = await action.run({ tenantId, debtId: debt.id, amountMinor: toMinor(v.amount, currency), date: v.date, accountId: v.accountId || null, note: v.note });
    if (r) { toast(r.remainingMinor === 0 ? 'Fully repaid' : 'Repayment recorded'); onClose(); }
  });
  return (
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()} title={debt?.direction === 'lent' ? `Repayment from ${debt?.counterparty}` : `Repayment to ${debt?.counterparty}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void submit()}>Record</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {action.error && <InlineError message={action.error.message} />}
        <p className="text-sm text-ink-2">Outstanding: <Money minor={remaining} currency={currency} className="font-semibold text-ink" /></p>
        <Field label="Amount" error={e.amount?.message}>{(id) => (
          <div className="flex gap-2">
            <MoneyInput id={id} autoFocus currency={currency} invalid={!!e.amount} {...f.register('amount')} />
            <Button size="sm" className="h-10" onClick={() => f.setValue('amount', minorToDecimalString(remaining, currency), { shouldValidate: true })}>Full</Button>
          </div>
        )}</Field>
        <Field label="Date" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>
        <Field label={debt?.direction === 'lent' ? 'Received into' : 'Paid from'}>{(id) => <Select id={id} {...f.register('accountId')}><option value="">Not tracked</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
        <Field label="Note">{(id) => <Input id={id} {...f.register('note')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function DebtCard({ debt, onRepay, onVoid }: { debt: StoredDebt; onRepay: () => void; onVoid: () => void }) {
  const { tenantId, today, currency, can } = useTenant();
  const accounts = useAccounts().data;
  const [open, setOpen] = useState(false);
  const [voidingTx, setVoidingTx] = useState<StoredTransaction | null>(null);
  const history = useTenantCollection<StoredTransaction>(open ? tenantId : null, 'transactions', ['debt', debt.id], [where('debtId', '==', debt.id)]);
  const st = debtState(debt, today);
  const s = STATUS[st.status];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{debt.counterparty}</h3>
          <p className="text-xs text-muted">{formatIsoDate(debt.date)}{debt.dueDate ? ` · due ${formatIsoDate(debt.dueDate)}` : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={s.tone}>{s.label}{st.status === 'overdue' ? ` ${st.daysOverdue}d` : ''}</Badge>
          {can('finance.manage') && debt.status !== 'void' && <Menu label="Debt actions" trigger={<IconButton label="Debt actions"><MoreHorizontal className="size-4" /></IconButton>} items={[{ label: 'Void debt…', danger: true, onSelect: onVoid }]} />}
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span><Money minor={st.remainingMinor} currency={currency} className="font-semibold" /> <span className="text-muted">left of <Money minor={debt.principalMinor} currency={currency} /></span></span>
        <span className="tabular text-xs text-muted">{st.percentPaid}% repaid</span>
      </div>
      <ProgressBar className="mt-2" value={st.percentPaid} tone={st.status === 'settled' ? 'good' : st.status === 'overdue' ? 'critical' : 'brand'} label={`${debt.counterparty} repaid`} />
      {debt.notes && <p className="mt-2 text-xs text-ink-2">{debt.notes}</p>}
      {debt.status === 'void' && debt.voidReason && <p className="mt-2 text-xs text-critical-ink">Void — {debt.voidReason}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {can('finance.write') && st.remainingMinor > 0 && debt.status === 'open' && <Button size="sm" variant="primary" onClick={onRepay}>Record repayment</Button>}
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide history' : 'History'}</Button>
      </div>
      {open && (
        <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
          {(history.data ?? []).sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className={t.status === 'void' ? 'text-muted line-through' : 'text-ink-2'}>{formatIsoDate(t.date)} · {t.type.startsWith('loan') ? 'Loan' : 'Repayment'} · {accountName(accounts, t.accountId)}</span>
              <span className="flex items-center gap-2">
                <Money minor={t.amountMinor} currency={currency} />
                {can('finance.write') && t.status === 'posted' && t.type.startsWith('repayment') && <button className="text-xs text-critical-ink hover:underline" onClick={() => setVoidingTx(t)}>Void</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <VoidTransactionDialog tx={voidingTx} onClose={() => setVoidingTx(null)} />
    </Card>
  );
}

export function DebtsPage() {
  const { tenantId, today, currency, can } = useTenant();
  const debts = useDebts();
  const [tab, setTab] = useState<'lent' | 'borrowed'>('lent');
  const [creating, setCreating] = useState(false);
  const [repaying, setRepaying] = useState<StoredDebt | null>(null);
  const [voiding, setVoiding] = useState<StoredDebt | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const voidDebt = useAction('voidDebt');
  const all = (debts.data ?? []) as StoredDebt[];
  const outstanding = (dir: 'lent' | 'borrowed') => all.filter((d) => d.direction === dir).reduce((a, d) => a + debtState(d, today).remainingMinor, 0);
  const list = all
    .filter((d) => d.direction === tab && (showClosed || (d.status === 'open' && d.principalMinor > d.paidMinor)))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label="Others owe me" value={<Money minor={outstanding('lent')} currency={currency} />} />
        <StatTile label="I owe" value={<Money minor={outstanding('borrowed')} currency={currency} />} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'lent' | 'borrowed')} tabs={[{ value: 'lent', label: 'Money I lent' }, { value: 'borrowed', label: 'Money I borrowed' }]} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-2"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Settled & void</label>
          {can('finance.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Record</Button>}
        </div>
      </div>
      {debts.loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<HandCoins className="size-5" />} title={tab === 'lent' ? 'Nobody owes you money' : 'You don’t owe anyone'} body="Record loans to track partial repayments and due dates." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{list.map((d) => <DebtCard key={d.id} debt={d} onRepay={() => setRepaying(d)} onVoid={() => setVoiding(d)} />)}</div>
      )}
      <DebtDialog open={creating} onOpenChange={setCreating} direction={tab} />
      <RepaymentDialog debt={repaying} onClose={() => setRepaying(null)} />
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title="Void this debt?" requireReason confirmLabel="Void debt" pending={voidDebt.pending} error={voidDebt.error?.message}
        body="Use this only if the loan was recorded by mistake. The debt and all its repayments are marked void and every account balance they changed is reversed."
        onConfirm={async (reason) => { if (voiding && (await voidDebt.run({ tenantId, debtId: voiding.id, reason }))) { toast('Debt voided'); setVoiding(null); } }} />
    </>
  );
}
