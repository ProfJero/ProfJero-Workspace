import { type IsoDate, addDays, addMonths, daysBetween } from './dates';

// ───────────────────────────── Tasks ─────────────────────────────

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Task lifecycle:
 *   todo ⇄ in_progress ⇄ blocked
 *   any open state → done | cancelled
 *   done | cancelled → todo (reopen)
 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'blocked', 'done', 'cancelled'],
  in_progress: ['todo', 'blocked', 'done', 'cancelled'],
  blocked: ['todo', 'in_progress', 'done', 'cancelled'],
  done: ['todo'],
  cancelled: ['todo'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isOpenTask(status: TaskStatus): boolean {
  return status !== 'done' && status !== 'cancelled';
}

export type Recurrence = { frequency: 'daily' | 'weekly' | 'monthly'; interval: number } | null;

export function nextDueDate(due: IsoDate, recurrence: NonNullable<Recurrence>): IsoDate {
  const n = Math.max(1, Math.floor(recurrence.interval));
  switch (recurrence.frequency) {
    case 'daily':
      return addDays(due, n);
    case 'weekly':
      return addDays(due, 7 * n);
    case 'monthly':
      return addMonths(due, n);
  }
}

export interface TaskLike {
  status: TaskStatus;
  dueDate: IsoDate | null;
  priority: Priority;
}

export type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'no_date' | 'closed';

export function taskBucket(task: TaskLike, today: IsoDate): TaskBucket {
  if (!isOpenTask(task.status)) return 'closed';
  if (!task.dueDate) return 'no_date';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

/** Overdue first, then by due date, then priority. Tasks without a due date sort last (but are never dropped). */
export function compareTasks(a: TaskLike, b: TaskLike): number {
  const ad = a.dueDate ?? '9999-12-31';
  const bd = b.dueDate ?? '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

// ─────────────────────────── Projects ───────────────────────────

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Project progress has exactly one source, chosen per project:
 *   'tasks'  → done ÷ (all tasks − cancelled), computed, never stored
 *   'manual' → the manually entered percentage
 * A completed project always shows 100%.
 */
export function projectProgress(
  project: { status: ProjectStatus; progressMode: 'tasks' | 'manual'; manualProgress: number },
  tasks: { status: TaskStatus }[],
): { percent: number; done: number; total: number; source: 'tasks' | 'manual' | 'status' } {
  const relevant = tasks.filter((t) => t.status !== 'cancelled');
  const done = relevant.filter((t) => t.status === 'done').length;
  if (project.status === 'completed') return { percent: 100, done, total: relevant.length, source: 'status' };
  if (project.progressMode === 'manual') {
    return { percent: Math.max(0, Math.min(100, Math.round(project.manualProgress))), done, total: relevant.length, source: 'manual' };
  }
  const percent = relevant.length === 0 ? 0 : Math.floor((done * 100) / relevant.length);
  return { percent, done, total: relevant.length, source: 'tasks' };
}

export function projectHealth(
  project: { status: ProjectStatus; deadline: IsoDate | null; startDate: IsoDate | null },
  progressPercent: number,
  today: IsoDate,
): 'on_track' | 'at_risk' | 'overdue' | 'n/a' {
  if (project.status !== 'active' || !project.deadline) return 'n/a';
  if (today > project.deadline) return 'overdue';
  if (project.startDate && project.startDate < project.deadline) {
    const total = daysBetween(project.startDate, project.deadline);
    const elapsed = Math.max(0, daysBetween(project.startDate, today));
    const expected = Math.floor((elapsed * 100) / total);
    if (progressPercent + 20 < expected) return 'at_risk';
  }
  return 'on_track';
}

// ───────────────────────────── Goals ─────────────────────────────

export const GOAL_STATUSES = ['not_started', 'active', 'on_hold', 'achieved', 'abandoned'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: 'Not started',
  active: 'Active',
  on_hold: 'On hold',
  achieved: 'Achieved',
  abandoned: 'Abandoned',
};

export const GOAL_CATEGORIES = ['personal', 'career', 'financial', 'learning', 'health', 'business', 'spiritual', 'other'] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

/**
 * A goal measures progress in exactly one way (goal.measure):
 *   'milestones' → completed ÷ total milestones
 *   'numeric'    → current ÷ target of a stated quantity (e.g. "read 24 books")
 *   'tasks'      → done ÷ open-or-done linked tasks (directly or via linked projects)
 */
export type GoalMeasure =
  | { kind: 'milestones' }
  | { kind: 'numeric'; target: number; current: number; unit: string }
  | { kind: 'tasks' };

export function goalProgress(
  goal: { status: GoalStatus; measure: GoalMeasure },
  milestones: { done: boolean }[],
  tasks: { status: TaskStatus }[],
): { percent: number; label: string } {
  if (goal.status === 'achieved') return { percent: 100, label: 'Achieved' };
  switch (goal.measure.kind) {
    case 'milestones': {
      const done = milestones.filter((m) => m.done).length;
      return {
        percent: milestones.length ? Math.floor((done * 100) / milestones.length) : 0,
        label: `${done} of ${milestones.length} milestones`,
      };
    }
    case 'numeric': {
      const { target, current, unit } = goal.measure;
      const percent = target > 0 ? Math.max(0, Math.min(100, Math.floor((current * 100) / target))) : 0;
      return { percent, label: `${current} of ${target} ${unit}`.trim() };
    }
    case 'tasks': {
      const relevant = tasks.filter((t) => t.status !== 'cancelled');
      const done = relevant.filter((t) => t.status === 'done').length;
      return {
        percent: relevant.length ? Math.floor((done * 100) / relevant.length) : 0,
        label: `${done} of ${relevant.length} tasks`,
      };
    }
  }
}

// ───────────────────────────── Clients ─────────────────────────────

export const CLIENT_STATUSES = ['lead', 'active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

// ───────────────────────────── Learning ─────────────────────────────

export const COURSE_STATUSES = ['planned', 'in_progress', 'paused', 'completed'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export function courseProgress(course: { status: CourseStatus; totalUnits: number; completedUnits: number }): number {
  if (course.status === 'completed') return 100;
  if (course.totalUnits <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((course.completedUnits * 100) / course.totalUnits)));
}

/** Consecutive days (ending today or yesterday) with at least one study session. */
export function studyStreak(sessionDates: IsoDate[], today: IsoDate): number {
  const days = new Set(sessionDates);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
