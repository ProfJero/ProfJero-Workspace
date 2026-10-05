import { useMemo } from 'react';
import { Link } from 'react-router';
import { where } from 'firebase/firestore';
import { AlertTriangle, CalendarDays, CheckSquare, Info, NotebookPen, Plus, Wallet, XCircle } from 'lucide-react';
import {
  addDays,
  compareTasks,
  formatIsoDate,
  isOpenTask,
  netPosition,
  presetRange,
  startOfWeek,
  studyStreak,
  summarize,
  taskBucket,
  todayInZone,
  workspaceSignals,
  type StudySessionDoc,
} from '@profjero/shared';
import type { Timestamp } from 'firebase/firestore';
import { useTenantCollection } from '@/lib/data';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Button, Card, CardHeader, ProgressBar, StatTile } from '@/ui/primitives';
import { Money } from '@/ui/money';
import { useEvents, useGoals, useMilestones, useProgress, useProjects, useTasks } from '../workspace/hooks';
import { TaskRow } from '../tasks/TaskList';
import { useAccounts, useAnalysisLedger, useDebts } from '../finance/data';
import { InsightItem, useFinanceInsights } from '../finance/overview';
import { HabitsToday } from '../habits/Habits';

function greeting(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function FinanceSnapshot() {
  const { tenantId, today, currency } = useTenant();
  const accounts = useAccounts().data ?? [];
  const debts = useDebts().data ?? [];
  const ledger = useAnalysisLedger();
  const { insights } = useFinanceInsights();
  const s = summarize(ledger.data ?? [], presetRange('this_month', today), currency);
  const pos = netPosition(accounts.filter((a) => !a.archived), debts, currency);
  return (
    <Card>
      <CardHeader title="Money" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/finance`}>Open finance</Link>} />
      <dl className="space-y-1.5 p-4 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted">Available now</dt><dd><Money minor={pos.liquidMinor} currency={currency} className="font-semibold" /></dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Income this month</dt><dd><Money minor={s.incomeMinor} currency={currency} className="font-semibold" /></dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Spending this month</dt><dd><Money minor={s.netSpendingMinor} currency={currency} className="font-semibold" /></dd></div>
      </dl>
      {insights.length > 0 && <ul className="divide-y divide-line border-t border-line">{insights.slice(0, 3).map((i) => <InsightItem key={i.id} insight={i} />)}</ul>}
    </Card>
  );
}

function StudySnapshot() {
  const { tenantId, today } = useTenant();
  const weekStart = startOfWeek(today);
  const sessions = useTenantCollection<StudySessionDoc>(tenantId, 'studySessions', ['since', addDays(today, -60)], [where('date', '>=', addDays(today, -60))]);
  const list = sessions.data ?? [];
  const minutes = list.filter((s) => s.date >= weekStart).reduce((a, s) => a + s.minutes, 0);
  const streak = studyStreak(list.map((s) => s.date), today);
  return (
    <Card>
      <CardHeader title="Learning" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/learning`}>Open learning</Link>} />
      <div className="grid grid-cols-2 gap-3 p-4 text-sm">
        <div><p className="text-xs text-muted">Studied this week</p><p className="font-semibold">{Math.floor(minutes / 60)}h {minutes % 60}m</p></div>
        <div><p className="text-xs text-muted">Study streak</p><p className="font-semibold">{streak} day{streak === 1 ? '' : 's'}</p></div>
      </div>
    </Card>
  );
}

const SIGNAL_ICON = { critical: XCircle, warning: AlertTriangle, info: Info } as const;

