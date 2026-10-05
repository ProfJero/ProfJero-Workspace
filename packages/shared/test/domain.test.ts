import { describe, expect, it } from 'vitest';
import {
  type Debt,
  can,
  canAssignRole,
  canRemoveMember,
  canTransition,
  categoryMap,
  cleanDocumentText,
  compareTasks,
  courseProgress,
  financeInsights,
  financialHealth,
  goalProgress,
  nextDueDate,
  projectHealth,
  projectProgress,
  speechChunks,
  splitSentences,
  studyStreak,
  taskBucket,
  toUserError,
  PERMISSIONS,
  ROLES,
} from '../src';
import { account, tx } from './fixtures';

describe('permissions', () => {
  it('viewers cannot write, delete finance, invite or change settings', () => {
    for (const p of ['workspace.write', 'finance.write', 'finance.read', 'members.manage', 'tenant.update', 'finance.manage'] as const) {
      expect(can('viewer', p)).toBe(false);
    }
    expect(can('viewer', 'workspace.read')).toBe(true);
  });
  it('members have no finance access', () => {
    expect(can('member', 'finance.read')).toBe(false);
    expect(can('member', 'workspace.write')).toBe(true);
  });
  it('owner holds every permission', () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can('owner', p)).toBe(true);
  });
  it('permission lists contain only known roles', () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(ROLES).toContain(r);
  });
  it('null role has no permissions', () => {
    expect(can(null, 'workspace.read')).toBe(false);
  });
  it('prevents privilege escalation', () => {
    const base = { actorUid: 'a', targetUid: 'b' };
    expect(canAssignRole({ ...base, actorRole: 'admin', currentRole: 'member', newRole: 'admin' }).ok).toBe(false);
    expect(canAssignRole({ ...base, actorRole: 'admin', currentRole: 'member', newRole: 'manager' }).ok).toBe(true);
    expect(canAssignRole({ ...base, actorRole: 'admin', currentRole: 'admin', newRole: 'member' }).ok).toBe(false);
    expect(canAssignRole({ ...base, actorRole: 'owner', currentRole: 'member', newRole: 'admin' }).ok).toBe(true);
    expect(canAssignRole({ ...base, actorRole: 'owner', currentRole: 'member', newRole: 'owner' }).ok).toBe(false);
    expect(canAssignRole({ ...base, actorRole: 'manager', currentRole: 'viewer', newRole: 'member' }).ok).toBe(false);
    expect(canAssignRole({ actorUid: 'a', targetUid: 'a', actorRole: 'owner', currentRole: 'owner', newRole: 'admin' }).ok).toBe(false);
  });
  it('owner cannot be removed; members may leave', () => {
    expect(canRemoveMember({ actorRole: 'admin', actorUid: 'a', targetUid: 'o', targetRole: 'owner' }).ok).toBe(false);
    expect(canRemoveMember({ actorRole: 'owner', actorUid: 'o', targetUid: 'o', targetRole: 'owner' }).ok).toBe(false);
    expect(canRemoveMember({ actorRole: 'viewer', actorUid: 'v', targetUid: 'v', targetRole: 'viewer' }).ok).toBe(true);
    expect(canRemoveMember({ actorRole: 'member', actorUid: 'm', targetUid: 'x', targetRole: 'viewer' }).ok).toBe(false);
  });
});

