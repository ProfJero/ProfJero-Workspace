import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { where } from 'firebase/firestore';
import clsx from 'clsx';
import { Check, Minus, MoreHorizontal, Plus, Repeat } from 'lucide-react';
import { addDays, dayOfWeek, formatIsoDate, startOfWeek, type HabitDoc, type HabitLogDoc, type IsoDate } from '@profjero/shared';
import { createDoc, createDocWithId, deleteDocument, updateDocFields, useTenantCollection, type WithMeta } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Button, Card, CardHeader, Field, IconButton, Input, PageHeader, ProgressBar, Select, Spinner } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, Menu } from '@/ui/overlays';

type Habit = WithMeta<HabitDoc>;
type HabitLog = WithMeta<HabitLogDoc>;

function useHabits() {
  return useTenantCollection<HabitDoc>(useTenant().tenantId, 'habits');
}
function useHabitLogs(since: IsoDate) {
  return useTenantCollection<HabitLogDoc>(useTenant().tenantId, 'habitLogs', ['since', since], [where('date', '>=', since)]);
}

/** Sets the logged value for a habit on a day (one document per habit per day). */
function setLog(tenantId: string, habit: Habit, date: IsoDate, value: number, existing: HabitLog | undefined) {
  const v = Math.max(0, Math.min(100_000, Math.round(value)));
  if (existing) updateDocFields<HabitLogDoc>(tenantId, 'habitLogs', existing.id, { value: v });
  else createDocWithId<HabitLogDoc>(tenantId, 'habitLogs', `${habit.id}_${date}`, { habitId: habit.id, date, value: v });
}

/** Periods (days or weeks) in a row, ending now, in which the target was met. */
function streak(habit: Habit, logs: HabitLog[], today: IsoDate): number {
  const value = (from: IsoDate, to: IsoDate) => logs.filter((l) => l.habitId === habit.id && l.date >= from && l.date <= to).reduce((a, l) => a + l.value, 0);
  let n = 0;
  if (habit.frequency === 'daily') {
    let d = value(today, today) >= habit.target ? today : addDays(today, -1);
    while (value(d, d) >= habit.target) { n++; d = addDays(d, -1); }
  } else {
    let w = startOfWeek(today);
    if (value(w, addDays(w, 6)) < habit.target) w = addDays(w, -7);
    while (value(w, addDays(w, 6)) >= habit.target) { n++; w = addDays(w, -7); }
  }
  return n;
}

