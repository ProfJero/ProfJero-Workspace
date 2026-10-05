import { nextDueDate, type IsoDate, type TaskDoc } from '@profjero/shared';
import { createDoc, updateDocFields } from '@/lib/data';
import type { Task } from '../workspace/hooks';

/**
 * Marks a task done. A recurring task spawns its next occurrence (as a new
 * task) so completed history is preserved rather than overwritten.
 */
export function completeTask(tenantId: string, task: Task, today: IsoDate): void {
  updateDocFields<TaskDoc>(tenantId, 'tasks', task.id, { status: 'done', completedOn: today });
  spawnNextOccurrence(tenantId, task, today);
}

export function spawnNextOccurrence(tenantId: string, task: TaskDoc, today: IsoDate): void {
  if (!task.recurrence) return;
  let next = nextDueDate(task.dueDate ?? today, task.recurrence);
  // Completing an overdue recurring task should not create another overdue one.
  while (next < today) next = nextDueDate(next, task.recurrence);
  createDoc<TaskDoc>(tenantId, 'tasks', {
    title: task.title,
    description: task.description,
    status: 'todo',
    priority: task.priority,
    dueDate: next,
    dueTime: task.dueTime,
    projectId: task.projectId,
    goalId: task.goalId,
    assigneeId: task.assigneeId,
    labels: task.labels,
    recurrence: task.recurrence,
    completedOn: null,
  });
}

export function reopenTask(tenantId: string, task: Task): void {
  updateDocFields<TaskDoc>(tenantId, 'tasks', task.id, { status: 'todo', completedOn: null });
}