describe('tasks', () => {
  it('follows the lifecycle', () => {
    expect(canTransition('todo', 'done')).toBe(true);
    expect(canTransition('done', 'in_progress')).toBe(false);
    expect(canTransition('done', 'todo')).toBe(true);
  });
  it('buckets by due date without dropping undated tasks (legacy bug D1)', () => {
    const today = '2026-10-05';
    expect(taskBucket({ status: 'todo', dueDate: null, priority: 'low' }, today)).toBe('no_date');
    expect(taskBucket({ status: 'todo', dueDate: '2026-10-04', priority: 'low' }, today)).toBe('overdue');
    expect(taskBucket({ status: 'done', dueDate: '2026-10-04', priority: 'low' }, today)).toBe('closed');
    const sorted = [
      { status: 'todo' as const, dueDate: null, priority: 'urgent' as const },
      { status: 'todo' as const, dueDate: '2026-10-05', priority: 'low' as const },
      { status: 'todo' as const, dueDate: '2026-10-05', priority: 'high' as const },
    ].sort(compareTasks);
    expect(sorted.map((t) => t.priority)).toEqual(['high', 'low', 'urgent']);
  });
  it('computes the next recurrence', () => {
    expect(nextDueDate('2026-01-31', { frequency: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextDueDate('2026-10-05', { frequency: 'weekly', interval: 2 })).toBe('2026-10-19');
  });
});

describe('progress rules', () => {
  const tasks = [{ status: 'done' as const }, { status: 'todo' as const }, { status: 'cancelled' as const }, { status: 'done' as const }];
  it('project progress from tasks ignores cancelled tasks', () => {
    expect(projectProgress({ status: 'active', progressMode: 'tasks', manualProgress: 90 }, tasks)).toMatchObject({ percent: 66, source: 'tasks' });
  });
  it('manual progress is used only when chosen', () => {
    expect(projectProgress({ status: 'active', progressMode: 'manual', manualProgress: 40 }, tasks).percent).toBe(40);
    expect(projectProgress({ status: 'completed', progressMode: 'manual', manualProgress: 40 }, tasks).percent).toBe(100);
    expect(projectProgress({ status: 'active', progressMode: 'tasks', manualProgress: 0 }, []).percent).toBe(0);
  });
  it('flags projects at risk', () => {
    const p = { status: 'active' as const, startDate: '2026-01-01', deadline: '2026-12-31' };
    expect(projectHealth(p, 10, '2026-10-01')).toBe('at_risk');
    expect(projectHealth(p, 70, '2026-10-01')).toBe('on_track');
    expect(projectHealth(p, 99, '2027-01-01')).toBe('overdue');
  });
  it('goal progress uses exactly one measure', () => {
    expect(goalProgress({ status: 'active', measure: { kind: 'milestones' } }, [{ done: true }, { done: false }, { done: false }], []).percent).toBe(33);
    expect(goalProgress({ status: 'active', measure: { kind: 'numeric', target: 24, current: 30, unit: 'books' } }, [], []).percent).toBe(100);
    expect(goalProgress({ status: 'active', measure: { kind: 'numeric', target: 0, current: 5, unit: '' } }, [], []).percent).toBe(0);
    expect(goalProgress({ status: 'active', measure: { kind: 'tasks' } }, [], tasks).percent).toBe(66);
    expect(goalProgress({ status: 'achieved', measure: { kind: 'milestones' } }, [], []).percent).toBe(100);
  });
  it('learning progress and streaks', () => {
    expect(courseProgress({ status: 'in_progress', totalUnits: 0, completedUnits: 3 })).toBe(0);
    expect(courseProgress({ status: 'in_progress', totalUnits: 12, completedUnits: 3 })).toBe(25);
    expect(studyStreak(['2026-10-03', '2026-10-04'], '2026-10-05')).toBe(2);
    expect(studyStreak(['2026-10-03', '2026-10-05', '2026-10-04'], '2026-10-05')).toBe(3);
    expect(studyStreak(['2026-10-01'], '2026-10-05')).toBe(0);
  });
});

describe('financial health score', () => {
  it('is transparent and reports insufficient data instead of inventing a number', () => {
    const h = financialHealth({ accounts: [], transactions: [], debts: [], budgets: [], currency: 'GHS', today: '2026-04-15' });
    expect(h.score).toBeNull();
    expect(h.band).toBe('insufficient_data');
    for (const c of h.components) expect(c.explanation.length).toBeGreaterThan(0);
  });
  it('scores a healthy profile highly and explains each component', () => {
    const months = ['2026-01-10', '2026-02-10', '2026-03-10'];
    const txs = months.flatMap((date) => [
      tx({ type: 'income', amountMinor: 500000, date }),
      tx({ type: 'expense', amountMinor: 300000, date, nature: 'need' }),
      tx({ type: 'expense', amountMinor: 50000, date, nature: 'want' }),
    ]);
    const h = financialHealth({
      accounts: [account('bank', 0, { balanceMinor: 2_100_000 })],
      transactions: txs, debts: [], budgets: [], currency: 'GHS', today: '2026-04-15',
    });
    const byKey = Object.fromEntries(h.components.map((c) => [c.key, c]));
    expect(byKey.savings_rate!.score).toBe(100); // kept 30%
    expect(byKey.emergency_reserve!.score).toBe(100); // 6 months
    expect(byKey.debt_burden!.score).toBe(100);
    expect(byKey.budget_adherence!.available).toBe(false);
    expect(h.score).toBe(100);
    expect(h.window).toEqual({ start: '2026-01-01', end: '2026-03-31' });
  });
  it('penalises overdue borrowing', () => {
    const debt: Debt = { id: 'd', direction: 'borrowed', counterparty: 'Bank', principalMinor: 100000, currency: 'GHS', date: '2026-01-01', dueDate: '2026-02-01', paidMinor: 0, status: 'open', notes: '' };
    const h = financialHealth({ accounts: [], transactions: [tx({ type: 'income', amountMinor: 1000, date: '2026-03-01' })], debts: [debt], budgets: [], currency: 'GHS', today: '2026-04-15' });
    expect(h.components.find((c) => c.key === 'overdue')!.score).toBe(65);
  });
});

describe('insights', () => {
  const categories = categoryMap();
  it('every insight explains why it is shown', () => {
    const txs = [
      ...['2026-06-05', '2026-07-05', '2026-08-05'].map((date) => tx({ type: 'expense', amountMinor: 20000, date, categoryId: 'eating_out' })),
      tx({ type: 'expense', amountMinor: 60000, date: '2026-09-10', categoryId: 'eating_out' }),
      tx({ type: 'income', amountMinor: 10000, date: '2026-09-02' }),
    ];
    const out = financeInsights({ transactions: txs, debts: [], budgets: [], savingsGoals: [], categories, currency: 'GHS', today: '2026-09-15' });
    const increase = out.find((i) => i.kind === 'spending_increase');
    expect(increase).toBeDefined();
    expect(out.find((i) => i.kind === 'negative_cash_flow')).toBeDefined();
    for (const i of out) {
      expect(i.reason.length).toBeGreaterThan(10);
      expect(i.evidence.length).toBeGreaterThan(0);
    }
  });
  it('detects recurring expenses with consistent amounts', () => {
    const txs = ['2026-06-03', '2026-07-03', '2026-08-04'].map((date) => tx({ type: 'expense', amountMinor: 9900, date, payee: 'Netflix', categoryId: 'subscriptions' }));
    const out = financeInsights({ transactions: txs, debts: [], budgets: [], savingsGoals: [], categories, currency: 'GHS', today: '2026-09-05' });
    expect(out.find((i) => i.kind === 'recurring_expense')?.title).toContain('Netflix');
  });
  it('is deterministic', () => {
    const args = { transactions: [tx({ type: 'expense', amountMinor: 5, date: '2026-09-01' })], debts: [], budgets: [], savingsGoals: [], categories, currency: 'GHS' as const, today: '2026-09-15' };
    expect(financeInsights(args)).toEqual(financeInsights(args));
  });
});

describe('study companion text', () => {
  it('removes page numbers and running headers, rejoins wrapped lines', () => {
    const pages = [1, 2, 3, 4].map(
      (n) => `Introduction to Economics\nSection ${n}: the study of scarce resources is called eco-\nnomics, and it matters on page ${n}.\n\n${['Supply meets demand.', 'Prices adjust over time.', 'Markets clear eventually.', 'Governments intervene sometimes.'][n - 1]}\nPage ${n} of 4`,
    );
    const cleaned = cleanDocumentText(pages);
    expect(cleaned).toHaveLength(4);
    expect(cleaned[0]!.paragraphs).toEqual(['Section 1: the study of scarce resources is called economics, and it matters on page 1.', 'Supply meets demand.']);
    expect(cleaned.flatMap((p) => p.paragraphs).join(' ')).not.toMatch(/Page \d/);
  });
  it('drops lone numbers, urls and citations', () => {
    const [p] = cleanDocumentText(['12\nSee www.example.com for details [3].\nContact a@b.com now (Smith, 2020).']);
    expect(p!.paragraphs).toEqual(['See for details.', 'Contact now.']);
  });
  it('splits sentences without breaking abbreviations or decimals', () => {
    expect(splitSentences('Dr. Mensah paid GH₵3.50 today. Then he left! Did he? Yes.')).toEqual([
      'Dr. Mensah paid GH₵3.50 today.',
      'Then he left!',
      'Did he?',
      'Yes.',
    ]);
  });
  it('chunks long text within limits without cutting words', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(', ') + '.';
    const chunks = speechChunks(long, 80);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(80);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });
});

describe('error mapping', () => {
  it('never exposes raw backend errors', () => {
    expect(toUserError({ code: 'permission-denied', message: 'FirebaseError: PERMISSION_DENIED: Missing or insufficient permissions.' }).message).toBe(
      "You don't have permission to perform this action.",
    );
    expect(toUserError(new Error('boom')).message).toBe('Something went wrong on our side. Please try again.');
    expect(toUserError({ code: 'auth/invalid-credential' }).message).toBe('Incorrect email or password.');
    expect(toUserError({ code: 'functions/failed-precondition', details: { reason: 'insufficient_balance' } }).reason).toBe('insufficient_balance');
  });
});
