import { describe, expect, it } from 'vitest';
import { workspaceSignals } from '../src';

const base = { today: '2026-10-05', tasks: [], projects: [], projectProgress: new Map(), goals: [], goalProgress: new Map(), eventsByDay: new Map() };
const task = (p: Partial<(typeof base)['tasks'][number]> & { id: string }) => ({ title: p.id, status: 'todo' as const, dueDate: null, priority: 'medium', projectId: null, goalId: null, ...p });

describe('workspace signals', () => {
  it('is quiet when nothing needs attention', () => {
    expect(workspaceSignals(base)).toEqual([]);
  });
  it('flags overdue tasks with the age of the oldest', () => {
    const s = workspaceSignals({ ...base, tasks: [task({ id: 'a', dueDate: '2026-10-01' }), task({ id: 'b', dueDate: '2026-10-04' }), task({ id: 'c', dueDate: '2026-10-01', status: 'done' })] });
    expect(s[0]).toMatchObject({ kind: 'overdue_tasks', title: '2 overdue tasks' });
    expect(s[0]!.reason).toContain('4 day(s) ago');
  });
  it('flags projects behind schedule and past deadline', () => {
    const projects = [
      { id: 'p1', name: 'Website', status: 'active' as const, startDate: '2026-01-01', deadline: '2026-12-31', archived: false },
      { id: 'p2', name: 'Report', status: 'active' as const, startDate: '2026-01-01', deadline: '2026-09-30', archived: false },
    ];
    const s = workspaceSignals({ ...base, projects, projectProgress: new Map([['p1', 10], ['p2', 90]]) });
    expect(s.map((x) => x.kind)).toEqual(['project_overdue', 'project_at_risk']);
  });
  it('flags goals past target and stalled goals', () => {
    const goals = [
      { id: 'g1', title: 'Exam', status: 'active' as const, targetDate: '2026-09-01', updatedOn: '2026-10-01' },
      { id: 'g2', title: 'Fitness', status: 'active' as const, targetDate: null, updatedOn: '2026-08-01' },
    ];
    const s = workspaceSignals({ ...base, goals, goalProgress: new Map([['g1', 40], ['g2', 10]]) });
    expect(s.map((x) => x.kind)).toEqual(['goal_past_target', 'goal_stalled']);
  });
  it('detects overloaded days from events plus due tasks', () => {
    const tasks = [1, 2].map((i) => task({ id: `t${i}`, dueDate: '2026-10-07' }));
    const s = workspaceSignals({ ...base, tasks, eventsByDay: new Map([['2026-10-07', 4]]) });
    expect(s.find((x) => x.kind === 'overloaded_day')?.title).toContain('2026-10-07');
  });
});
