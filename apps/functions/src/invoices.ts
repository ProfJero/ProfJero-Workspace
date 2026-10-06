import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  computeInvoiceTotals,
  createPortalLinkInput,
  formatInvoiceNumber,
  invoiceActionInput,
  invoicePaymentStatus,
  portalPaymentNoticeInput,
  portalTokenInput,
  recordInvoicePaymentInput,
  reviewPaymentNoticeInput,
  revokePortalLinksInput,
  saveInvoiceInput,
  validateInvoicePayment,
  validateTransaction,
  type InvoiceStatus,
  type LedgerTransaction,
} from '@profjero/shared';
import { audit, createdMeta, db, fail, getOrFail, idempotent, publicCallable, requireMemberTx, tenantCallable, tenantRef, updatedMeta, type MemberContext } from './lib/core';
import { applyDeltas, ledgerDelta, ledgerDocument, loadAccounts, transactionsCol } from './lib/ledger';

const invoicesCol = (tenantId: string) => tenantRef(tenantId).collection('invoices');
const event = (ref: FirebaseFirestore.DocumentReference, t: FirebaseFirestore.Transaction, kind: string, by: string | null, extra: Record<string, unknown> = {}) =>
  t.create(ref.collection('events').doc(), { kind, by, at: FieldValue.serverTimestamp(), ...extra });

/** Totals are always computed on the server from the lines; client-sent totals are never trusted. */
function totalsOrFail(lines: Parameters<typeof computeInvoiceTotals>[0], discount: number, tax: number) {
  try {
    return computeInvoiceTotals(lines, discount, tax);
  } catch (e) {
    fail('invalid_input', e instanceof Error ? e.message : 'Invalid invoice amounts.');
  }
}

export const saveInvoice = tenantCallable('finance.write', saveInvoiceInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ invoiceId: string; number: string }>(t, ctx, input.requestId, 'invoice.save');
    if (replay) return replay;
    const inv = input.invoice;
    if (inv.dueDate && inv.dueDate < inv.issueDate) fail('invalid_input', 'The due date cannot be before the issue date.', { dueDate: 'Before the issue date' });
    const client = await getOrFail(t, tenantRef(ctx.tenantId).collection('clients').doc(inv.clientId), 'client');
    if (inv.projectId) await getOrFail(t, tenantRef(ctx.tenantId).collection('projects').doc(inv.projectId), 'project');
    const totals = totalsOrFail(inv.lines, inv.discountMinor, inv.taxRateBps);
    const body = {
      ...inv,
      clientName: client.name, // display snapshot; refreshed on every save while draft
      lineTotalsMinor: totals.lineTotalsMinor,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
    };
    if (input.invoiceId) {
      const ref = invoicesCol(ctx.tenantId).doc(input.invoiceId);
      const before = await getOrFail(t, ref, 'invoice');
      if (before.status !== 'draft') fail('conflict', 'Only draft invoices can be edited. Void it and issue a new one.');
      t.update(ref, { ...body, ...updatedMeta(ctx.uid) });
      event(ref, t, 'edited', ctx.uid, { totalMinor: totals.totalMinor });
      const result = { invoiceId: ref.id, number: before.number as string };
      commit(result);
      return result;
    }
    // Sequential, gap-free numbering per tenant via a counter read in this transaction.
    const counterRef = tenantRef(ctx.tenantId).collection('counters').doc('invoices');
    const tenant = await getOrFail(t, tenantRef(ctx.tenantId), 'workspace');
    const counter = await t.get(counterRef);
    const seq = (counter.exists ? (counter.data()!.next as number) : 1);
    const number = formatInvoiceNumber(tenant.invoicePrefix ?? 'INV-', seq);
    const ref = invoicesCol(ctx.tenantId).doc();
    t.set(counterRef, { next: seq + 1 });
    t.create(ref, { ...body, number, status: 'draft', paidMinor: 0, clientSnapshot: null, sentAt: null, ...createdMeta(ctx.uid) });
    event(ref, t, 'created', ctx.uid, { totalMinor: totals.totalMinor });
    audit(t, ctx, 'finance.invoice.create', { type: 'invoice', id: ref.id }, { number, totalMinor: totals.totalMinor });
    const result = { invoiceId: ref.id, number };
    commit(result);
    return result;
  }),
);

