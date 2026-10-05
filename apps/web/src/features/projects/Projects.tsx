import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { where } from 'firebase/firestore';
import { ArrowLeft, FolderKanban, MoreHorizontal, Plus } from 'lucide-react';
import {
  PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  compareTasks,
  formatIsoDate,
  isIsoDate,
  minorToDecimalString,
  projectHealth,
  summarize,
  type LedgerTransaction,
  type ProjectDoc,
} from '@profjero/shared';
import { createDoc, deleteDocument, updateDocFields, useTenantCollection } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, PageHeader, ProgressBar, Select, Spinner, StatTile, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, Menu, Tabs } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { useClients, useGoals, useNotes, useProgress, useProjects, useTasks, type Project } from '../workspace/hooks';
import { TaskRow } from '../tasks/TaskList';
import { TaskDialog, PRIORITY_LABELS } from '../tasks/TaskDialog';

const STATUS_TONE: Record<ProjectDoc['status'], Tone> = { planning: 'neutral', active: 'brand', on_hold: 'warning', completed: 'good', cancelled: 'neutral' };
const HEALTH = { on_track: { label: 'On track', tone: 'good' }, at_risk: { label: 'At risk', tone: 'warning' }, overdue: { label: 'Past deadline', tone: 'critical' } } as const;

// ───────────────────────────── Dialog ─────────────────────────────

function ProjectDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project | null }) {
  const { tenantId, currency } = useTenant();
  const clients = useClients().data ?? [];
  const goals = useGoals().data ?? [];
  const navigate = useNavigate();
  const schema = z
    .object({
      name: z.string().trim().min(1, 'Name the project').max(120),
      description: z.string().max(5000),
      status: z.enum(PROJECT_STATUSES),
      priority: z.enum(PRIORITIES),
      startDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
      deadline: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
      clientId: z.string(),
      goalId: z.string(),
      budget: z.string().refine((v) => v.trim() === '' || moneyError(v, currency, { allowZero: true }) === null, 'Enter a valid amount'),
      progressMode: z.enum(['tasks', 'manual']),
      manualProgress: z.coerce.number().int().min(0).max(100),
    })
    .refine((v) => !v.startDate || !v.deadline || v.startDate <= v.deadline, { path: ['deadline'], message: 'Deadline is before the start date' });
  const defaults = (p: Project | null) => ({
    name: p?.name ?? '', description: p?.description ?? '', status: p?.status ?? 'active', priority: p?.priority ?? 'medium',
    startDate: p?.startDate ?? '', deadline: p?.deadline ?? '', clientId: p?.clientId ?? '', goalId: p?.goalId ?? '',
    budget: p?.budgetMinor != null ? minorToDecimalString(p.budgetMinor, currency) : '', progressMode: p?.progressMode ?? 'tasks', manualProgress: p?.manualProgress ?? 0,
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(project) });
  useEffect(() => {
    if (open) f.reset(defaults(project));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);
  const e = f.formState.errors;
  const mode = f.watch('progressMode');

  const submit = f.handleSubmit((v) => {
    const doc: ProjectDoc = {
      name: v.name, description: v.description, status: v.status, priority: v.priority,
      startDate: v.startDate || null, deadline: v.deadline || null, clientId: v.clientId || null, goalId: v.goalId || null,
      memberIds: project?.memberIds ?? [], budgetMinor: v.budget.trim() ? toMinor(v.budget, currency) : null,
      progressMode: v.progressMode, manualProgress: v.manualProgress, archived: project?.archived ?? false,
    };
    if (project) updateDocFields(tenantId, 'projects', project.id, doc);
    else navigate(`/w/${tenantId}/projects/${createDoc(tenantId, 'projects', doc)}`);
    toast(project ? 'Project updated' : 'Project created');
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={project ? 'Edit project' : 'New project'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void submit()}>Save</Button></>}>
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e.name?.message} className="sm:col-span-2">{(id) => <Input id={id} autoFocus invalid={!!e.name} {...f.register('name')} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} {...f.register('description')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...f.register('status')}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}</Select>}</Field>
        <Field label="Priority">{(id) => <Select id={id} {...f.register('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</Select>}</Field>
        <Field label="Start date" error={e.startDate?.message}>{(id) => <Input id={id} type="date" {...f.register('startDate')} />}</Field>
        <Field label="Deadline" error={e.deadline?.message}>{(id) => <Input id={id} type="date" invalid={!!e.deadline} {...f.register('deadline')} />}</Field>
        <Field label="Client">{(id) => <Select id={id} {...f.register('clientId')}><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
        <Field label="Goal">{(id) => <Select id={id} {...f.register('goalId')}><option value="">None</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select>}</Field>
        <Field label="Budget" hint="Optional. Compared with spending recorded against this project." error={e.budget?.message}>
          {(id, d) => <MoneyInput id={id} currency={currency} aria-describedby={d} invalid={!!e.budget} {...f.register('budget')} />}
        </Field>
        <Field label="Progress is measured by" hint={mode === 'tasks' ? 'Completed ÷ open tasks (cancelled tasks are ignored).' : 'You set the percentage yourself.'}>
          {(id, d) => <Select id={id} aria-describedby={d} {...f.register('progressMode')}><option value="tasks">Tasks</option><option value="manual">Manual percentage</option></Select>}
        </Field>
        {mode === 'manual' && <Field label="Progress (%)" error={e.manualProgress?.message}>{(id) => <Input id={id} type="number" min={0} max={100} {...f.register('manualProgress')} />}</Field>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ───────────────────────────── List ─────────────────────────────

export function ProjectsPage() {
  const { tenantId, today, can } = useTenant();
  const projects = useProjects();
  const clients = useClients().data ?? [];
  const progress = useProgress();
  const [tab, setTab] = useState('open');
  const [creating, setCreating] = useState(false);

  const list = (projects.data ?? [])
    .filter((p) => (tab === 'archived' ? p.archived : !p.archived && (tab === 'open' ? p.status !== 'completed' && p.status !== 'cancelled' : p.status === 'completed' || p.status === 'cancelled')))
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));

  return (
    <>
      <PageHeader title="Projects" description="Group tasks, notes, people and money around an outcome."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>} />
      <Tabs className="mb-4" value={tab} onValueChange={setTab} tabs={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Completed' }, { value: 'archived', label: 'Archived' }]} />
      {projects.loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<FolderKanban className="size-5" />} title="No projects here" body="Projects connect tasks, notes, clients and finances." action={can('workspace.write') && <Button onClick={() => setCreating(true)}>Create a project</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const pr = progress.project.get(p.id)!;
            const health = projectHealth(p, pr.percent, today);
            const client = clients.find((c) => c.id === p.clientId);
            return (
              <Link key={p.id} to={`/w/${tenantId}/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <Badge tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                </div>
                {client && <p className="mt-0.5 text-xs text-muted">{client.name}</p>}
                <div className="mt-4 flex items-center justify-between text-xs text-ink-2">
                  <span>{pr.source === 'tasks' ? `${pr.done}/${pr.total} tasks` : 'Manual progress'}</span>
                  <span className="tabular font-medium">{pr.percent}%</span>
                </div>
                <ProgressBar className="mt-1.5" value={pr.percent} label={`${p.name} progress`} tone={health === 'overdue' ? 'critical' : health === 'at_risk' ? 'warning' : 'brand'} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.deadline && <Badge>Due {formatIsoDate(p.deadline)}</Badge>}
                  {health !== 'n/a' && <Badge tone={HEALTH[health].tone}>{HEALTH[health].label}</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectDialog open={creating} onOpenChange={setCreating} project={null} />
    </>
  );
}

// ───────────────────────────── Detail ─────────────────────────────

function ProjectFinance({ project }: { project: Project }) {
  const { tenantId, currency } = useTenant();
  const txs = useTenantCollection<LedgerTransaction>(tenantId, 'transactions', ['project', project.id], [where('projectId', '==', project.id)]);
  if (txs.loading) return null;
  const all = { start: '1900-01-01', end: '2200-12-31' };
  const s = summarize(txs.data ?? [], all, currency);
  return (
    <Card>
      <CardHeader title="Money" description="From transactions linked to this project in Finance." />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        <StatTile label="Income" value={<Money minor={s.incomeMinor} currency={currency} />} />
        <StatTile label="Spending" value={<Money minor={s.netSpendingMinor} currency={currency} />} />
        {project.budgetMinor != null && (
          <StatTile
            label="Budget left"
            value={<Money minor={project.budgetMinor - s.netSpendingMinor} currency={currency} />}
            tone={project.budgetMinor - s.netSpendingMinor < 0 ? 'critical' : undefined}
            sub={<>of <Money minor={project.budgetMinor} currency={currency} /></>}
          />
        )}
      </div>
    </Card>
  );
}

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { tenantId, today, can } = useTenant();
  const uid = useUser().uid;
  const navigate = useNavigate();
  const projects = useProjects();
  const tasks = useTasks().data ?? [];
  const notes = useNotes().data ?? [];
  const clients = useClients().data ?? [];
  const goals = useGoals().data ?? [];
  const progress = useProgress();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const project = projects.data?.find((p) => p.id === id);
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === id).sort(compareTasks), [tasks, id]);
  if (projects.loading) return <Spinner />;
  if (!project) return <EmptyState title="Project not found" body="It may have been deleted." action={<Link className="text-brand" to={`/w/${tenantId}/projects`}>Back to projects</Link>} />;

  const pr = progress.project.get(project.id)!;
  const health = projectHealth(project, pr.percent, today);
  const client = clients.find((c) => c.id === project.clientId);
  const goal = goals.find((g) => g.id === project.goalId);
  const linkedNotes = notes.filter((n) => n.links.projectId === id);
  const canDelete = can('workspace.deleteAny') || (can('workspace.write') && project.createdBy === uid);

  return (
    <>
      <Link to={`/w/${tenantId}/projects`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Projects</Link>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        actions={can('workspace.write') && (
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Menu label="More project actions" trigger={<IconButton label="More"><MoreHorizontal className="size-4" /></IconButton>} items={[
              { label: project.archived ? 'Unarchive' : 'Archive', onSelect: () => updateDocFields<ProjectDoc>(tenantId, 'projects', id, { archived: !project.archived }) },
              { label: 'Delete', danger: true, hidden: !canDelete, onSelect: () => setDeleting(true) },
            ]} />
          </>
        )}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={STATUS_TONE[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
        {health !== 'n/a' && <Badge tone={HEALTH[health].tone}>{HEALTH[health].label}</Badge>}
        {project.deadline && <Badge>Deadline {formatIsoDate(project.deadline)}</Badge>}
        {client && <Link to={`/w/${tenantId}/clients/${client.id}`}><Badge tone="brand">Client: {client.name}</Badge></Link>}
        {goal && <Link to={`/w/${tenantId}/goals/${goal.id}`}><Badge tone="brand">Goal: {goal.title}</Badge></Link>}
        {project.archived && <Badge tone="warning">Archived</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Tasks" description={pr.source === 'tasks' ? `${pr.done} of ${pr.total} done` : 'Progress is set manually'}
              action={can('workspace.write') && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add</Button>} />
            <div className="px-4 pt-3 sm:px-5"><ProgressBar value={pr.percent} label="Project progress" /></div>
            {projectTasks.length === 0 ? <EmptyState title="No tasks yet" body="Break the project into tasks to track progress." /> : <ul className="divide-y divide-line">{projectTasks.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</ul>}
          </Card>
        </div>
        <div className="space-y-4">
          {can('finance.read') && <ProjectFinance project={project} />}
          <Card>
            <CardHeader title="Notes" action={can('workspace.write') && <Button size="sm" onClick={() => navigate(`/w/${tenantId}/notes?new=1&projectId=${id}`)}>New</Button>} />
            {linkedNotes.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No notes linked.</p> : (
              <ul className="divide-y divide-line">{linkedNotes.map((n) => <li key={n.id}><Link className="block px-5 py-2.5 text-sm hover:bg-surface-2" to={`/w/${tenantId}/notes?open=${n.id}`}>{n.title}</Link></li>)}</ul>
            )}
          </Card>
        </div>
      </div>

      <ProjectDialog open={editing} onOpenChange={setEditing} project={project} />
      <TaskDialog open={adding} onOpenChange={setAdding} task={null} defaults={{ projectId: id, goalId: project.goalId }} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete project?" confirmLabel="Delete project"
        body={<>The project is deleted. Its {projectTasks.length} task(s) are kept and unlinked; financial records keep their history.</>}
        onConfirm={() => {
          for (const t of projectTasks) updateDocFields(tenantId, 'tasks', t.id, { projectId: null });
          deleteDocument(tenantId, 'projects', id);
          navigate(`/w/${tenantId}/projects`);
          toast('Project deleted');
        }} />
    </>
  );
}