export function DashboardPage() {
  const { tenantId, tenant, today, can } = useTenant();
  const user = useUser();
  const tasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const goals = useGoals().data ?? [];
  const milestones = useMilestones().data ?? [];
  const progress = useProgress();
  const events = useEvents(today, addDays(today, 6)).data ?? [];

  const focus = useMemo(() => tasks.filter((t) => ['overdue', 'today'].includes(taskBucket(t, today))).sort(compareTasks), [tasks, today]);
  const todayEvents = events.filter((e) => e.start.slice(0, 10) <= today && e.end.slice(0, 10) >= today).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = events.filter((e) => e.start.slice(0, 10) > today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
  const activeProjects = projects.filter((p) => p.status === 'active' && !p.archived);
  const activeGoals = goals.filter((g) => g.status === 'active');

  const signals = useMemo(() => {
    const dateOf = (ts: Timestamp | undefined) => (ts ? todayInZone(tenant.timezone, ts.toDate()) : null);
    const eventsByDay = new Map<string, number>();
    for (const e of events) eventsByDay.set(e.start.slice(0, 10), (eventsByDay.get(e.start.slice(0, 10)) ?? 0) + 1);
    return workspaceSignals({
      today,
      tasks,
      projects,
      projectProgress: new Map([...progress.project].map(([k, v]) => [k, v.percent])),
      goals: goals.map((g) => {
        // A goal's last activity: its own edits, its milestones, or tasks completed for it.
        const dates = [dateOf(g.updatedAt), ...milestones.filter((m) => m.goalId === g.id).map((m) => dateOf(m.updatedAt)), ...tasks.filter((t) => t.goalId === g.id).map((t) => t.completedOn)];
        const updatedOn = dates.filter((d): d is string => !!d).sort().pop() ?? null;
        return { id: g.id, title: g.title, status: g.status, targetDate: g.targetDate, updatedOn };
      }),
      goalProgress: new Map([...progress.goal].map(([k, v]) => [k, v.percent])),
      eventsByDay,
    });
  }, [today, tasks, projects, goals, milestones, events, progress, tenant.timezone]);

  const linkFor = (l: (typeof signals)[number]['link']) =>
    l.type === 'tasks' ? `/w/${tenantId}/tasks` : l.type === 'calendar' ? `/w/${tenantId}/calendar` : `/w/${tenantId}/${l.type === 'project' ? 'projects' : 'goals'}/${l.id}`;
  const firstName = (user.displayName ?? '').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tenant.timezone }).format(new Date()));

  return (
    <>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{formatIsoDate(today, 'long')}</p>
          <h1 className="text-xl font-semibold sm:text-2xl">{greeting(hour)}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        {can('workspace.write') && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/w/${tenantId}/tasks?new=1`}><Button size="sm" icon={<Plus className="size-4" />}>Task</Button></Link>
            <Link to={`/w/${tenantId}/notes?new=1`}><Button size="sm" icon={<NotebookPen className="size-4" />}>Note</Button></Link>
            <Link to={`/w/${tenantId}/calendar?new=1`}><Button size="sm" icon={<CalendarDays className="size-4" />}>Event</Button></Link>
            {can('finance.write') && <Link to={`/w/${tenantId}/finance/transactions?new=1`}><Button size="sm" icon={<Wallet className="size-4" />}>Transaction</Button></Link>}
          </div>
        )}
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Due today or overdue" value={String(focus.length)} tone={focus.some((t) => t.dueDate! < today) ? 'critical' : undefined} />
        <StatTile label="Events today" value={String(todayEvents.length)} />
        <StatTile label="Active projects" value={String(activeProjects.length)} />
        <StatTile label="Open tasks" value={String(tasks.filter((t) => isOpenTask(t.status)).length)} />
      </div>

      {signals.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Needs attention" description="Found across your tasks, projects, goals and calendar." />
          <ul className="divide-y divide-line">
            {signals.slice(0, 6).map((s) => {
              const Icon = SIGNAL_ICON[s.severity];
              return (
                <li key={s.id}>
                  <Link to={linkFor(s.link)} className="flex gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${s.severity === 'critical' ? 'text-critical' : s.severity === 'warning' ? 'text-warning-ink' : 'text-brand'}`} aria-label={s.severity} />
                    <span><span className="block text-sm font-medium">{s.title}</span><span className="block text-xs text-ink-2">{s.reason}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Today’s focus" description="Overdue and due today, most urgent first." action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/tasks`}>All tasks</Link>} />
            {focus.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-ink-2"><CheckSquare className="size-5 text-good" /> Nothing due today. Plan ahead from Tasks or the calendar.</div>
            ) : <ul className="divide-y divide-line">{focus.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} />)}</ul>}
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Projects" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/projects`}>All</Link>} />
              {activeProjects.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No active projects.</p> : (
                <ul className="space-y-3 p-4">
                  {activeProjects.slice(0, 5).map((p) => {
                    const pct = progress.project.get(p.id)?.percent ?? 0;
                    return <li key={p.id}><Link to={`/w/${tenantId}/projects/${p.id}`} className="block"><div className="flex justify-between text-sm"><span className="truncate">{p.name}</span><span className="tabular text-muted">{pct}%</span></div><ProgressBar className="mt-1" value={pct} label={`${p.name} progress`} /></Link></li>;
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Goals" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/goals`}>All</Link>} />
              {activeGoals.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No active goals.</p> : (
                <ul className="space-y-3 p-4">
                  {activeGoals.slice(0, 5).map((g) => {
                    const pct = progress.goal.get(g.id)?.percent ?? 0;
                    return <li key={g.id}><Link to={`/w/${tenantId}/goals/${g.id}`} className="block"><div className="flex justify-between text-sm"><span className="truncate">{g.title}</span><span className="tabular text-muted">{pct}%</span></div><ProgressBar className="mt-1" value={pct} label={`${g.title} progress`} /></Link></li>;
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Schedule" action={<Link className="text-xs font-medium text-brand" to={`/w/${tenantId}/calendar`}>Calendar</Link>} />
            <div className="p-4 text-sm">
              {todayEvents.length === 0 ? <p className="text-muted">No events today.</p> : (
                <ul className="space-y-2">{todayEvents.map((e) => <li key={e.id} className="flex gap-3"><span className="tabular w-12 shrink-0 text-muted">{e.allDay ? 'All day' : e.start.slice(11)}</span><span>{e.title}</span></li>)}</ul>
              )}
              {upcoming.length > 0 && (
                <>
                  <p className="mb-2 mt-4 text-xs font-semibold uppercase text-muted">Coming up</p>
                  <ul className="space-y-2">{upcoming.map((e) => <li key={e.id} className="flex gap-3"><span className="w-20 shrink-0 text-muted">{formatIsoDate(e.start.slice(0, 10)).replace(/ \d{4}$/, '')}</span><span className="truncate">{e.title}</span></li>)}</ul>
                </>
              )}
            </div>
          </Card>
          {can('finance.read') && <FinanceSnapshot />}
          <HabitsToday />
          <StudySnapshot />
        </div>
      </div>
    </>
  );
}
