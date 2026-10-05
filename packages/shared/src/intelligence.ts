import { addDays, daysBetween, type IsoDate } from './dates';
import { isOpenTask, projectHealth, type GoalStatus, type ProjectStatus, type TaskStatus } from './workspace';

/**
 * Cross-module workspace signals.
 *
 * Deterministic rules over tasks, projects, goals and the calendar, each
 * with the reason it fired. This is the factual layer a future AI assistant
 * would summarise or prioritise; it must never invent signals of its own.
 */
export interface Signal {
  id: string;
  kind: 'overdue_tasks' | 'project_at_risk' | 'project_overdue' | 'goal_past_target' | 'goal_stalled' | 'overloaded_day' | 'unscheduled_urgent';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  reason: string;
  link: { type: 'tasks' | 'project' | 'goal' | 'calendar'; id?: string };
}

interface Input {
  today: IsoDate;
  tasks: { id: string; title: string; status: TaskStatus; dueDate: IsoDate | null; priority: string; projectId: string | null; goalId: string | null }[];
  projects: { id: string; name: string; status: ProjectStatus; startDate: IsoDate | null; deadline: IsoDate | null; archived: boolean }[];
  projectProgress: Map<string, number>;
  goals: { id: string; title: string; status: GoalStatus; targetDate: IsoDate | null; updatedOn: IsoDate | null }[];
  goalProgress: Map<string, number>;
  /** Timed + all-day events by date for the next 7 days. */
  eventsByDay: Map<IsoDate, number>;
}

export const OVERLOADED_DAY_THRESHOLD = 6;
export const GOAL_STALE_DAYS = 21;

export function workspaceSignals(input: Input): Signal[] {
  const { today } = input;
  const out: Signal[] = [];
  const open = input.tasks.filter((t) => isOpenTask(t.status));

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  if (overdue.length > 0) {
    const oldest = overdue.reduce((a, t) => (t.dueDate! < a ? t.dueDate! : a), today);
    out.push({
      id: 'tasks:overdue',
      kind: 'overdue_tasks',
      severity: overdue.length >= 5 ? 'critical' : 'warning',
      title: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`,
      reason: `The oldest was due ${daysBetween(oldest, today)} day(s) ago. Reschedule or complete them so today's list stays honest.`,
      link: { type: 'tasks' },
    });
  }

  const urgentNoDate = open.filter((t) => t.priority === 'urgent' && !t.dueDate);
  if (urgentNoDate.length > 0) {
    out.push({
      id: 'tasks:urgent-undated',
      kind: 'unscheduled_urgent',
      severity: 'info',
      title: `${urgentNoDate.length} urgent task${urgentNoDate.length === 1 ? ' has' : 's have'} no due date`,
      reason: 'Urgent work without a date never appears in Today or on the calendar.',
      link: { type: 'tasks' },
    });
  }

  for (const p of input.projects) {
    if (p.archived) continue;
    const pct = input.projectProgress.get(p.id) ?? 0;
    const h = projectHealth(p, pct, today);
    if (h === 'overdue') {
      out.push({ id: `project:${p.id}`, kind: 'project_overdue', severity: 'critical', title: `${p.name} is past its deadline`, reason: `The deadline was ${p.deadline}; progress is ${pct}%.`, link: { type: 'project', id: p.id } });
    } else if (h === 'at_risk') {
      out.push({ id: `project:${p.id}`, kind: 'project_at_risk', severity: 'warning', title: `${p.name} is behind schedule`, reason: `It is ${pct}% done, but more than 20 points behind an even pace to its ${p.deadline} deadline.`, link: { type: 'project', id: p.id } });
    }
  }

  for (const g of input.goals) {
    if (g.status !== 'active' && g.status !== 'not_started') continue;
    const pct = input.goalProgress.get(g.id) ?? 0;
    if (g.targetDate && g.targetDate < today && pct < 100) {
      out.push({ id: `goal:${g.id}`, kind: 'goal_past_target', severity: 'warning', title: `"${g.title}" passed its target date`, reason: `Target was ${g.targetDate}; progress is ${pct}%. Set a new date or mark it achieved/abandoned.`, link: { type: 'goal', id: g.id } });
    } else if (g.status === 'active' && g.updatedOn && daysBetween(g.updatedOn, today) >= GOAL_STALE_DAYS) {
      out.push({ id: `goal:${g.id}`, kind: 'goal_stalled', severity: 'info', title: `No progress on "${g.title}" for ${daysBetween(g.updatedOn, today)} days`, reason: `Goals with no updates for ${GOAL_STALE_DAYS}+ days are highlighted so they are not forgotten.`, link: { type: 'goal', id: g.id } });
    }
  }

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const events = input.eventsByDay.get(d) ?? 0;
    const due = open.filter((t) => t.dueDate === d).length;
    if (events + due >= OVERLOADED_DAY_THRESHOLD) {
      out.push({
        id: `day:${d}`,
        kind: 'overloaded_day',
        severity: 'info',
        title: `${d === today ? 'Today' : d} looks overloaded`,
        reason: `${events} event(s) and ${due} task(s) are scheduled. Consider moving some work.`,
        link: { type: 'calendar' },
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