export const sendInvoice = tenantCallable('finance.write', invoiceActionInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'invoice.send');
    if (replay) return replay;
    const ref = invoicesCol(ctx.tenantId).doc(input.invoiceId);
    const inv = await getOrFail(t, ref, 'invoice');
    if (inv.status !== 'draft') fail('conflict', 'This invoice has already been issued.');
    const client = await getOrFail(t, tenantRef(ctx.tenantId).collection('clients').doc(inv.clientId), 'client');
    t.update(ref, {
      status: 'sent',
      sentAt: FieldValue.serverTimestamp(),
      // Freeze who the invoice was addressed to.
      clientSnapshot: { name: client.name, company: client.company ?? '', email: client.email ?? '', phone: client.phone ?? '', address: client.address ?? '' },
      ...updatedMeta(ctx.uid),
    });
    event(ref, t, 'sent', ctx.uid);
    audit(t, ctx, 'finance.invoice.send', { type: 'invoice', id: ref.id }, { number: inv.number });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

export const voidInvoice = tenantCallable('finance.manage', invoiceActionInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.manage');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'invoice.void');
    if (replay) return replay;
    const ref = invoicesCol(ctx.tenantId).doc(input.invoiceId);
    const inv = await getOrFail(t, ref, 'invoice');
    if (inv.status === 'void') fail('conflict', 'This invoice is already void.');
    if (inv.paidMinor > 0) fail('conflict', 'Void the payments recorded against this invoice first.');
    t.update(ref, { status: 'void', voidReason: input.reason ?? '', ...updatedMeta(ctx.uid) });
    event(ref, t, 'voided', ctx.uid, { reason: input.reason ?? '' });
    audit(t, ctx, 'finance.invoice.void', { type: 'invoice', id: ref.id }, { number: inv.number, reason: input.reason ?? '' });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

/** Shared by direct payment recording and payment-notice approval. Caller has done all reads it needs except the ones here. */
async function recordPayment(
  t: FirebaseFirestore.Transaction,
  ctx: MemberContext,
  p: { invoiceId: string; amountMinor: number; date: string; accountId: string; method: string; reference: string; paymentNoticeId: string | null },
): Promise<{ transactionId: string; status: InvoiceStatus }> {
  const ref = invoicesCol(ctx.tenantId).doc(p.invoiceId);
  const inv = await getOrFail(t, ref, 'invoice');
  const problem = validateInvoicePayment(inv as { status: InvoiceStatus; totalMinor: number; paidMinor: number }, p.amountMinor);
  if (problem) fail('invalid_input', problem, { amountMinor: problem });
  const accounts = await loadAccounts(t, ctx.tenantId, [p.accountId]);
  const noticeRef = p.paymentNoticeId ? tenantRef(ctx.tenantId).collection('paymentNotices').doc(p.paymentNoticeId) : null;
  if (noticeRef) {
    const notice = await getOrFail(t, noticeRef, 'payment notice');
    if (notice.status !== 'pending' || notice.invoiceId !== p.invoiceId) fail('conflict', 'This payment notice has already been handled.');
  }
  const entry: Omit<LedgerTransaction, 'id' | 'status'> = {
    type: 'income', amountMinor: p.amountMinor, currency: inv.currency, date: p.date, accountId: p.accountId, toAccountId: null,
    categoryId: 'client_payment', nature: null, adjustmentDirection: null,
    description: `Payment for invoice ${inv.number}`, payee: inv.clientName ?? null, reference: p.reference || null,
    debtId: null, invoiceId: p.invoiceId, refundOfId: null, projectId: inv.projectId ?? null, clientId: inv.clientId, goalId: null,
  };
  const issues = validateTransaction(entry, new Map([...accounts].map(([k, v]) => [k, v.data])));
  if (issues.length) fail('invalid_input', issues[0]!.message);
  const txRef = transactionsCol(ctx.tenantId).doc();
  applyDeltas(t, accounts, ledgerDelta(null, { ...entry, id: txRef.id, status: 'posted' }), ctx.uid);
  t.create(txRef, { ...ledgerDocument({ ...entry, status: 'posted' }, ctx.uid), paymentMethod: p.method });
  const paid = inv.paidMinor + p.amountMinor;
  const status = invoicePaymentStatus(inv.status, inv.totalMinor, paid);
  t.update(ref, { paidMinor: paid, status, ...updatedMeta(ctx.uid) });
  event(ref, t, 'payment', ctx.uid, { amountMinor: p.amountMinor, transactionId: txRef.id, method: p.method });
  if (noticeRef) t.update(noticeRef, { status: 'approved', reviewedBy: ctx.uid, reviewedAt: FieldValue.serverTimestamp(), transactionId: txRef.id });
  audit(t, ctx, 'finance.invoice.payment', { type: 'invoice', id: p.invoiceId }, { amountMinor: p.amountMinor, transactionId: txRef.id });
  return { transactionId: txRef.id, status };
}

export const recordInvoicePayment = tenantCallable('finance.write', recordInvoicePaymentInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ transactionId: string; status: InvoiceStatus }>(t, ctx, input.requestId, 'invoice.payment');
    if (replay) return replay;
    const result = await recordPayment(t, ctx, input);
    commit(result);
    return result;
  }),
);

