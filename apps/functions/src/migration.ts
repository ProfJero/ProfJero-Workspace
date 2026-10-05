import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData, type WriteBatch } from 'firebase-admin/firestore';
import {
  CLIENT_COLLECTIONS,
  computeInvoiceTotals,
  DEFAULT_CATEGORIES,
  isIsoDate,
  migrateLegacyInput,
  todayInZone,
  type ClientCollectionName,
  type LedgerTransaction,
} from '@profjero/shared';
import { db, fail, tenantCallable, tenantRef } from './lib/core';

/**
 * Imports the caller's data from the legacy flat collections (userId field)
 * into this tenant. See docs/MIGRATION.md.
 *
 * - Non-destructive: legacy documents are only read.
 * - Idempotent: every imported document gets the id `legacy_<legacyId>`, so a
 *   re-run overwrites the same documents instead of duplicating them. The
 *   finance import is guarded by a marker so balances are never applied twice.
 * - Validated: workspace documents pass the same schemas the security rules
 *   enforce; anything invalid is skipped and reported.
 * - Plaintext secrets (passwords, secure notes, payment cards) are never
 *   copied; the user moves them into the encrypted vault from the app.
 */

type Doc = { id: string; data: DocumentData };
interface Report { dryRun: boolean; counts: Record<string, number>; skipped: Record<string, number>; archived: Record<string, number>; warnings: string[] }

const ARCHIVE_ONLY = [
  'identityProfiles', 'identities', 'healthDailyLogs', 'healthWaterIntake', 'healthSleepLogs', 'healthActivityLogs', 'healthNutritionLogs',
  'healthMoodLogs', 'healthMedications', 'healthGoals', 'learningResources', 'certifications', 'subscriptions', 'recurringBills',
  'goalNotes', 'goalAnalytics', 'invoiceTimeline', 'paymentHistory', 'audioDocuments', 'passwordCategories', 'passwordHistory',
];

const LEGACY_ACCOUNT_ID = 'legacy_imported';
const LEGACY_CATEGORY: Record<string, string> = {
  salary: 'salary', freelance: 'freelance', investment: 'investment_income', payment_received: 'client_payment', gift: 'gifts_received',
  'other-income': 'other_income', food: 'groceries', transport: 'transport', housing: 'housing', utilities: 'utilities',
  entertainment: 'entertainment', shopping: 'shopping', health: 'health', education: 'education', bills: 'utilities', 'other-expense': 'other_expense',
};

// ───────────────────────────── Conversions ─────────────────────────────

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const strOrNull = (v: unknown, max: number) => str(v, max) || null;
const legacyId = (id: string) => `legacy_${id}`.slice(0, 128);

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v instanceof Timestamp) return v.toDate();
  if (v && typeof v === 'object' && 'seconds' in v && typeof (v as { seconds: unknown }).seconds === 'number') return new Date((v as { seconds: number }).seconds * 1000);
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIso(v: unknown, tz: string): string | null {
  if (typeof v === 'string' && isIsoDate(v)) return v;
  const d = toDate(v);
  return d ? todayInZone(tz, d) : null;
}

