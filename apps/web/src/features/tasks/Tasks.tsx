import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckSquare, Plus } from 'lucide-react';
import { compareTasks, taskBucket, type TaskBucket } from '@profjero/shared';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Button, Card, Input, PageHeader, Select, Spinner } from '@/ui/primitives';
import { EmptyState, InlineError, Tabs } from '@/ui/overlays';
import { useProjects, useTasks } from '../workspace/hooks';
import { TaskDialog } from './TaskDialog';
import { TaskRow } from './TaskList';

const VIEWS = [
  { value: 'focus', label: 'Focus' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'no_date', label: 'No date' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'done', label: 'Completed' },
] as const;
type View = (typeof VIEWS)[number]['value'];

const SECTION_TITLES: Record<TaskBucket, string> = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', no_date: 'No due date', closed: 'Completed' };

export function TasksPage() {
  const { today, can } = useTenant();
  const tasks = useTasks();
  const projects = useProjects().data ?? [];
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('focus');
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const creating = params.get('new') === '1';
  const setCreating = (o: boolean) => setParams(o ? { new: '1' } : {}, { replace: true });
  const uid = useUser().uid;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => !project || t.projectId === project)
      .filter((t) => !term || t.title.toLowerCase().includes(term) || t.description.toLowerCase().includes(term) || t.labels.some((l) => l.toLowerCase().includes(term)))
      .sort(compareTasks);
  }, [tasks.data, project, q]);

  const sections = useMemo(() => {
    const groups = new Map<TaskBucket, typeof filtered>();
    for (const t of filtered) {
      const b = taskBucket(t, today);
      groups.set(b, [...(groups.get(b) ?? []), t]);
    }
    const mine = filtered.filter((t) => t.assigneeId && t.assigneeId === uid && taskBucket(t, today) !== 'closed');
    const pick = (...b: TaskBucket[]) => b.map((k) => [k, groups.get(k) ?? []] as const).filter(([, v]) => v.length > 0);
    switch (view) {
      case 'focus':
        return pick('overdue', 'today');
      case 'upcoming':
        return pick('upcoming');
      case 'no_date':
        return pick('no_date');
      case 'mine':
        return mine.length ? [['today', mine] as const] : [];
      case 'done':
        return [['closed', (groups.get('closed') ?? []).sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''))] as const].filter(([, v]) => v.length);
    }
  }, [filtered, view, today, uid]);

  const counts = useMemo(() => {
    const c = { focus: 0, upcoming: 0, no_date: 0 };
    for (const t of tasks.data ?? []) {
      const b = taskBucket(t, today);
      if (b === 'overdue' || b === 'today') c.focus++;
      else if (b === 'upcoming') c.upcoming++;
      else if (b === 'no_date') c.no_date++;
    }
    return c;
  }, [tasks.data, today]);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything that needs doing, ordered by what is due first."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New task</Button>}
      />
      <Tabs
        className="mb-4"
        value={view}
        onValueChange={(v) => setView(v as View)}
        tabs={VIEWS.map((v) => ({ ...v, count: v.value in counts ? counts[v.value as keyof typeof counts] : undefined }))}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search tasks" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select aria-label="Filter by project" value={project} onChange={(e) => setProject(e.target.value)} className="sm:max-w-xs">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      {tasks.error && <InlineError message={tasks.error} />}
      {tasks.loading ? (
        <Spinner />
      ) : sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckSquare className="size-5" />}
            title={view === 'focus' ? 'Nothing due today' : 'No tasks here'}
            body={view === 'focus' ? 'Overdue tasks and tasks due today appear here.' : 'Try another view or clear the filters.'}
            action={can('workspace.write') && <Button onClick={() => setCreating(true)}>Add a task</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map(([bucket, items]) => (
            <Card key={bucket}>
              <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:px-5">
                {view === 'mine' ? 'Assigned to me' : SECTION_TITLES[bucket]} · {items.length}
              </h2>
              <ul className="divide-y divide-line">
                {items.map((t) => <TaskRow key={t.id} task={t} />)}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <TaskDialog open={creating} onOpenChange={setCreating} task={null} />
    </>
  );
}
