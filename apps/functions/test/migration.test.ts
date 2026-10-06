import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { addMember, admin, balance, cleanupApps, createUser, failure, newTenant, rid, type TestUser } from './helpers';

let owner: TestUser;
let tenantId: string;
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

beforeAll(async () => {
  owner = await createUser('legacy-owner');
  tenantId = await newTenant(owner, 'Imported');
  const u = owner.uid;
  const add = (col: string, id: string, data: Record<string, unknown>) => admin.db.collection(col).doc(id).set({ userId: u, createdAt: ts('2026-01-10T10:00:00Z'), ...data });
  await Promise.all([
    add('tasks', 'lt1', { title: 'Old task', status: 'todo', priority: 'high', dueDate: ts('2026-02-01T09:30:00Z'), category: 'study', isRecurring: false }),
    add('tasks', 'lt2', { title: 'Done task', status: 'done', priority: 'weird-value', dueDate: null }),
    add('projects', 'lp1', { name: 'Website', status: 'on-hold', priority: 'medium', progress: 40, budget: 1500.5, tasks: [{ title: 'Embedded task', completed: true }] }),
    add('notes', 'ln1', { title: 'Meeting', content: '<p>Hello <b>team</b></p><script>alert(1)</script><ul><li>One</li></ul>', category: 'meeting', tags: ['x'], pinned: true, meetingData: { date: ts('2026-01-05T00:00:00Z'), attendees: ['Ama'], agenda: 'Plan', actionItems: ['Do it'] } }),
    // Floats that drift in JS: 0.1 + 0.2 style amounts.
    add('transactions', 'tx1', { type: 'income', amount: 1000.1, category: 'salary', date: ts('2026-01-15T12:00:00Z'), description: 'Pay' }),
    add('transactions', 'tx2', { type: 'expense', amount: 200.2, category: 'food', classification: 'want', date: ts('2026-01-16T12:00:00Z') }),
    add('transactions', 'tx3', { type: 'expense', amount: Number.NaN, category: 'food', date: ts('2026-01-17T12:00:00Z') }),
    add('transactions', 'tx4', { type: 'expense', amount: -50, category: 'food', date: ts('2026-01-17T12:00:00Z') }),
    add('debts', 'd1', { type: 'lent', borrowerName: 'Kofi', amount: 1000, paidAmount: 600, dateLent: ts('2026-01-01T00:00:00Z'), dueDate: ts('2026-03-01T00:00:00Z'), status: 'partially-paid' }),
    add('debtPayments', 'dp1', { debtId: 'd1', amount: 300, paymentDate: ts('2026-01-20T00:00:00Z') }),
    add('debtPayments', 'dp2', { debtId: 'd1', amount: 200, paymentDate: ts('2026-01-25T00:00:00Z') }),
    add('financialGoals', 'fg1', { name: 'Laptop', targetAmount: 5000, currentAmount: 1250.75, targetDate: ts('2026-12-31T00:00:00Z') }),
    add('invoices', 'inv1', { invoiceNumber: 'INV-00007', clientName: 'Acme', clientPhone: '024', date: ts('2026-01-03T00:00:00Z'), dueDate: ts('2026-01-31T00:00:00Z'), items: [{ description: 'Work', quantity: 3, price: 33.33, total: 99.99 }], discount: 0, taxRate: 15, total: 114.9885, amountPaid: 50, status: 'partially-paid' }),
    add('healthMoodLogs', 'hm1', { mood: 'good' }),
    add('passwords', 'pw1', { website: 'bank', password: 'hunter2' }),
    admin.db.collection('tasks').doc('someone-else').set({ userId: 'another-user', title: 'Not mine', status: 'todo' }),
  ]);
});
afterAll(cleanupApps);

