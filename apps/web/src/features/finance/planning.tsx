import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MoreHorizontal, PiggyBank, Plus, Target } from 'lucide-react';
import {
  evaluateBudget,
  formatIsoDate,
  isIsoDate,
  minorToDecimalString,
  savingsProgress,
  type BudgetStatus,
} from '@profjero/shared';
import { useAction } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, Checkbox, Field, IconButton, Input, ProgressBar, Select, Spinner, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Notice } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { useAccounts, useAnalysisWindow, useBudgets, useLedger, useSavingsContributions, useSavingsGoals, type StoredBudget, type StoredSavingsGoal } from './data';

// ═══════════════════════════════ Budgets ═══════════════════════════════

export const BUDGET_STATUS: Record<BudgetStatus, { label: string; tone: Tone }> = {
  on_track: { label: 'On track', tone: 'good' },
  unused: { label: 'Nothing spent', tone: 'neutral' },
  warning: { label: 'Nearly used', tone: 'warning' },
  at_limit: { label: 'At limit', tone: 'warning' },
  exceeded: { label: 'Over budget', tone: 'critical' },
};

function BudgetDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange: (o: boolean) => void; budget: StoredBudget | null }) {
  const { tenantId, currency, today, categories } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived);
  const save = useAction('saveBudget');
  const schema = z
    .object({
      name: z.string().trim().min(1, 'Name the budget').max(80),
      categoryIds: z.array(z.string()).min(1, 'Pick at least one category'),
      periodKind: z.enum(['monthly', 'custom']),
      start: z.string(),
      end: z.string(),
      amount: z.string().refine((v) => moneyError(v, currency, { allowZero: true }) === null, 'Enter a valid amount'),
      accountIds: z.array(z.string()),
    })
    .refine((v) => v.periodKind === 'monthly' || (isIsoDate(v.start) && isIsoDate(v.end) && v.start <= v.end), { path: ['end'], message: 'Choose a valid date range' });
  const defaults = (b: StoredBudget | null) => ({
    name: b?.name ?? '', categoryIds: b?.categoryIds ?? [], periodKind: b?.period.kind ?? 'monthly',
    start: b?.period.kind === 'custom' ? b.period.start : today, end: b?.period.kind === 'custom' ? b.period.end : today,
    amount: b ? minorToDecimalString(b.amountMinor, currency) : '', accountIds: b?.accountIds ?? [],
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(budget) });
  useEffect(() => {
    if (open) { f.reset(defaults(budget)); save.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget?.id]);
  const e = f.formState.errors;
  const kind = f.watch('periodKind');
  const submit = f.handleSubmit(async (v) => {
    const r = await save.run({
      tenantId, budgetId: budget?.id ?? null,
      budget: {
        name: v.name, categoryIds: v.categoryIds, amountMinor: toMinor(v.amount, currency), currency, accountIds: v.accountIds,
        period: v.periodKind === 'monthly' ? { kind: 'monthly' } : { kind: 'custom', start: v.start, end: v.end },
      },
    });
    if (r) { toast('Budget saved'); onOpenChange(false); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={budget ? 'Edit budget' : 'New budget'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {save.error && <div className="sm:col-span-2"><InlineError message={save.error.message} /></div>}
        <Field label="Name" required error={e.name?.message}>{(id) => <Input id={id} autoFocus placeholder="e.g. Food & groceries" invalid={!!e.name} {...f.register('name')} />}</Field>
        <Field label="Planned amount" error={e.amount?.message}>{(id) => <MoneyInput id={id} currency={currency} invalid={!!e.amount} {...f.register('amount')} />}</Field>
        <Field label="Period">{(id) => <Select id={id} {...f.register('periodKind')}><option value="monthly">Every calendar month</option><option value="custom">Custom dates</option></Select>}</Field>
        {kind === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">{(id) => <Input id={id} type="date" {...f.register('start')} />}</Field>
            <Field label="To" error={e.end?.message}>{(id) => <Input id={id} type="date" {...f.register('end')} />}</Field>
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Categories</legend>
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
            {[...categories.values()].filter((c) => c.kind === 'expense').map((c) => <Checkbox key={c.id} label={c.name} value={c.id} {...f.register('categoryIds')} />)}
          </div>
          {e.categoryIds && <p className="mt-1 text-xs text-critical-ink">{e.categoryIds.message}</p>}
        </fieldset>
        {accounts.length > 1 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Only count spending from <span className="font-normal text-muted">(optional — leave empty for all accounts)</span></legend>
            <div className="flex flex-wrap gap-3">{accounts.map((a) => <Checkbox key={a.id} label={a.name} value={a.id} {...f.register('accountIds')} />)}</div>
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function BudgetsPage() {
  const { tenantId, today, currency, can, categories } = useTenant();
  const budgets = useBudgets();
  const window = useAnalysisWindow();
  const earliest = useMemo(() => [window.start, ...(budgets.data ?? []).flatMap((b) => (b.period.kind === 'custom' ? [b.period.start] : []))].sort()[0]!, [budgets.data, window.start]);
  const ledger = useLedger({ start: earliest, end: window.end });
  const del = useAction('deleteBudget');
  const [editing, setEditing] = useState<StoredBudget | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<StoredBudget | null>(null);
  const evals = (budgets.data ?? []).map((b) => ({ b, e: evaluateBudget(b, ledger.data ?? [], today) }));

  return (
    <>
      <div className="mb-4 flex justify-end">
        {can('finance.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New budget</Button>}
      </div>
      {budgets.loading || ledger.loading ? <Spinner /> : evals.length === 0 ? (
        <Card><EmptyState icon={<Target className="size-5" />} title="No budgets yet" body="Set a monthly limit for groceries, transport or anything else. Spending is tracked automatically from your transactions." action={can('finance.write') && <Button onClick={() => setCreating(true)}>Create a budget</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {evals.map(({ b, e }) => {
            const st = BUDGET_STATUS[e.status];
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="truncate text-xs text-muted">{b.categoryIds.map((c) => categories.get(c)?.name ?? c).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {can('finance.write') && <Menu label={`Actions for ${b.name}`} trigger={<IconButton label={`Actions for ${b.name}`}><MoreHorizontal className="size-4" /></IconButton>}
                      items={[{ label: 'Edit', onSelect: () => setEditing(b) }, { label: 'Delete', danger: true, onSelect: () => setDeleting(b) }]} />}
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between text-sm">
                  <span><Money minor={e.actualMinor} currency={currency} className="font-semibold" /> <span className="text-muted">of <Money minor={e.plannedMinor} currency={currency} /></span></span>
                  <span className="tabular text-muted">{e.percentUsed === null ? '—' : `${e.percentUsed}%`}</span>
                </div>
                <ProgressBar className="mt-2" value={e.percentUsed ?? (e.actualMinor > 0 ? 100 : 0)} tone={st.tone === 'critical' ? 'critical' : st.tone === 'warning' ? 'warning' : 'brand'} label={`${b.name} budget used`} />
                <p className="mt-2 text-xs text-ink-2">
                  {e.exceededMinor > 0 ? <><Money minor={e.exceededMinor} currency={currency} /> over · </> : <><Money minor={e.remainingMinor} currency={currency} /> left · </>}
                  {b.period.kind === 'monthly' ? `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left this month` : `${formatIsoDate(e.range.start)} – ${formatIsoDate(e.range.end)}`}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      <BudgetDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} budget={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete budget?" confirmLabel="Delete" pending={del.pending} error={del.error?.message}
        body="Only the plan is deleted — your transactions are not affected."
        onConfirm={async () => { if (deleting && (await del.run({ tenantId, budgetId: deleting.id }))) { toast('Budget deleted'); setDeleting(null); } }} />
    </>
  );
}

// ═══════════════════════════════ Savings ═══════════════════════════════

function SavingsGoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal: StoredSavingsGoal | null }) {
  const { tenantId, currency } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived);
  const save = useAction('saveSavingsGoal');
  const schema = z.object({
    name: z.string().trim().min(1, 'Name the goal').max(80),
    target: z.string().refine((v) => moneyError(v, currency) === null, 'Enter a target above zero'),
    targetDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
    accountId: z.string(),
  });
  const defaults = (g: StoredSavingsGoal | null) => ({ name: g?.name ?? '', target: g ? minorToDecimalString(g.targetMinor, currency) : '', targetDate: g?.targetDate ?? '', accountId: g?.accountId ?? '' });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(goal) });
  useEffect(() => {
    if (open) { f.reset(defaults(goal)); save.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit(async (v) => {
    const r = await save.run({ tenantId, goalId: goal?.id ?? null, goal: { name: v.name, targetMinor: toMinor(v.target, currency), currency, targetDate: v.targetDate || null, accountId: v.accountId || null } });
    if (r) { toast('Savings goal saved'); onOpenChange(false); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit savings goal' : 'New savings goal'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {save.error && <InlineError message={save.error.message} />}
        <Field label="Name" required error={e.name?.message}>{(id) => <Input id={id} autoFocus placeholder="e.g. Emergency fund" invalid={!!e.name} {...f.register('name')} />}</Field>
        <Field label="Target" error={e.target?.message}>{(id) => <MoneyInput id={id} currency={currency} invalid={!!e.target} {...f.register('target')} />}</Field>
        <Field label="Target date" hint="Optional. Used to work out how much to save each month.">{(id, d) => <Input id={id} type="date" aria-describedby={d} {...f.register('targetDate')} />}</Field>
        <Field label="Savings account" hint="Optional. Deposits can move money into this account automatically.">
          {(id, d) => <Select id={id} aria-describedby={d} {...f.register('accountId')}><option value="">Not linked</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function MovementDialog({ goal, kind, onClose }: { goal: StoredSavingsGoal | null; kind: 'deposit' | 'withdrawal'; onClose: () => void }) {
  const { tenantId, currency, today } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived && a.id !== goal?.accountId);
  const action = useAction('recordSavingsMovement');
  const schema = z.object({
    amount: z.string().refine((v) => moneyError(v, currency) === null, 'Enter an amount above zero'),
    date: z.string().refine(isIsoDate, 'Choose a date'),
    fromAccountId: z.string(),
    note: z.string().max(300),
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { amount: '', date: today, fromAccountId: '', note: '' } });
  useEffect(() => {
    if (goal) { f.reset({ amount: '', date: today, fromAccountId: '', note: '' }); action.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id, kind]);
  const e = f.formState.errors;
  const submit = f.handleSubmit(async (v) => {
    if (!goal) return;
    const r = await action.run({ tenantId, goalId: goal.id, kind, amountMinor: toMinor(v.amount, currency), date: v.date, note: v.note, fromAccountId: kind === 'deposit' && v.fromAccountId ? v.fromAccountId : null });
    if (r) { toast(kind === 'deposit' ? 'Contribution recorded' : 'Withdrawal recorded'); onClose(); }
  });
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()} title={kind === 'deposit' ? `Add to “${goal?.name}”` : `Withdraw from “${goal?.name}”`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void submit()}>Record</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {action.error && <InlineError message={action.error.message} />}
        {kind === 'withdrawal' && goal && <p className="text-sm text-ink-2">Saved so far: <Money minor={goal.savedMinor} currency={currency} /></p>}
        <Field label="Amount" error={e.amount?.message}>{(id) => <MoneyInput id={id} autoFocus currency={currency} invalid={!!e.amount} {...f.register('amount')} />}</Field>
        <Field label="Date" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>
        {kind === 'deposit' && goal?.accountId && (
          <Field label="Move money from" hint="Records a transfer into the goal’s savings account. Leave empty if the money is already there.">
            {(id, d) => <Select id={id} aria-describedby={d} {...f.register('fromAccountId')}><option value="">Don’t move money</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
          </Field>
        )}
        {kind === 'deposit' && !goal?.accountId && <Notice>This goal isn’t linked to an account, so this only records the allocation. Link a savings account to track the money moving too.</Notice>}
        <Field label="Note">{(id) => <Input id={id} {...f.register('note')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function ContributionHistory({ goalId }: { goalId: string }) {
  const { currency } = useTenant();
  const list = useSavingsContributions(goalId).data ?? [];
  if (list.length === 0) return <p className="text-xs text-muted">No contributions yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {list.slice(0, 10).map((c) => (
        <li key={c.id} className="flex justify-between gap-2 py-1.5">
          <span className="text-ink-2">{formatIsoDate(c.date)}{c.note ? ` · ${c.note}` : ''}</span>
          <Money minor={c.kind === 'deposit' ? c.amountMinor : -c.amountMinor} currency={currency} signed className={c.kind === 'deposit' ? 'text-good-ink' : ''} />
        </li>
      ))}
    </ul>
  );
}

export function SavingsPage() {
  const { today, currency, can } = useTenant();
  const goals = useSavingsGoals();
  const accounts = useAccounts().data ?? [];
  const [editing, setEditing] = useState<StoredSavingsGoal | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<{ goal: StoredSavingsGoal; kind: 'deposit' | 'withdrawal' } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const list = (goals.data ?? []).filter((g) => g.status !== 'archived');
  return (
    <>
      <div className="mb-4 flex justify-end">{can('finance.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New goal</Button>}</div>
      {goals.loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<PiggyBank className="size-5" />} title="No savings goals" body="Save towards an emergency fund, school fees or a new laptop and see how much to put aside each month." action={can('finance.write') && <Button onClick={() => setCreating(true)}>Create a goal</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((g) => {
            const p = savingsProgress(g, today);
            const account = accounts.find((a) => a.id === g.accountId);
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{g.name}</h3>
                    <p className="text-xs text-muted">{account ? `Held in ${account.name}` : 'Not linked to an account'}{g.targetDate ? ` · by ${formatIsoDate(g.targetDate)}` : ''}</p>
                  </div>
                  {p.achieved ? <Badge tone="good">Reached</Badge> : p.behindSchedule ? <Badge tone="warning">Behind</Badge> : <Badge tone="brand">On track</Badge>}
                </div>
                <div className="mt-4 flex items-baseline justify-between text-sm">
                  <span><Money minor={p.savedMinor} currency={currency} className="font-semibold" /> <span className="text-muted">of <Money minor={p.targetMinor} currency={currency} /></span></span>
                  <span className="tabular text-muted">{p.percent}%</span>
                </div>
                <ProgressBar className="mt-2" value={p.percent} tone={p.achieved ? 'good' : 'brand'} label={`${g.name} progress`} />
                <p className="mt-2 text-xs text-ink-2">
                  {p.overfundedMinor > 0 ? <><Money minor={p.overfundedMinor} currency={currency} /> above target</> : <><Money minor={p.remainingMinor} currency={currency} /> to go</>}
                  {p.requiredMonthlyMinor && p.requiredMonthlyMinor > 0 ? <> · about <Money minor={p.requiredMonthlyMinor} currency={currency} />/month for {p.monthsLeft} month{p.monthsLeft === 1 ? '' : 's'}</> : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {can('finance.write') && <Button size="sm" variant="primary" onClick={() => setMoving({ goal: g, kind: 'deposit' })}>Add money</Button>}
                  {can('finance.write') && g.savedMinor > 0 && <Button size="sm" onClick={() => setMoving({ goal: g, kind: 'withdrawal' })}>Withdraw</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>{expanded === g.id ? 'Hide history' : 'History'}</Button>
                  {can('finance.write') && <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>}
                </div>
                {expanded === g.id && <div className="mt-3 border-t border-line pt-2"><ContributionHistory goalId={g.id} /></div>}
              </Card>
            );
          })}
        </div>
      )}
      <SavingsGoalDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} goal={editing} />
      <MovementDialog goal={moving?.goal ?? null} kind={moving?.kind ?? 'deposit'} onClose={() => setMoving(null)} />
    </>
  );
}