function toWallTime(v: unknown, tz: string): string | null {
  const d = toDate(v);
  if (!d) return null;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/** Legacy float amount → minor units. Returns null for NaN, negative, absurd or non-numeric values. */
function toMinor(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
  return Math.round(n * 100);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Firestore cannot store undefined; also drops values the archive does not need. */
function archivable(data: DocumentData): DocumentData {
  return JSON.parse(JSON.stringify(data, (_k, v) => (v instanceof Timestamp ? v.toDate().toISOString() : v))) as DocumentData;
}

// ───────────────────────────── Main ─────────────────────────────

export const migrateLegacyData = tenantCallable('tenant.delete', migrateLegacyInput, async (input, ctx) => {
  const tenantSnap = await tenantRef(ctx.tenantId).get();
  const tenant = tenantSnap.data();
  if (!tenant) fail('not_found');
  const tz: string = tenant.timezone || 'Africa/Accra';
  const currency: string = tenant.currency || 'GHS';
  const uid = ctx.uid;
  const report: Report = { dryRun: input.dryRun, counts: {}, skipped: {}, archived: {}, warnings: [] };
  const count = (k: string, n = 1) => { report.counts[k] = (report.counts[k] ?? 0) + n; };
  const skip = (k: string, why?: string) => {
    report.skipped[k] = (report.skipped[k] ?? 0) + 1;
    if (why && report.warnings.length < 50) report.warnings.push(why);
  };

  const load = async (name: string): Promise<Doc[]> => {
    const snap = await db.collection(name).where('userId', '==', uid).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  };

  // Writes are collected and committed in batches at the end (unless dry run).
  const writes: ((b: WriteBatch) => void)[] = [];
  const base = tenantRef(ctx.tenantId);
  const meta = (created: unknown) => {
    const at = toDate(created);
    const ts = at ? Timestamp.fromDate(at) : FieldValue.serverTimestamp();
    return { createdBy: uid, updatedBy: uid, createdAt: ts, updatedAt: ts };
  };
  const schemaOf = (c: ClientCollectionName) => CLIENT_COLLECTIONS.find((x) => x.name === c)!.schema;
  /** Validate with the rules' schema and queue the write. */
  const put = (col: ClientCollectionName, id: string, doc: Record<string, unknown>, created: unknown, label: string) => {
    const parsed = schemaOf(col).safeParse(doc);
    if (!parsed.success) {
      skip(label, `${label} ${id}: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`);
      return false;
    }
    writes.push((b) => b.set(base.collection(col).doc(legacyId(id)), { ...parsed.data, ...meta(created) }));
    count(label);
    return true;
  };

  // ── Workspace ──
  const [tasks = [], projects = [], goals = [], milestones = [], notes = [], events = [], clients = [], comms = [], courses = [], sessions = []] = await Promise.all(
    ['tasks', 'projects', 'goals', 'milestones', 'notes', 'calendarEvents', 'clients', 'clientCommunications', 'courses', 'studySessions'].map(load),
  );
  const projectIds = new Set(projects.map((p) => p.id));
  const savingsGoals = goals.filter((g) => g.data.category === 'savings');
  const goalIds = new Set(goals.filter((g) => g.data.category !== 'savings').map((g) => g.id));
  const link = (ids: Set<string>, v: unknown) => (typeof v === 'string' && ids.has(v) ? legacyId(v) : null);

  for (const t of tasks) {
    const d = t.data;
    const due = toDate(d.dueDate);
    const status = d.status === 'done' || d.status === 'completed' ? 'done' : d.status === 'in-progress' || d.status === 'in_progress' ? 'in_progress' : 'todo';
    const time = due ? toWallTime(due, tz)!.slice(11) : null;
    put('tasks', t.id, {
      title: str(d.title, 200) || 'Untitled task', description: str(d.description, 5000), status,
      priority: ['low', 'medium', 'high', 'urgent'].includes(d.priority) ? d.priority : 'medium',
      dueDate: due ? toIso(due, tz) : null, dueTime: time && time !== '00:00' ? time : null,
      projectId: link(projectIds, d.projectId), goalId: link(goalIds, d.goalId), assigneeId: null,
      labels: d.category ? [str(d.category, 40)].filter(Boolean) : [],
      recurrence: d.isRecurring && ['daily', 'weekly', 'monthly'].includes(d.recurringPattern) ? { frequency: d.recurringPattern, interval: 1 } : null,
      completedOn: status === 'done' ? toIso(d.completedAt ?? d.updatedAt, tz) : null,
    }, d.createdAt, 'Tasks');
  }

  for (const p of projects) {
    const d = p.data;
    const status = ({ planning: 'planning', active: 'active', 'on-hold': 'on_hold', completed: 'completed', cancelled: 'cancelled', archived: 'completed' } as Record<string, string>)[d.status] ?? 'active';
    const budget = d.budget != null ? toMinor(d.budget) : null;
    put('projects', p.id, {
      name: str(d.name ?? d.title, 120) || 'Untitled project', description: str(d.description, 5000), status,
      priority: ['low', 'medium', 'high', 'urgent'].includes(d.priority) ? d.priority : 'medium',
      startDate: toIso(d.startDate, tz), deadline: toIso(d.deadline, tz), clientId: null, goalId: null, memberIds: [],
      budgetMinor: budget, progressMode: 'manual', manualProgress: Math.max(0, Math.min(100, Math.round(Number(d.progress) || 0))),
      archived: d.archived === true || d.status === 'archived',
    }, d.createdAt, 'Projects');
    // Legacy embedded task arrays become real tasks linked to the project.
    if (Array.isArray(d.tasks)) {
      d.tasks.forEach((et: Record<string, unknown>, i: number) => {
        if (!et || typeof et !== 'object') return;
        put('tasks', `${p.id}_t${i}`, {
          title: str(et.title ?? et.name, 200) || 'Task', description: str(et.description, 5000),
          status: et.completed === true || et.status === 'done' ? 'done' : 'todo', priority: 'medium', dueDate: toIso(et.dueDate, tz), dueTime: null,
          projectId: legacyId(p.id), goalId: null, assigneeId: null, labels: [], recurrence: null, completedOn: null,
        }, d.createdAt, 'Tasks');
      });
    }
  }

  for (const g of goals.filter((x) => x.data.category !== 'savings')) {
    const d = g.data;
    const status = ({ 'not-started': 'not_started', 'in-progress': 'active', completed: 'achieved', 'on-hold': 'on_hold', cancelled: 'abandoned' } as Record<string, string>)[d.status] ?? 'active';
    const category = ['personal', 'career', 'financial', 'learning', 'health', 'business', 'spiritual'].includes(d.category) ? d.category : 'other';
    const hasMilestones = milestones.some((m) => m.data.goalId === g.id);
    put('goals', g.id, {
      title: str(d.title, 160) || 'Untitled goal', description: str(d.description, 5000), category, status,
      startDate: toIso(d.startDate, tz), targetDate: toIso(d.endDate ?? d.targetDate, tz),
      // Legacy progress was a manual percentage; keep it as a numeric measure unless milestones exist.
      measureKind: hasMilestones ? 'milestones' : 'numeric', measureTarget: 100, measureCurrent: Math.max(0, Math.min(100, Number(d.progress) || 0)), measureUnit: '%',
      why: '',
    }, d.createdAt, 'Goals');
  }
  milestones.forEach((m, i) => {
    const d = m.data;
    if (!goalIds.has(d.goalId)) return skip('Milestones', `Milestone ${m.id} belongs to a goal that was not imported`);
    put('milestones', m.id, { goalId: legacyId(d.goalId), title: str(d.title, 160) || 'Milestone', dueDate: toIso(d.dueDate ?? d.targetDate, tz), done: d.completed === true || d.status === 'completed', doneOn: null, order: i }, d.createdAt, 'Milestones');
  });

  for (const n of notes) {
    const d = n.data;
    const category = ['meeting', 'idea', 'research', 'personal', 'work'].includes(d.category) ? d.category : d.category === 'ideas' ? 'idea' : d.category === 'tutorial' ? 'study' : 'general';
    const md = d.meetingData;
    put('notes', n.id, {
      title: str(d.title, 200) || 'Untitled note', body: htmlToText(str(d.content, 200_000)).slice(0, 100_000), category,
      tags: Array.isArray(d.tags) ? d.tags.map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 20) : [],
      pinned: d.pinned === true, links: { projectId: null, goalId: null, taskId: null, clientId: null, courseId: null },
      meeting: category === 'meeting' && md ? {
        date: toIso(md.date, tz), attendees: (Array.isArray(md.attendees) ? md.attendees : []).map((a: unknown) => str(a, 80)).filter(Boolean).slice(0, 50),
        agenda: str(md.agenda, 5000), actionItems: (Array.isArray(md.actionItems) ? md.actionItems : []).map((a: unknown) => str(a, 300)).filter(Boolean).slice(0, 50),
      } : null,
    }, d.createdAt, 'Notes');
  }

  for (const e of events) {
    const d = e.data;
    const start = toWallTime(d.startDate ?? d.date, tz);
    if (!start) { skip('Calendar events', `Event ${e.id} has no valid start date`); continue; }
    let end = toWallTime(d.endDate, tz) ?? start;
    if (end < start) end = start;
    put('events', e.id, { title: str(d.title, 200) || 'Event', description: str(d.description, 5000), kind: 'event', allDay: d.allDay === true, start, end, location: str(d.location, 200), links: { projectId: null, goalId: null, taskId: null, clientId: null, courseId: null } }, d.createdAt, 'Calendar events');
  }

  const clientIds = new Set(clients.map((c) => c.id));
  for (const c of clients) {
    const d = c.data;
    const email = str(d.email, 120);
    put('clients', c.id, {
      name: str(d.name, 120) || 'Client', company: str(d.company, 120), email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '',
      phone: str(d.phone, 40), address: str(d.address, 300), status: ['lead', 'active', 'inactive'].includes(d.status) ? d.status : 'active',
      notes: str(d.notes, 5000), tags: [],
    }, d.createdAt, 'Clients');
  }
  for (const m of comms) {
    const d = m.data;
    if (!clientIds.has(d.clientId)) { skip('Client interactions'); continue; }
    put('clientInteractions', m.id, {
      clientId: legacyId(d.clientId), kind: ['call', 'email', 'meeting', 'message', 'note'].includes(d.type) ? d.type : 'note',
      date: toIso(d.date ?? d.createdAt, tz) ?? todayInZone(tz), summary: str(d.summary ?? d.notes ?? d.content ?? d.subject, 2000) || 'Interaction',
    }, d.createdAt, 'Client interactions');
  }

  for (const c of courses) {
    const d = c.data;
    const pct = Math.max(0, Math.min(100, Math.round(Number(d.progress) || 0)));
    put('courses', c.id, {
      title: str(d.title, 200) || 'Course', provider: str(d.instructor ?? d.provider, 120), url: '',
      status: ({ 'not-started': 'planned', 'in-progress': 'in_progress', paused: 'paused', completed: 'completed' } as Record<string, string>)[d.status] ?? 'in_progress',
      level: ['beginner', 'intermediate', 'advanced'].includes(d.difficulty) ? d.difficulty : 'beginner',
      totalUnits: 100, completedUnits: pct, goalId: null, targetDate: null, notes: str(d.description, 5000),
    }, d.createdAt, 'Courses');
  }
  for (const s of sessions) {
    const d = s.data;
    const minutes = Math.round(Number(d.duration ?? d.minutes) || 0);
    if (minutes < 1) { skip('Study sessions'); continue; }
    put('studySessions', s.id, { date: toIso(d.date ?? d.createdAt, tz) ?? todayInZone(tz), minutes: Math.min(1440, minutes), courseId: null, documentId: null, topic: str(d.topic ?? d.title, 200), notes: str(d.notes, 5000) }, d.createdAt, 'Study sessions');
  }

  // ── Finance (applied once) ──
  const marker = base.collection('migrations').doc('legacyFinance');
  const financeDone = (await marker.get()).exists;
  const [transactions = [], debts = [], debtPayments = [], finGoals = [], invoices = [], budgets = []] = await Promise.all(['transactions', 'debts', 'debtPayments', 'financialGoals', 'invoices', 'budgets'].map(load));
  if (financeDone) {
    report.warnings.push('Finance data was already imported earlier; it was not imported again.');
  } else {
    const fin = (col: string, id: string, doc: Record<string, unknown>, created: unknown) => writes.push((b) => b.set(base.collection(col).doc(id), { ...doc, ...meta(created) }));
    const ledger: Omit<LedgerTransaction, 'id'>[] = [];
    const entry = (p: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'type' | 'amountMinor' | 'date'>): Omit<LedgerTransaction, 'id'> => ({
      status: 'posted', currency: currency as LedgerTransaction['currency'], accountId: LEGACY_ACCOUNT_ID, toAccountId: null, categoryId: null, nature: null,
      adjustmentDirection: null, description: '', payee: null, reference: null, debtId: null, invoiceId: null, refundOfId: null, projectId: null, clientId: null, goalId: null, ...p,
    });
    let balance = 0;

    for (const t of transactions) {
      const d = t.data;
      const amount = toMinor(d.amount);
      const date = toIso(d.date ?? d.createdAt, tz);
      if (d.type !== 'income' && d.type !== 'expense') { skip('Transactions', `Transaction ${t.id}: unknown type "${String(d.type)}"`); continue; }
      if (!amount) { skip('Transactions', `Transaction ${t.id}: invalid amount ${JSON.stringify(d.amount)}`); continue; }
      if (!date) { skip('Transactions', `Transaction ${t.id}: invalid date`); continue; }
      let categoryId = LEGACY_CATEGORY[d.category] ?? (d.type === 'income' ? 'other_income' : 'other_expense');
      if (DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.kind !== d.type) categoryId = d.type === 'income' ? 'other_income' : 'other_expense';
      const e = entry({
        type: d.type, amountMinor: amount, date, categoryId, description: str(d.description ?? d.notes, 300),
        nature: d.type === 'expense' ? (d.classification === 'want' ? 'want' : d.classification === 'need' ? 'need' : null) : null,
        reference: strOrNull(d.invoiceNumber, 120),
      });
      ledger.push(e);
      balance += d.type === 'income' ? amount : -amount;
      fin('transactions', legacyId(t.id), { ...e, version: 1, refundedMinor: 0, voidedAt: null, voidedBy: null, voidReason: null, importedFrom: 'legacy' }, d.createdAt);
      count('Transactions');
    }
    if (transactions.length > 0 || debts.length > 0) {
      fin('accounts', LEGACY_ACCOUNT_ID, { name: 'Imported (previous app)', type: 'other', currency, openingBalanceMinor: 0, balanceMinor: balance, archived: false }, null);
      count('Accounts');
      report.warnings.push('The previous app had no accounts, so imported entries were placed in one "Imported (previous app)" account. Its balance equals imported income minus expenses; record an adjustment or transfers to match your real accounts.');
    }

    const paymentsByDebt = new Map<string, Doc[]>();
    for (const p of debtPayments) paymentsByDebt.set(p.data.debtId, [...(paymentsByDebt.get(p.data.debtId) ?? []), p]);
    for (const dbt of debts) {
      const d = dbt.data;
      const principal = toMinor(d.amount);
      if (!principal) { skip('Debts', `Debt ${dbt.id}: invalid amount`); continue; }
      const direction = d.type === 'borrowed' ? 'borrowed' : 'lent';
      const date = toIso(d.dateLent ?? d.createdAt, tz) ?? todayInZone(tz);
      const id = legacyId(dbt.id);
      let paid = 0;
      // Repayments are recorded without an account (the old app did not track one), so balances are unaffected.
      for (const p of paymentsByDebt.get(dbt.id) ?? []) {
        const amt = toMinor(p.data.amount);
        if (!amt) continue;
        const take = Math.min(amt, principal - paid);
        if (take <= 0) { report.warnings.push(`Debt ${dbt.id}: a repayment exceeded the amount owed and was capped.`); break; }
        paid += take;
        fin('transactions', legacyId(p.id), { ...entry({ type: direction === 'lent' ? 'repayment_received' : 'repayment_made', amountMinor: take, accountId: null, date: toIso(p.data.paymentDate ?? p.data.createdAt, tz) ?? date, debtId: id, payee: str(d.borrowerName ?? d.lenderName, 120) || null, description: str(p.data.notes, 300) }), version: 1, refundedMinor: 0, voidedAt: null, voidedBy: null, voidReason: null, importedFrom: 'legacy' }, p.data.createdAt);
      }
      const legacyPaid = toMinor(d.paidAmount) ?? 0;
      if (legacyPaid > paid) {
        // The old app stored a running total that may include payments without history.
        const extra = Math.min(legacyPaid, principal) - paid;
        if (extra > 0) {
          paid += extra;
          fin('transactions', `${id}_balance`, { ...entry({ type: direction === 'lent' ? 'repayment_received' : 'repayment_made', amountMinor: extra, accountId: null, date, debtId: id, description: 'Imported repayments (no detail in previous app)' }), version: 1, refundedMinor: 0, voidedAt: null, voidedBy: null, voidReason: null, importedFrom: 'legacy' }, d.createdAt);
        }
      }
      fin('debts', id, {
        direction, counterparty: str(d.borrowerName ?? d.lenderName ?? d.personName, 120) || 'Unknown', principalMinor: principal, currency, date,
        dueDate: (() => { const due = toIso(d.dueDate, tz); return due && due >= date ? due : null; })(), notes: [str(d.purpose, 500), str(d.notes, 1400)].filter(Boolean).join('\n'),
        accountId: null, principalTransactionId: null, paidMinor: paid, status: paid >= principal ? 'settled' : 'open',
      }, d.createdAt);
      count('Debts');
    }

    for (const g of [...finGoals, ...savingsGoals]) {
      const d = g.data;
      const target = toMinor(d.targetAmount);
      if (!target) { skip('Savings goals', `Savings goal ${g.id}: invalid target`); continue; }
      const saved = toMinor(d.currentAmount) ?? 0;
      const id = legacyId(g.id);
      fin('savingsGoals', id, { name: str(d.name ?? d.title, 80) || 'Savings goal', targetMinor: target, currency, targetDate: toIso(d.targetDate ?? d.endDate, tz), accountId: null, savedMinor: saved, status: saved >= target ? 'achieved' : 'active', createdDate: toIso(d.createdAt, tz) ?? todayInZone(tz) }, d.createdAt);
      if (saved > 0) fin('savingsContributions', `${id}_opening`, { goalId: id, kind: 'deposit', amountMinor: saved, date: toIso(d.createdAt, tz) ?? todayInZone(tz), note: 'Imported balance', transactionId: null }, d.createdAt);
      count('Savings goals');
    }

    for (const bgt of budgets) {
      const d = bgt.data;
      const amount = toMinor(d.amount ?? d.limit);
      const cat = LEGACY_CATEGORY[d.category];
      if (amount === null || !cat || DEFAULT_CATEGORIES.find((c) => c.id === cat)?.kind !== 'expense') { skip('Budgets', `Budget ${bgt.id}: unknown category or amount`); continue; }
      fin('budgets', legacyId(bgt.id), { name: str(d.name, 80) || DEFAULT_CATEGORIES.find((c) => c.id === cat)!.name, categoryIds: [cat], period: { kind: 'monthly' }, amountMinor: amount, currency, accountIds: [] }, d.createdAt);
      count('Budgets');
    }

    // Invoices: clients are matched by name (the old app stored names, not ids).
    const clientByName = new Map(clients.map((c) => [str(c.data.name, 120).toLowerCase(), legacyId(c.id)]));
    let maxSeq = 0;
    for (const inv of invoices) {
      const d = inv.data;
      if (!Array.isArray(d.items)) { skip('Invoices', `Invoice ${inv.id}: no items`); continue; }
      const name = str(d.clientName, 120) || 'Unknown client';
      let clientId = clientByName.get(name.toLowerCase());
      if (!clientId) {
        clientId = `legacy_client_${createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 20)}`;
        clientByName.set(name.toLowerCase(), clientId);
        fin('clients', clientId, { name, company: '', email: '', phone: str(d.clientPhone, 40), address: '', status: 'active', notes: 'Created while importing invoices.', tags: [] }, d.createdAt);
        count('Clients');
      }
      const lines = d.items
        .map((it: Record<string, unknown>) => ({ description: str(it.description, 300) || 'Item', quantityMilli: Math.round((Number(it.quantity) || 0) * 1000), unitPriceMinor: toMinor(it.price) ?? -1 }))
        .filter((l: { quantityMilli: number; unitPriceMinor: number }) => l.quantityMilli > 0 && l.unitPriceMinor >= 0);
      let totals;
      try {
        totals = computeInvoiceTotals(lines, toMinor(d.discount) ?? 0, Math.round((Number(d.taxRate) || 0) * 100));
      } catch {
        skip('Invoices', `Invoice ${str(d.invoiceNumber, 30)}: amounts could not be reconciled`);
        continue;
      }
      const legacyTotal = toMinor(d.total);
      if (legacyTotal !== null && Math.abs(legacyTotal - totals.totalMinor) > 1) {
        report.warnings.push(`Invoice ${str(d.invoiceNumber, 30)}: total recalculated exactly as ${totals.totalMinor / 100} (previous app showed ${legacyTotal / 100}).`);
      }
      const paid = Math.min(toMinor(d.amountPaid) ?? 0, totals.totalMinor);
      const status = d.status === 'draft' ? 'draft' : paid >= totals.totalMinor ? 'paid' : paid > 0 ? 'partially_paid' : d.status === 'cancelled' ? 'void' : 'sent';
      const seq = Number(/(\d+)$/.exec(str(d.invoiceNumber, 30))?.[1] ?? 0);
      if (seq > maxSeq) maxSeq = seq;
      fin('invoices', legacyId(inv.id), {
        number: str(d.invoiceNumber, 30) || legacyId(inv.id), clientId, clientName: name,
        clientSnapshot: { name, company: '', email: str(d.clientEmail, 120), phone: str(d.clientPhone, 40), address: '' }, projectId: null,
        issueDate: toIso(d.date ?? d.createdAt, tz) ?? todayInZone(tz), dueDate: toIso(d.dueDate, tz), currency, lines,
        lineTotalsMinor: totals.lineTotalsMinor, subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, taxRateBps: Math.round((Number(d.taxRate) || 0) * 100),
        taxMinor: totals.taxMinor, totalMinor: totals.totalMinor, paidMinor: paid, status, notes: str(d.notes, 2000), sentAt: null,
      }, d.createdAt);
      count('Invoices');
    }
    // New invoices continue after the highest imported number.
    if (maxSeq > 0) writes.push((b) => b.set(base.collection('counters').doc('invoices'), { next: maxSeq + 1 }, { merge: true }));
    if (invoices.length) report.warnings.push('Invoice payments from the previous app are kept as the invoice’s paid amount; their income entries were imported with the other transactions.');
    writes.push((b) => b.set(marker, { importedBy: uid, at: FieldValue.serverTimestamp() }));
  }

  // ── Archive (no new module yet) ──
  for (const name of ARCHIVE_ONLY) {
    const docs = await load(name);
    if (docs.length === 0) continue;
    report.archived[name] = docs.length;
    for (const d of docs) writes.push((b) => b.set(base.collection('legacyArchive').doc(`${name}__${d.id}`.slice(0, 1400)), { collection: name, legacyId: d.id, data: archivable(d.data), importedAt: FieldValue.serverTimestamp() }));
  }

  if (!input.dryRun) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach((w) => w(batch));
      await batch.commit();
    }
    await base.collection('auditLogs').add({ actorUid: uid, action: 'tenant.import_legacy', resource: { type: 'tenant', id: ctx.tenantId }, metadata: { counts: report.counts, skipped: report.skipped }, at: FieldValue.serverTimestamp() });
  }
  return report;
});