function HabitDialog({ open, onOpenChange, habit }: { open: boolean; onOpenChange: (o: boolean) => void; habit: Habit | null }) {
  const { tenantId } = useTenant();
  const schema = z.object({ name: z.string().trim().min(1, 'Name the habit').max(80), frequency: z.enum(['daily', 'weekly']), target: z.coerce.number().int().min(1).max(1000), unit: z.string().max(30) });
  const defaults = (h: Habit | null) => ({ name: h?.name ?? '', frequency: h?.frequency ?? 'daily', target: h?.target ?? 1, unit: h?.unit ?? '' });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(habit) });
  useEffect(() => {
    if (open) f.reset(defaults(habit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit((v) => {
    if (habit) updateDocFields<HabitDoc>(tenantId, 'habits', habit.id, v);
    else createDoc<HabitDoc>(tenantId, 'habits', { ...v, archived: false });
    toast(habit ? 'Habit updated' : 'Habit added');
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={habit ? 'Edit habit' : 'New habit'} size="sm"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <Field label="Habit" error={e.name?.message}>{(id) => <Input id={id} autoFocus placeholder="e.g. Read, Drink water, Pray" invalid={!!e.name} {...f.register('name')} />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Target" error={e.target?.message}>{(id) => <Input id={id} type="number" min={1} {...f.register('target')} />}</Field>
          <Field label="Unit">{(id) => <Input id={id} placeholder="times" {...f.register('unit')} />}</Field>
          <Field label="Per">{(id) => <Select id={id} {...f.register('frequency')}><option value="daily">Day</option><option value="weekly">Week</option></Select>}</Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function Stepper({ habit, date, logs }: { habit: Habit; date: IsoDate; logs: HabitLog[] }) {
  const { tenantId, can } = useTenant();
  const log = logs.find((l) => l.habitId === habit.id && l.date === date);
  const value = log?.value ?? 0;
  const canWrite = can('workspace.write');
  if (habit.target === 1 && habit.frequency === 'daily') {
    return (
      <button disabled={!canWrite} onClick={() => setLog(tenantId, habit, date, value ? 0 : 1, log)} aria-pressed={value > 0} aria-label={`${habit.name} on ${formatIsoDate(date)}: ${value ? 'done' : 'not done'}`}
        className={clsx('flex size-8 items-center justify-center rounded-lg border', value ? 'border-good bg-good text-white' : 'border-line text-transparent hover:border-line-strong')}>
        <Check className="size-4" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <IconButton label={`Decrease ${habit.name}`} disabled={!canWrite || value === 0} onClick={() => setLog(tenantId, habit, date, value - 1, log)} className="size-7"><Minus className="size-3.5" /></IconButton>
      <span className="tabular w-8 text-center text-sm">{value}</span>
      <IconButton label={`Increase ${habit.name}`} disabled={!canWrite} onClick={() => setLog(tenantId, habit, date, value + 1, log)} className="size-7"><Plus className="size-3.5" /></IconButton>
    </div>
  );
}

/** Dashboard widget. */
export function HabitsToday() {
  const { tenantId, today } = useTenant();
  const habits = (useHabits().data ?? []).filter((h) => !h.archived && h.frequency === 'daily');
  const logs = useHabitLogs(today).data ?? [];
  if (habits.length === 0) return null;
  const done = habits.filter((h) => (logs.find((l) => l.habitId === h.id && l.date === today)?.value ?? 0) >= h.target).length;
  return (
    <Card>
      <CardHeader title="Habits today" description={`${done} of ${habits.length} done`} action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/habits`}>All</Link>} />
      <ul className="divide-y divide-line">
        {habits.map((h) => <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm"><span className="truncate">{h.name}</span><Stepper habit={h} date={today} logs={logs} /></li>)}
      </ul>
    </Card>
  );
}

export function HabitsPage() {
  const { tenantId, today, can } = useTenant();
  const habits = useHabits();
  const since = addDays(startOfWeek(today), -7 * 8);
  const logs = useHabitLogs(since).data ?? [];
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const list = (habits.data ?? []).filter((h) => !h.archived);
  return (
    <>
      <PageHeader title="Habits" description="Small routines tracked day by day."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New habit</Button>} />
      {habits.loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<Repeat className="size-5" />} title="No habits yet" body="Track reading, exercise, prayer, water — anything you want to do regularly." action={can('workspace.write') && <Button onClick={() => setCreating(true)}>Add a habit</Button>} /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">Habit</th>
                {days.map((d) => <th key={d} className={clsx('px-1 py-2 font-medium', d === today && 'text-brand')}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek(d)]}<br />{d.slice(8)}</th>)}
                <th className="px-3 py-2 text-left font-medium">Progress</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((h) => {
                const from = h.frequency === 'daily' ? today : startOfWeek(today);
                const total = logs.filter((l) => l.habitId === h.id && l.date >= from && l.date <= today).reduce((a, l) => a + l.value, 0);
                const s = streak(h, logs, today);
                return (
                  <tr key={h.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-muted">{h.target} {h.unit || 'times'} per {h.frequency === 'daily' ? 'day' : 'week'} · streak {s} {h.frequency === 'daily' ? 'day' : 'week'}{s === 1 ? '' : 's'}</p>
                    </td>
                    {days.map((d) => <td key={d} className="px-1 py-2"><div className="flex justify-center"><Stepper habit={h} date={d} logs={logs} /></div></td>)}
                    <td className="px-3 py-2"><div className="w-28"><ProgressBar value={(total / h.target) * 100} tone={total >= h.target ? 'good' : 'brand'} label={`${h.name} progress`} /><p className="mt-1 text-xs text-muted">{total}/{h.target}</p></div></td>
                    <td className="px-2 py-2">
                      {can('workspace.write') && <Menu label={`Actions for ${h.name}`} trigger={<IconButton label={`Actions for ${h.name}`}><MoreHorizontal className="size-4" /></IconButton>} items={[
                        { label: 'Edit', onSelect: () => setEditing(h) },
                        { label: 'Archive', onSelect: () => updateDocFields<HabitDoc>(tenantId, 'habits', h.id, { archived: true }) },
                        { label: 'Delete', danger: true, onSelect: () => setDeleting(h) },
                      ]} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <HabitDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} habit={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete habit?" confirmLabel="Delete"
        body="The habit is deleted. Archive it instead to keep its history."
        onConfirm={() => { if (deleting) { deleteDocument(tenantId, 'habits', deleting.id); setDeleting(null); toast('Habit deleted'); } }} />
    </>
  );
}
