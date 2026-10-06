import { useState } from 'react';
import clsx from 'clsx';
import { Circle, CheckCircle2, MoreHorizontal, Repeat } from 'lucide-react';
import { daysBetween, formatIsoDate, isOpenTask, type IsoDate } from '@profjero/shared';
import { deleteDocument } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Badge, IconButton, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Menu } from '@/ui/overlays';
import { useProjects, type Task } from '../workspace/hooks';
import { completeTask, reopenTask } from './actions';
import { PRIORITY_LABELS, TaskDialog } from './TaskDialog';

export function dueLabel(due: IsoDate, today: IsoDate): { text: string; tone: Tone } {
  const d = daysBetween(today, due);
  if (d < 0) return { text: d === -1 ? 'Yesterday' : `${-d} days overdue`, tone: 'critical' };
  if (d === 0) return { text: 'Today', tone: 'warning' };
  if (d === 1) return { text: 'Tomorrow', tone: 'neutral' };
  if (d < 7) return { text: formatIsoDate(due, 'long').split(',')[0]!, tone: 'neutral' };
  return { text: formatIsoDate(due), tone: 'neutral' };
}

const PRIORITY_TONE = { urgent: 'critical', high: 'warning', medium: 'neutral', low: 'neutral' } as const;

export function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const { tenantId, today, can } = useTenant();
  const uid = useUser().uid;
  const projects = useProjects().data ?? [];
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const open = isOpenTask(task.status);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const canWrite = can('workspace.write');
  // Mirrors the security rule: deleteAny, or a writer deleting their own task.
  const canDelete = can('workspace.deleteAny') || (canWrite && task.createdBy === uid);
  const due = task.dueDate ? dueLabel(task.dueDate, today) : null;

  return (
    <li className="group flex items-start gap-3 px-4 py-3 sm:px-5">
      <button
        disabled={!canWrite}
        onClick={() => (open ? completeTask(tenantId, task, today) : reopenTask(tenantId, task))}
        aria-label={open ? `Mark "${task.title}" as done` : `Reopen "${task.title}"`}
        className="mt-0.5 shrink-0 text-muted hover:text-brand disabled:cursor-default"
      >
        {open ? <Circle className="size-5" /> : <CheckCircle2 className="size-5 text-good" />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => canWrite && setEditing(true)} disabled={!canWrite}>
        <p className={clsx('text-sm font-medium', !open && 'text-muted line-through')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {due && open && <Badge tone={due.tone}>{due.text}{task.dueTime ? ` · ${task.dueTime}` : ''}</Badge>}
          {task.status === 'in_progress' && <Badge tone="brand">In progress</Badge>}
          {task.status === 'blocked' && <Badge tone="warning">Blocked</Badge>}
          {(task.priority === 'urgent' || task.priority === 'high') && open && <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>}
          {showProject && project && <Badge>{project.name}</Badge>}
          {task.recurrence && <Repeat className="size-3.5 text-muted" aria-label="Repeats" />}
          {task.labels.map((l) => <span key={l} className="text-xs text-muted">#{l}</span>)}
        </div>
      </button>
      {canWrite && (
        <Menu
          label="Task actions"
          trigger={<IconButton label="Task actions" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><MoreHorizontal className="size-4" /></IconButton>}
          items={[
            { label: 'Edit', onSelect: () => setEditing(true) },
            { label: 'Delete', danger: true, onSelect: () => setDeleting(true), hidden: !canDelete },
          ]}
        />
      )}
      <TaskDialog open={editing} onOpenChange={setEditing} task={task} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete task?"
        body={<>“{task.title}” will be permanently deleted.</>}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteDocument(tenantId, 'tasks', task.id);
          setDeleting(false);
          toast('Task deleted');
        }}
      />
    </li>
  );
}
