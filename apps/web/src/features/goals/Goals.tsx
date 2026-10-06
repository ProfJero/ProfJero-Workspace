import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check, Circle, MoreHorizontal, Plus, Target, Trash2 } from 'lucide-react';
import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  compareTasks,
  daysBetween,
  formatIsoDate,
  isIsoDate,
  type GoalDoc,
  type MilestoneDoc,
} from '@profjero/shared';
import { createDoc, deleteDocument, updateDocFields } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, PageHeader, ProgressBar, Select, Spinner, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, Menu, Tabs } from '@/ui/overlays';
import { useGoals, useMilestones, useProgress, useProjects, useTasks, type Goal } from '../workspace/hooks';
import { TaskRow } from '../tasks/TaskList';
import { TaskDialog } from '../tasks/TaskDialog';

const STATUS_TONE: Record<GoalDoc['status'], Tone> = { not_started: 'neutral', active: 'brand', on_hold: 'warning', achieved: 'good', abandoned: 'neutral' };
const CATEGORY_LABELS: Record<GoalDoc['category'], string> = {
  personal: 'Personal', career: 'Career', financial: 'Financial', learning: 'Learning', health: 'Health', business: 'Business', spiritual: 'Spiritual', other: 'Other',
};

function GoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal: Goal | null }) {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const schema = z
    .object({
      title: z.string().trim().min(1, 'Describe the outcome').max(160),
      description: z.string().max(5000),
      why: z.string().max(2000),
      category: z.enum(GOAL_CATEGORIES),
      status: z.enum(GOAL_STATUSES),
      startDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
      targetDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
      measureKind: z.enum(['milestones', 'numeric', 'tasks']),
      measureTarget: z.coerce.number().min(0).max(1_000_000_000),
      measureCurrent: z.coerce.number().min(0).max(1_000_000_000),
      measureUnit: z.string().max(30),
    })
    .refine((v) => v.measureKind !== 'numeric' || v.measureTarget > 0, { path: ['measureTarget'], message: 'Set a target above zero' })
    .refine((v) => !v.startDate || !v.targetDate || v.startDate <= v.targetDate, { path: ['targetDate'], message: 'Target date is before the start date' });
  const defaults = (g: Goal | null) => ({
    title: g?.title ?? '', description: g?.description ?? '', why: g?.why ?? '', category: g?.category ?? 'personal', status: g?.status ?? 'active',
    startDate: g?.startDate ?? '', targetDate: g?.targetDate ?? '', measureKind: g?.measureKind ?? 'milestones',
    measureTarget: g?.measureTarget ?? 0, measureCurrent: g?.measureCurrent ?? 0, measureUnit: g?.measureUnit ?? '',
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(goal) });
  useEffect(() => {
    if (open) f.reset(defaults(goal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);
  const e = f.formState.errors;
  const kind = f.watch('measureKind');
  const submit = f.handleSubmit((v) => {
    const doc: GoalDoc = { ...v, startDate: v.startDate || null, targetDate: v.targetDate || null };
    if (goal) updateDocFields(tenantId, 'goals', goal.id, doc);
    else navigate(`/w/${tenantId}/goals/${createDoc(tenantId, 'goals', doc)}`);
    toast(goal ? 'Goal updated' : 'Goal created');
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit goal' : 'New goal'} description="A goal is an outcome. Projects, tasks and milestones are how you get there." size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void submit()}>Save</Button></>}>
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Outcome" required error={e.title?.message} className="sm:col-span-2">{(id) => <Input id={id} autoFocus placeholder="e.g. Pass the ICAG professional exams" invalid={!!e.title} {...f.register('title')} />}</Field>
        <Field label="Why it matters" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} {...f.register('why')} />}</Field>
        <Field label="Category">{(id) => <Select id={id} {...f.register('category')}>{GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select>}</Field>
        <Field label="Status">{(id) => <Select id={id} {...f.register('status')}>{GOAL_STATUSES.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABELS[s]}</option>)}</Select>}</Field>
        <Field label="Start date">{(id) => <Input id={id} type="date" {...f.register('startDate')} />}</Field>
        <Field label="Target date" error={e.targetDate?.message}>{(id) => <Input id={id} type="date" invalid={!!e.targetDate} {...f.register('targetDate')} />}</Field>
        <Field label="Measure progress by" className="sm:col-span-2" hint={kind === 'milestones' ? 'Completed milestones ÷ all milestones.' : kind === 'tasks' ? 'Done tasks linked to the goal or to its projects.' : 'Current value ÷ target value.'}>
          {(id, d) => <Select id={id} aria-describedby={d} {...f.register('measureKind')}><option value="milestones">Milestones</option><option value="tasks">Linked tasks</option><option value="numeric">A number (e.g. books read, clients won)</option></Select>}
        </Field>
        {kind === 'numeric' && (
          <>
            <Field label="Target" error={e.measureTarget?.message}>{(id) => <Input id={id} type="number" min={0} step="any" {...f.register('measureTarget')} />}</Field>
            <Field label="Unit" hint="e.g. books, clients">{(id) => <Input id={id} {...f.register('measureUnit')} />}</Field>
            <Field label="Current value">{(id) => <Input id={id} type="number" min={0} step="any" {...f.register('measureCurrent')} />}</Field>
          </>
        )}
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} {...f.register('description')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function GoalsPage() {
  const { tenantId, today, can } = useTenant();
  const goals = useGoals();
  const progress = useProgress();
  const [tab, setTab] = useState('active');
  const [creating, setCreating] = useState(false);
  const list = (goals.data ?? [])
    .filter((g) => (tab === 'active' ? ['not_started', 'active', 'on_hold'].includes(g.status) : tab === 'achieved' ? g.status === 'achieved' : g.status === 'abandoned'))
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'));
  return (
    <>
      <PageHeader title="Goals" description="Outcomes you are working towards, and how close you are."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New goal</Button>} />
      <Tabs className="mb-4" value={tab} onValueChange={setTab} tabs={[{ value: 'active', label: 'In progress' }, { value: 'achieved', label: 'Achieved' }, { value: 'abandoned', label: 'Abandoned' }]} />
      {goals.loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<Target className="size-5" />} title="No goals here" body="Set a goal, then link projects and tasks to it." action={can('workspace.write') && <Button onClick={() => setCreating(true)}>Set a goal</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((g) => {
            const p = progress.goal.get(g.id)!;
            const daysLeft = g.targetDate ? daysBetween(today, g.targetDate) : null;
            return (
              <Link key={g.id} to={`/w/${tenantId}/goals/${g.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-xs hover:border-line-strong">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{g.title}</h2>
                  <Badge tone={STATUS_TONE[g.status]}>{GOAL_STATUS_LABELS[g.status]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABELS[g.category]}</p>
                <div className="mt-4 flex justify-between text-xs text-ink-2"><span>{p.label}</span><span className="tabular font-medium">{p.percent}%</span></div>
                <ProgressBar className="mt-1.5" value={p.percent} label={`${g.title} progress`} tone={g.status === 'achieved' ? 'good' : 'brand'} />
                {daysLeft !== null && g.status !== 'achieved' && (
                  <p className={`mt-3 text-xs ${daysLeft < 0 ? 'text-critical-ink' : 'text-muted'}`}>
                    {daysLeft < 0 ? `${-daysLeft} days past target date` : daysLeft === 0 ? 'Target date is today' : `${daysLeft} days left · ${formatIsoDate(g.targetDate!)}`}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <GoalDialog open={creating} onOpenChange={setCreating} goal={null} />
    </>
  );
}

function Milestones({ goal }: { goal: Goal }) {
  const { tenantId, today, can } = useTenant();
  const milestones = (useMilestones().data ?? []).filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const canWrite = can('workspace.write');
  const add = () => {
    if (!title.trim()) return;
    createDoc<MilestoneDoc>(tenantId, 'milestones', {
      goalId: goal.id, title: title.trim().slice(0, 160), dueDate: isIsoDate(due) ? due : null, done: false, doneOn: null,
      order: milestones.length ? Math.max(...milestones.map((m) => m.order)) + 1 : 0,
    });
    setTitle('');
    setDue('');
  };
  return (
    <Card>
      <CardHeader title="Milestones" description={goal.measureKind === 'milestones' ? 'These drive the goal’s progress.' : 'Checkpoints along the way.'} />
      <ul className="divide-y divide-line">
        {milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <button disabled={!canWrite} aria-label={m.done ? `Mark "${m.title}" as not done` : `Mark "${m.title}" as done`}
              onClick={() => updateDocFields<MilestoneDoc>(tenantId, 'milestones', m.id, { done: !m.done, doneOn: m.done ? null : today })}
              className="text-muted hover:text-brand">
              {m.done ? <Check className="size-5 text-good" /> : <Circle className="size-5" />}
            </button>
            <span className={`flex-1 text-sm ${m.done ? 'text-muted line-through' : ''}`}>{m.title}</span>
            {m.dueDate && <span className="text-xs text-muted">{formatIsoDate(m.dueDate)}</span>}
            {canWrite && <IconButton label={`Delete milestone ${m.title}`} className="sm:opacity-0 sm:group-hover:opacity-100" onClick={() => deleteDocument(tenantId, 'milestones', m.id)}><Trash2 className="size-4" /></IconButton>}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input aria-label="New milestone" placeholder="Add a milestone" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input aria-label="Milestone due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-44" />
          <Button type="submit" disabled={!title.trim()}>Add</Button>
        </form>
      )}
    </Card>
  );
}

export function GoalDetailPage() {
  const { id = '' } = useParams();
  const { tenantId, can } = useTenant();
  const uid = useUser().uid;
  const navigate = useNavigate();
  const goals = useGoals();
  const projects = useProjects().data ?? [];
  const tasks = useTasks().data ?? [];
  const allMilestones = useMilestones().data ?? [];
  const progress = useProgress();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [current, setCurrent] = useState('');
  const goal = goals.data?.find((g) => g.id === id);
  const goalTasks = useMemo(() => tasks.filter((t) => t.goalId === id).sort(compareTasks), [tasks, id]);
  if (goals.loading) return <Spinner />;
  if (!goal) return <EmptyState title="Goal not found" action={<Link className="text-brand" to={`/w/${tenantId}/goals`}>Back to goals</Link>} />;
  const p = progress.goal.get(goal.id)!;
  const linkedProjects = projects.filter((pr) => pr.goalId === id);
  const canWrite = can('workspace.write');

  return (
    <>
      <Link to={`/w/${tenantId}/goals`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Goals</Link>
      <PageHeader title={goal.title} description={goal.why || undefined}
        actions={canWrite && (
          <>
            {goal.status !== 'achieved' && <Button variant="primary" onClick={() => updateDocFields<GoalDoc>(tenantId, 'goals', id, { status: 'achieved' })}>Mark achieved</Button>}
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Menu label="More goal actions" trigger={<IconButton label="More"><MoreHorizontal className="size-4" /></IconButton>}
              items={[{ label: 'Delete', danger: true, hidden: !(can('workspace.deleteAny') || goal.createdBy === uid), onSelect: () => setDeleting(true) }]} />
          </>
        )} />
      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[goal.status]}>{GOAL_STATUS_LABELS[goal.status]}</Badge>
          <Badge>{CATEGORY_LABELS[goal.category]}</Badge>
          {goal.targetDate && <Badge>Target {formatIsoDate(goal.targetDate)}</Badge>}
        </div>
        <div className="mt-4 flex justify-between text-sm"><span className="text-ink-2">{p.label}</span><span className="tabular font-semibold">{p.percent}%</span></div>
        <ProgressBar className="mt-2" value={p.percent} label="Goal progress" tone={goal.status === 'achieved' ? 'good' : 'brand'} />
        {goal.measureKind === 'numeric' && canWrite && (
          <form className="mt-4 flex max-w-sm gap-2" onSubmit={(e) => {
            e.preventDefault();
            const n = Number(current);
            if (Number.isFinite(n) && n >= 0) { updateDocFields<GoalDoc>(tenantId, 'goals', id, { measureCurrent: n }); setCurrent(''); toast('Progress updated'); }
          }}>
            <Input aria-label={`Current ${goal.measureUnit || 'value'}`} type="number" min={0} step="any" placeholder={`Current ${goal.measureUnit || 'value'} (${goal.measureCurrent})`} value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Button type="submit" disabled={current === ''}>Update</Button>
          </form>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Milestones goal={goal} />
        <Card>
          <CardHeader title="Projects" description="Projects contributing to this goal." />
          {linkedProjects.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No linked projects. Link one from the project’s settings.</p> : (
            <ul className="divide-y divide-line">
              {linkedProjects.map((pr) => (
                <li key={pr.id}><Link to={`/w/${tenantId}/projects/${pr.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-surface-2"><span>{pr.name}</span><span className="tabular text-muted">{progress.project.get(pr.id)?.percent ?? 0}%</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Tasks" action={canWrite && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add</Button>} />
          {goalTasks.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No tasks linked directly to this goal.</p> : <ul className="divide-y divide-line">{goalTasks.map((t) => <TaskRow key={t.id} task={t} />)}</ul>}
        </Card>
      </div>
      <GoalDialog open={editing} onOpenChange={setEditing} goal={goal} />
      <TaskDialog open={adding} onOpenChange={setAdding} task={null} defaults={{ goalId: id }} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete goal?" confirmLabel="Delete goal"
        body="The goal and its milestones are deleted. Linked tasks and projects are kept and unlinked."
        onConfirm={() => {
          for (const t of goalTasks) updateDocFields(tenantId, 'tasks', t.id, { goalId: null });
          for (const pr of linkedProjects) updateDocFields(tenantId, 'projects', pr.id, { goalId: null });
          for (const m of allMilestones.filter((x) => x.goalId === id)) deleteDocument(tenantId, 'milestones', m.id);
          deleteDocument(tenantId, 'goals', id);
          navigate(`/w/${tenantId}/goals`);
          toast('Goal deleted');
        }} />
    </>
  );
}
