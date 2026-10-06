import { useMemo } from 'react';
import { orderBy, where } from 'firebase/firestore';
import {
  goalProgress,
  projectProgress,
  type ClientDoc,
  type CourseDoc,
  type EventDoc,
  type GoalDoc,
  type GoalMeasure,
  type MilestoneDoc,
  type NoteDoc,
  type ProjectDoc,
  type TaskDoc,
} from '@profjero/shared';
import { useTenantCollection, type WithMeta } from '@/lib/data';
import { useTenant } from '@/app/tenant';

export type Task = WithMeta<TaskDoc>;
export type Project = WithMeta<ProjectDoc>;
export type Goal = WithMeta<GoalDoc>;
export type Milestone = WithMeta<MilestoneDoc>;
export type Note = WithMeta<NoteDoc>;
export type CalendarEvent = WithMeta<EventDoc>;
export type Client = WithMeta<ClientDoc>;
export type Course = WithMeta<CourseDoc>;

// Collections that are small per workspace are loaded whole and shared via the live cache.
export const useTasks = () => useTenantCollection<TaskDoc>(useTenant().tenantId, 'tasks');
export const useProjects = () => useTenantCollection<ProjectDoc>(useTenant().tenantId, 'projects');
export const useGoals = () => useTenantCollection<GoalDoc>(useTenant().tenantId, 'goals');
export const useMilestones = () => useTenantCollection<MilestoneDoc>(useTenant().tenantId, 'milestones');
export const useCourses = () => useTenantCollection<CourseDoc>(useTenant().tenantId, 'courses');
export const useNotes = () => useTenantCollection<NoteDoc>(useTenant().tenantId, 'notes', ['byUpdated'], [orderBy('updatedAt', 'desc')]);

export function useClients() {
  const { tenantId, can } = useTenant();
  return useTenantCollection<ClientDoc>(can('clients.read') ? tenantId : null, 'clients');
}

/** Events overlapping [from, to] (wall-time strings compare lexicographically). */
export function useEvents(from: string, to: string) {
  const { tenantId } = useTenant();
  return useTenantCollection<EventDoc>(tenantId, 'events', ['range', from, to], [where('start', '<=', `${to}T23:59`), where('start', '>=', `${from}T00:00`), orderBy('start')]);
}

export function goalMeasure(g: GoalDoc): GoalMeasure {
  if (g.measureKind === 'numeric') return { kind: 'numeric', target: g.measureTarget, current: g.measureCurrent, unit: g.measureUnit };
  return { kind: g.measureKind };
}

/** Progress for every project and goal, derived from the same task/milestone data everywhere. */
export function useProgress() {
  const tasks = useTasks().data ?? [];
  const projects = useProjects().data ?? [];
  const goals = useGoals().data ?? [];
  const milestones = useMilestones().data ?? [];
  return useMemo(() => {
    const byProject = new Map<string, Task[]>();
    const byGoal = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.projectId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);
      if (t.goalId) byGoal.set(t.goalId, [...(byGoal.get(t.goalId) ?? []), t]);
    }
    const project = new Map(projects.map((p) => [p.id, projectProgress(p, byProject.get(p.id) ?? [])]));
    const goal = new Map(
      goals.map((g) => {
        // Tasks count toward a goal directly or through projects linked to it.
        const viaProjects = projects.filter((p) => p.goalId === g.id).flatMap((p) => byProject.get(p.id) ?? []);
        const goalTasks = [...new Map([...(byGoal.get(g.id) ?? []), ...viaProjects].map((t) => [t.id, t])).values()];
        return [g.id, goalProgress({ status: g.status, measure: goalMeasure(g) }, milestones.filter((m) => m.goalId === g.id), goalTasks)];
      }),
    );
    return { project, goal, tasksByProject: byProject, tasksByGoal: byGoal };
  }, [tasks, projects, goals, milestones]);
}