describe('legacy migration', () => {
  it('only the workspace owner may import', async () => {
    const admin1 = await createUser('importer-admin');
    await addMember(tenantId, admin1, 'admin');
    expect(await failure(admin1.call('migrateLegacyData', { tenantId, requestId: rid(), dryRun: true }))).toBe('forbidden');
  });

  it('dry run reports without writing', async () => {
    const r = await owner.call<{ counts: Record<string, number>; skipped: Record<string, number>; archived: Record<string, number> }>('migrateLegacyData', { tenantId, requestId: rid(), dryRun: true });
    expect(r.counts.Tasks).toBe(3); // 2 + 1 embedded in the project
    expect(r.counts.Transactions).toBe(2);
    expect(r.skipped.Transactions).toBe(2); // NaN and negative
    expect(r.archived).toEqual({ healthMoodLogs: 1 });
    expect((await admin.db.collection(`tenants/${tenantId}/tasks`).get()).size).toBe(0);
  });

  it('imports exactly, safely and idempotently', async () => {
    for (let i = 0; i < 2; i++) await owner.call('migrateLegacyData', { tenantId, requestId: rid(), dryRun: false });
    const col = (c: string) => admin.db.collection(`tenants/${tenantId}/${c}`).get();

    const tasks = await col('tasks');
    expect(tasks.size).toBe(3); // no duplicates after two runs
    expect(tasks.docs.map((d) => d.data().title)).not.toContain('Not mine');
    const old = tasks.docs.find((d) => d.data().title === 'Old task')!.data();
    expect(old).toMatchObject({ dueDate: '2026-02-01', dueTime: '09:30', priority: 'high', createdBy: owner.uid });
    expect(tasks.docs.find((d) => d.data().title === 'Done task')!.data().priority).toBe('medium');

    const note = (await col('notes')).docs[0]!.data();
    expect(note.body).not.toMatch(/<|>/);
    expect(note.body).toContain('Hello team');
    expect(note.meeting.attendees).toEqual(['Ama']);

    // Exact minor units: 1000.10 − 200.20 = 799.90, applied once despite two runs.
    expect(await balance(tenantId, 'legacy_imported')).toBe(79990);
    const txs = await col('transactions');
    const income = txs.docs.find((d) => d.id === 'legacy_tx1')!.data();
    expect(income).toMatchObject({ amountMinor: 100010, categoryId: 'salary', date: '2026-01-15' });
    expect(txs.docs.find((d) => d.id === 'legacy_tx2')!.data()).toMatchObject({ amountMinor: 20020, categoryId: 'groceries', nature: 'want' });

    const debt = (await admin.db.doc(`tenants/${tenantId}/debts/legacy_d1`).get()).data()!;
    expect(debt).toMatchObject({ principalMinor: 100000, paidMinor: 60000, status: 'open', counterparty: 'Kofi' });
    const repayments = txs.docs.filter((d) => d.data().debtId === 'legacy_d1').reduce((a, d) => a + d.data().amountMinor, 0);
    expect(repayments).toBe(60000); // 300 + 200 with history + 100 from the stored running total

    const goal = (await admin.db.doc(`tenants/${tenantId}/savingsGoals/legacy_fg1`).get()).data()!;
    expect(goal).toMatchObject({ targetMinor: 500000, savedMinor: 125075 });

    const inv = (await admin.db.doc(`tenants/${tenantId}/invoices/legacy_inv1`).get()).data()!;
    expect(inv).toMatchObject({ number: 'INV-00007', subtotalMinor: 9999, taxMinor: 1500, totalMinor: 11499, paidMinor: 5000, status: 'partially_paid' });
    expect((await admin.db.doc(`tenants/${tenantId}/counters/invoices`).get()).data()!.next).toBe(8);

    // Plaintext secrets are never copied; unmapped data is archived.
    const archive = await col('legacyArchive');
    expect(archive.docs.map((d) => d.data().collection)).toEqual(['healthMoodLogs']);
    expect(JSON.stringify(archive.docs.map((d) => d.data()))).not.toContain('hunter2');
    // Legacy records are untouched.
    expect((await admin.db.doc('transactions/tx1').get()).data()!.amount).toBe(1000.1);
    expect((await admin.db.doc('passwords/pw1').get()).exists).toBe(true);
  });
});
