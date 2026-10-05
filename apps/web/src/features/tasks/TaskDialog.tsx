import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isIsoDate,
  todayInZone,
  type TaskDoc,
} from '@profjero/shared';
import { createDoc, updateDocFields } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Button, Field, Input, Select, Textarea } from '@/ui/primitives';
import { Dialog } from '@/ui/overlays';
import { useGoals, useProjects, type Task } from '../workspace/hooks';
import { useMembers } from '../settings/members';
import { spawnNextOccurrence } from './actions';

const form = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  description: z.string().max(5000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
  dueTime: z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Invalid time'),
  projectId: z.string(),
  goalId: z.string(),
  assigneeId: z.string(),
  labels: z.string().max(400),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']),
});
type FormValues = z.infer<typeof form>;

export const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' } as const;

function toForm(task: Partial<TaskDoc> | null): FormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    dueDate: task?.dueDate ?? '',
    dueTime: task?.dueTime ?? '',
    projectId: task?.projectId ?? '',
    goalId: task?.goalId ?? '',
    assigneeId: task?.assigneeId ?? '',
    labels: (task?.labels ?? []).join(', '),
    recurrence: task?.recurrence?.frequency ?? 'none',
  };
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: Task | null;
  defaults?: Partial<TaskDoc>;
}) {
  const { tenantId, tenant } = useTenant();
  const projects = useProjects().data ?? [];
  const goals = useGoals().data ?? [];
  const members = useMembers().data ?? [];
  const f = useForm<FormValues>({ resolver: zodResolver(form), defaultValues: toForm(task ?? defaults ?? null) });
  useEffect(() => {
    if (open) f.reset(toForm(task ?? defaults ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);
  const e = f.formState.errors;

  const submit = f.handleSubmit((v) => {
    const wasDone = task?.status === 'done';
    const doc: TaskDoc = {
      title: v.title,
      description: v.description,
      status: v.status,
      priority: v.priority,
      dueDate: v.dueDate || null,
      dueTime: v.dueDate && v.dueTime ? v.dueTime : null,
      projectId: v.projectId || null,
      goalId: v.goalId || null,
      assigneeId: v.assigneeId || null,
      labels: [...new Set(v.labels.split(',').map((l) => l.trim()).filter(Boolean))].slice(0, 20),
      recurrence: v.recurrence === 'none' ? null : { frequency: v.recurrence, interval: 1 },
      completedOn: v.status === 'done' ? (wasDone ? (task?.completedOn ?? null) : todayInZone(tenant.timezone)) : null,
    };
    if (task) updateDocFields(tenantId, 'tasks', task.id, doc);
    else createDoc(tenantId, 'tasks', doc);
    if (doc.status === 'done' && !wasDone) spawnNextOccurrence(tenantId, doc, todayInZone(tenant.timezone));
    toast(task ? 'Task updated' : 'Task added');
    onOpenChange(false);
  });

  const openProjects = projects.filter((p) => !p.archived && (p.status !== 'completed' && p.status !== 'cancelled' || p.id === task?.projectId));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()}>{task ? 'Save' : 'Add task'}</Button>
        </>
      }
    >
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="space-y-4">
        <Field label="Title" required error={e.title?.message}>
          {(id) => <Input id={id} autoFocus invalid={!!e.title} {...f.register('title')} />}
        </Field>
        <Field label="Description">{(id) => <Textarea id={id} rows={3} {...f.register('description')} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            {(id) => (
              <Select id={id} {...f.register('status')}>
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(id) => (
              <Select id={id} {...f.register('priority')}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Due date" error={e.dueDate?.message}>{(id) => <Input id={id} type="date" {...f.register('dueDate')} />}</Field>
          <Field label="Time" hint="Optional">{(id, d) => <Input id={id} type="time" aria-describedby={d} {...f.register('dueTime')} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project">
            {(id) => (
              <Select id={id} {...f.register('projectId')}>
                <option value="">None</option>
                {openProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Goal">
            {(id) => (
              <Select id={id} {...f.register('goalId')}>
                <option value="">None</option>
                {goals.filter((g) => g.status !== 'abandoned').map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Assignee">
            {(id) => (
              <Select id={id} {...f.register('assigneeId')}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.uid} value={m.uid}>{m.email ?? m.uid}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Repeats" hint="A new task is created when this one is completed.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} {...f.register('recurrence')}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Labels" hint="Separate with commas.">{(id, d) => <Input id={id} aria-describedby={d} {...f.register('labels')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