export const reviewPaymentNotice = tenantCallable('finance.write', reviewPaymentNoticeInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.write');
    const { replay, commit } = await idempotent<{ status: string }>(t, ctx, input.requestId, 'notice.review');
    if (replay) return replay;
    const ref = tenantRef(ctx.tenantId).collection('paymentNotices').doc(input.noticeId);
    const notice = await getOrFail(t, ref, 'payment notice');
    if (notice.status !== 'pending') fail('conflict', 'This payment notice has already been handled.');
    if (input.decision === 'reject') {
      t.update(ref, { status: 'rejected', reviewedBy: ctx.uid, reviewedAt: FieldValue.serverTimestamp(), reviewNote: input.reason });
      audit(t, ctx, 'finance.notice.reject', { type: 'paymentNotice', id: input.noticeId }, { reason: input.reason });
      commit({ status: 'rejected' });
      return { status: 'rejected' };
    }
    if (!input.accountId) fail('invalid_input', 'Choose the account the money arrived in.', { accountId: 'Required' });
    await recordPayment(t, ctx, {
      invoiceId: notice.invoiceId, amountMinor: notice.amountMinor, date: notice.paidOn, accountId: input.accountId,
      method: notice.method, reference: notice.reference, paymentNoticeId: input.noticeId,
    });
    commit({ status: 'approved' });
    return { status: 'approved' };
  }),
);

// ═════════════════════════════ Client portal ═════════════════════════════
// A portal link carries a 256-bit random token in the URL fragment. Only its
// SHA-256 hash is stored, so a database leak does not reveal usable links.
// Links expire and can be revoked. The public endpoints return only the
// invoices of the one client the token was issued for.

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const portalCol = () => db.collection('portalTokens');

export const createPortalLink = tenantCallable('finance.manage', createPortalLinkInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'finance.manage');
    // Not idempotent by design: the raw token is never stored, so a replay could not return it.
    await getOrFail(t, tenantRef(ctx.tenantId).collection('clients').doc(input.clientId), 'client');
    const token = randomBytes(32).toString('base64url');
    t.create(portalCol().doc(hashToken(token)), {
      tenantId: ctx.tenantId,
      clientId: input.clientId,
      createdBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + input.expiresInDays * 86_400_000),
      revoked: false,
    });
    audit(t, ctx, 'finance.portal.create', { type: 'client', id: input.clientId }, { expiresInDays: input.expiresInDays });
    return { token };
  }),
);

export const revokePortalLinks = tenantCallable('finance.manage', revokePortalLinksInput, async (input, ctx) => {
  const snap = await portalCol().where('tenantId', '==', ctx.tenantId).where('clientId', '==', input.clientId).where('revoked', '==', false).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { revoked: true, revokedBy: ctx.uid, revokedAt: FieldValue.serverTimestamp() }));
  batch.create(tenantRef(ctx.tenantId).collection('auditLogs').doc(), {
    actorUid: ctx.uid, action: 'finance.portal.revoke', resource: { type: 'client', id: input.clientId }, metadata: { count: snap.size }, at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { revoked: snap.size };
});

async function resolveToken(token: string): Promise<{ tenantId: string; clientId: string; hash: string }> {
  const hash = hashToken(token);
  const snap = await portalCol().doc(hash).get();
  const d = snap.data();
  if (!d || d.revoked || (d.expiresAt as Timestamp).toMillis() < Date.now()) fail('link_invalid');
  return { tenantId: d.tenantId, clientId: d.clientId, hash };
}

