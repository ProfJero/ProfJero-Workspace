import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  EVENT_KINDS,
  addDays,
  addMonths,
  dayOfWeek,
  emptyLinks,
  endOfMonth,
  formatIsoDate,
  isIsoDate,
  isOpenTask,
  startOfMonth,
  startOfWeek,
  type EventDoc,
  type IsoDate,
} from '@profjero/shared';
import { createDoc, deleteDocument, updateDocFields } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, Checkbox, Field, IconButton, Input, PageHeader, Select, Textarea } from '@/ui/primitives';
import { ConfirmDialog, Dialog } from '@/ui/overlays';
import { useEvents, useMilestones, useProjects, useTasks, useCourses, type CalendarEvent } from '../workspace/hooks';
import { TaskDialog } from '../tasks/TaskDialog';

const KIND_LABEL: Record<EventDoc['kind'], string> = { event: 'Event', meeting: 'Meeting', reminder: 'Reminder', study: 'Study', deadline: 'Deadline' };
const KIND_DOT: Record<EventDoc['kind'], string> = { event: 'bg-[var(--series-1)]', meeting: 'bg-[var(--series-7)]', reminder: 'bg-[var(--series-4)]', study: 'bg-[var(--series-3)]', deadline: 'bg-[var(--series-8)]' };

type Item =
  | { type: 'event'; date: IsoDate; time: string | null; title: string; event: CalendarEvent; conflict: boolean }
  | { type: 'task'; date: IsoDate; time: string | null; title: string; taskId: string; overdue: boolean }
  | { type: 'deadline'; date: IsoDate; time: null; title: string };

// ───────────────────────────── Event dialog ─────────────────────────────