export const portalGetInvoices = publicCallable(portalTokenInput, async ({ token }) => {
  const { tenantId, clientId } = await resolveToken(token);
  const [tenant, client, invoices, notices] = await Promise.all([
    tenantRef(tenantId).get(),
    tenantRef(tenantId).collection('clients').doc(clientId).get(),
    invoicesCol(tenantId).where('clientId', '==', clientId).where('status', 'in', ['sent', 'partially_paid', 'paid']).get(),
    tenantRef(tenantId).collection('paymentNotices').where('clientId', '==', clientId).where('status', '==', 'pending').get(),
  ]);
  const t = tenant.data() ?? {};
  // Explicit allow-list of fields: nothing internal (createdBy, notes on the client, other clients…) leaves the server.
  return {
    business: { name: t.businessProfile?.legalName || t.name, email: t.businessProfile?.email ?? '', phone: t.businessProfile?.phone ?? '', address: t.businessProfile?.address ?? '', paymentInstructions: t.businessProfile?.paymentInstructions ?? '' },
    client: { name: client.data()?.name ?? '' },
    invoices: invoices.docs.map((d) => {
      const i = d.data();
      return {
        id: d.id, number: i.number, issueDate: i.issueDate, dueDate: i.dueDate, currency: i.currency, status: i.status,
        lines: (i.lines as { description: string; quantityMilli: number; unitPriceMinor: number }[]).map((l, k) => ({ ...l, totalMinor: i.lineTotalsMinor[k] })),
        subtotalMinor: i.subtotalMinor, discountMinor: i.discountMinor, taxRateBps: i.taxRateBps, taxMinor: i.taxMinor,
        totalMinor: i.totalMinor, paidMinor: i.paidMinor, notes: i.notes,
      };
    }),
    pendingNotices: notices.docs.map((d) => ({ id: d.id, invoiceId: d.data().invoiceId, amountMinor: d.data().amountMinor, paidOn: d.data().paidOn })),
  };
});

/**
 * A client reports a payment. This only creates a pending notice: no money is
 * recorded and no invoice changes until a finance user approves it.
 */
export const portalSubmitPaymentNotice = publicCallable(portalPaymentNoticeInput, async (input) => {
  const { tenantId, clientId, hash } = await resolveToken(input.token);
  const noticeRef = tenantRef(tenantId).collection('paymentNotices').doc(hashToken(`${hash}:${input.requestId}`).slice(0, 40));
  return db.runTransaction(async (t) => {
    const prior = await t.get(noticeRef);
    if (prior.exists) return { noticeId: noticeRef.id }; // idempotent replay
    const inv = await getOrFail(t, invoicesCol(tenantId).doc(input.invoiceId), 'invoice');
    if (inv.clientId !== clientId) fail('link_invalid');
    if (inv.status !== 'sent' && inv.status !== 'partially_paid') fail('conflict', 'This invoice is not awaiting payment.');
    const pending = await t.get(tenantRef(tenantId).collection('paymentNotices').where('invoiceId', '==', input.invoiceId).where('status', '==', 'pending'));
    if (pending.size >= 3) fail('limit_reached', 'There are already payments awaiting confirmation for this invoice.');
    const pendingTotal = pending.docs.reduce((a, d) => a + (d.data().amountMinor as number), 0);
    if (input.amountMinor > inv.totalMinor - inv.paidMinor - pendingTotal) fail('invalid_input', 'The amount is larger than the balance due.', { amountMinor: 'Larger than the balance due' });
    t.create(noticeRef, {
      invoiceId: input.invoiceId, invoiceNumber: inv.number, clientId, amountMinor: input.amountMinor, currency: inv.currency,
      method: input.method, reference: input.reference, paidOn: input.paidOn, status: 'pending', submittedAt: FieldValue.serverTimestamp(),
    });
    t.create(invoicesCol(tenantId).doc(input.invoiceId).collection('events').doc(), {
      kind: 'payment_notice', by: null, at: FieldValue.serverTimestamp(), amountMinor: input.amountMinor, noticeId: noticeRef.id,
    });
    return { noticeId: noticeRef.id };
  });
});