function EventDialog({ open, onOpenChange, event, defaultDate }: { open: boolean; onOpenChange: (o: boolean) => void; event: CalendarEvent | null; defaultDate: IsoDate }) {
  const { tenantId, can } = useTenant();
  const projects = useProjects().data ?? [];
  const courses = useCourses().data ?? [];
  const [deleting, setDeleting] = useState(false);
  const schema = z
    .object({
      title: z.string().trim().min(1, 'Add a title').max(200),
      kind: z.enum(EVENT_KINDS),
      allDay: z.boolean(),
      date: z.string().refine(isIsoDate, 'Choose a date'),
      endDate: z.string().refine(isIsoDate, 'Choose a date'),
      startTime: z.string(),
      endTime: z.string(),
      location: z.string().max(200),
      description: z.string().max(5000),
      projectId: z.string(),
      courseId: z.string(),
    })
    .refine((v) => v.allDay || /^\d{2}:\d{2}$/.test(v.startTime), { path: ['startTime'], message: 'Set a start time' })
    .refine((v) => v.allDay || /^\d{2}:\d{2}$/.test(v.endTime), { path: ['endTime'], message: 'Set an end time' })
    .refine((v) => {
      const s = `${v.date}T${v.allDay ? '00:00' : v.startTime}`;
      const e = `${v.endDate}T${v.allDay ? '00:00' : v.endTime}`;
      return e >= s;
    }, { path: ['endTime'], message: 'The event ends before it starts' });
  const defaults = (ev: CalendarEvent | null) => ({
    title: ev?.title ?? '', kind: ev?.kind ?? 'event', allDay: ev?.allDay ?? false,
    date: ev?.start.slice(0, 10) ?? defaultDate, endDate: ev?.end.slice(0, 10) ?? defaultDate,
    startTime: ev && !ev.allDay ? ev.start.slice(11) : '09:00', endTime: ev && !ev.allDay ? ev.end.slice(11) : '10:00',
    location: ev?.location ?? '', description: ev?.description ?? '', projectId: ev?.links.projectId ?? '', courseId: ev?.links.courseId ?? '',
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(event) });
  useEffect(() => {
    if (open) f.reset(defaults(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, defaultDate]);
  const e = f.formState.errors;
  const allDay = f.watch('allDay');
  const submit = f.handleSubmit((v) => {
    const doc: EventDoc = {
      title: v.title, kind: v.kind, allDay: v.allDay,
      start: `${v.date}T${v.allDay ? '00:00' : v.startTime}`, end: `${v.endDate}T${v.allDay ? '00:00' : v.endTime}`,
      location: v.location, description: v.description,
      links: { ...emptyLinks, projectId: v.projectId || null, courseId: v.courseId || null },
    };
    if (event) updateDocFields(tenantId, 'events', event.id, doc);
    else createDoc(tenantId, 'events', doc);
    toast(event ? 'Event updated' : 'Event added');
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={event ? 'Edit event' : 'New event'}
      footer={<>
        {event && can('workspace.write') && <Button variant="ghost" className="mr-auto text-critical-ink" onClick={() => setDeleting(true)}>Delete</Button>}
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        {can('workspace.write') && <Button variant="primary" onClick={() => void submit()}>Save</Button>}
      </>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <Field label="Title" required error={e.title?.message} className="sm:col-span-2">{(id) => <Input id={id} autoFocus invalid={!!e.title} {...f.register('title')} />}</Field>
        <Field label="Type">{(id) => <Select id={id} {...f.register('kind')}>{EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select>}</Field>
        <div className="flex items-end pb-2"><Checkbox label="All day" {...f.register('allDay')} /></div>
        <Field label="Starts" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>
        {!allDay && <Field label="Start time" error={e.startTime?.message}>{(id) => <Input id={id} type="time" {...f.register('startTime')} />}</Field>}
        <Field label="Ends" error={e.endDate?.message}>{(id) => <Input id={id} type="date" {...f.register('endDate')} />}</Field>
        {!allDay && <Field label="End time" error={e.endTime?.message}>{(id) => <Input id={id} type="time" invalid={!!e.endTime} {...f.register('endTime')} />}</Field>}
        <Field label="Location" className="sm:col-span-2">{(id) => <Input id={id} {...f.register('location')} />}</Field>
        <Field label="Project">{(id) => <Select id={id} {...f.register('projectId')}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
        <Field label="Course">{(id) => <Select id={id} {...f.register('courseId')}><option value="">None</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>}</Field>
        <Field label="Details" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} {...f.register('description')} />}</Field>
        <button type="submit" hidden />
      </form>
      {event && (
        <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete event?" body={<>“{event.title}” will be deleted.</>} confirmLabel="Delete"
          onConfirm={() => { deleteDocument(tenantId, 'events', event.id); setDeleting(false); onOpenChange(false); toast('Event deleted'); }} />
      )}
    </Dialog>
  );
}

// ───────────────────────────── Page ─────────────────────────────

/** Timed events on the same day whose time ranges overlap. */
function findConflicts(events: CalendarEvent[]): Set<string> {
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const out = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j]!.start < timed[i]!.end; j++) {
      out.add(timed[i]!.id);
      out.add(timed[j]!.id);
    }
  }
  return out;
}

export function CalendarPage() {
  const { today, can } = useTenant();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(startOfMonth(today));
  const [selected, setSelected] = useState<IsoDate>(today);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const creating = params.get('new') === '1';
  const setCreating = (o: boolean) => setParams(o ? { new: '1' } : {}, { replace: true });

  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const events = useEvents(gridStart, gridEnd);
  const tasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const milestones = useMilestones().data ?? [];

  const byDay = useMemo(() => {
    const map = new Map<IsoDate, Item[]>();
    const push = (d: IsoDate, item: Item) => map.set(d, [...(map.get(d) ?? []), item]);
    const conflicts = findConflicts(events.data ?? []);
    for (const ev of events.data ?? []) {
      // Multi-day events appear on every day they span (within the grid).
      let d = ev.start.slice(0, 10);
      const last = ev.end.slice(0, 10);
      while (d <= last && d <= gridEnd) {
        push(d, { type: 'event', date: d, time: ev.allDay || d !== ev.start.slice(0, 10) ? null : ev.start.slice(11), title: ev.title, event: ev, conflict: conflicts.has(ev.id) });
        d = addDays(d, 1);
      }
    }
    for (const t of tasks) if (t.dueDate && isOpenTask(t.status) && t.dueDate >= gridStart && t.dueDate <= gridEnd) push(t.dueDate, { type: 'task', date: t.dueDate, time: t.dueTime, title: t.title, taskId: t.id, overdue: t.dueDate < today });
    for (const p of projects) if (p.deadline && p.status !== 'completed' && p.status !== 'cancelled' && p.deadline >= gridStart && p.deadline <= gridEnd) push(p.deadline, { type: 'deadline', date: p.deadline, time: null, title: `${p.name} deadline` });
    for (const m of milestones) if (m.dueDate && !m.done && m.dueDate >= gridStart && m.dueDate <= gridEnd) push(m.dueDate, { type: 'deadline', date: m.dueDate, time: null, title: `Milestone: ${m.title}` });
    for (const [k, v] of map) map.set(k, v.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')));
    return map;
  }, [events.data, tasks, projects, milestones, gridStart, gridEnd, today]);

  const days: IsoDate[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const selectedItems = byDay.get(selected) ?? [];
  const conflictCount = new Set([...byDay.values()].flat().filter((i) => i.type === 'event' && i.conflict).map((i) => (i as { event: CalendarEvent }).event.id)).size;

  const renderItem = (i: Item, compact: boolean) => {
    const open = () => (i.type === 'event' ? setEditing(i.event) : i.type === 'task' ? setTaskId(i.taskId) : undefined);
    return (
      <button key={`${i.type}-${i.title}-${i.time}-${i.type === 'event' ? i.event.id : ''}`} onClick={open} disabled={i.type === 'deadline'}
        className={clsx('flex w-full items-center gap-1.5 truncate rounded text-left', compact ? 'px-1 text-[11px]' : 'px-2 py-1.5 text-sm hover:bg-surface-2')}>
        <span className={clsx('size-1.5 shrink-0 rounded-full', i.type === 'event' ? KIND_DOT[i.event.kind] : i.type === 'task' ? 'bg-ink-2' : 'bg-[var(--series-8)]')} aria-hidden />
        {i.time && <span className="tabular text-muted">{i.time}</span>}
        <span className={clsx('truncate', i.type === 'task' && i.overdue && 'text-critical-ink')}>{i.title}</span>
        {i.type === 'event' && i.conflict && <AlertTriangle className="size-3 shrink-0 text-warning-ink" aria-label="Overlaps another event" />}
      </button>
    );
  };

  return (
    <>
      <PageHeader title="Calendar" description="Events, task due dates, deadlines and milestones in one view."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New event</Button>} />
      {conflictCount > 0 && <p className="mb-3 flex items-center gap-2 text-sm text-warning-ink"><AlertTriangle className="size-4" /> {conflictCount} events overlap with another event this view.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-4" /></IconButton>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{formatIsoDate(month, 'month')}</h2>
              <Button size="sm" variant="ghost" onClick={() => { setMonth(startOfMonth(today)); setSelected(today); }}>Today</Button>
            </div>
            <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-4" /></IconButton>
          </div>
          <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7" role="grid" aria-label={formatIsoDate(month, 'month')}>
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              return (
                <div key={d} role="gridcell" aria-selected={d === selected}
                  className={clsx('min-h-14 border-b border-r border-line p-1 sm:min-h-24', !inMonth && 'bg-surface-2/50', d === selected && 'ring-2 ring-inset ring-brand', dayOfWeek(d) === 0 && 'border-r-0')}>
                  <button onClick={() => setSelected(d)} className={clsx('flex size-6 items-center justify-center rounded-full text-xs', d === today ? 'bg-brand font-semibold text-brand-ink' : inMonth ? 'text-ink' : 'text-muted')}
                    aria-label={`${formatIsoDate(d, 'long')}, ${items.length} items`}>
                    {Number(d.slice(8))}
                  </button>
                  <div className="mt-0.5 hidden space-y-0.5 sm:block">
                    {items.slice(0, 3).map((i) => renderItem(i, true))}
                    {items.length > 3 && <button onClick={() => setSelected(d)} className="px-1 text-[11px] text-muted">+{items.length - 3} more</button>}
                  </div>
                  {items.length > 0 && <div className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden>{items.slice(0, 3).map((_, k) => <span key={k} className="size-1 rounded-full bg-brand" />)}</div>}
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">{formatIsoDate(selected, 'long')}</h2>
            {can('workspace.write') && <Button size="sm" onClick={() => setCreating(true)}>Add</Button>}
          </div>
          {selectedItems.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Nothing scheduled.</p> : (
            <div className="space-y-0.5 p-2">
              {selectedItems.map((i) => renderItem(i, false))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            {EVENT_KINDS.map((k) => <Badge key={k} icon={<span className={clsx('size-1.5 rounded-full', KIND_DOT[k])} />}>{KIND_LABEL[k]}</Badge>)}
            <Badge icon={<span className="size-1.5 rounded-full bg-ink-2" />}>Task</Badge>
          </div>
        </Card>
      </div>
      <EventDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} event={editing} defaultDate={selected} />
      <TaskDialog open={!!taskId} onOpenChange={(o) => !o && setTaskId(null)} task={tasks.find((t) => t.id === taskId) ?? null} />
    </>
  );
}
