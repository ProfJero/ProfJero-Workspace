import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import type { z } from 'zod';
import { ERROR_REASONS, can, isRole, type ErrorReason, type Permission, type Role } from '@profjero/shared';

if (getApps().length === 0) initializeApp();
export const db = getFirestore();

export const REGION = 'europe-west1';

const REASON_TO_CODE: Record<ErrorReason, ConstructorParameters<typeof HttpsError>[0]> = {
  not_authenticated: 'unauthenticated',
  not_member: 'permission-denied',
  forbidden: 'permission-denied',
  not_found: 'not-found',
  invalid_input: 'invalid-argument',
  conflict: 'failed-precondition',
  insufficient_balance: 'failed-precondition',
  already_exists: 'already-exists',
  limit_reached: 'resource-exhausted',
  link_invalid: 'not-found',
  email_unverified: 'failed-precondition',
  unavailable: 'unavailable',
  internal: 'internal',
};

/** Throw a user-safe error. `message` must be written for end users. */
export function fail(reason: ErrorReason, message?: string, fields?: Record<string, string>): never {
  const text = message ?? ERROR_REASONS[reason];
  throw new HttpsError(REASON_TO_CODE[reason], text, { reason, message: text, ...(fields ? { fields } : {}) });
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    fail('invalid_input', undefined, fields);
  }
  return result.data;
}

export interface AuthContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export function requireAuth(req: CallableRequest<unknown>): AuthContext {
  if (!req.auth) fail('not_authenticated');
  const token = req.auth.token;
  return {
    uid: req.auth.uid,
    email: typeof token.email === 'string' ? token.email.toLowerCase() : null,
    emailVerified: token.email_verified === true,
  };
}

export interface MemberContext extends AuthContext {
  tenantId: string;
  role: Role;
}

export const tenantRef = (tenantId: string) => db.collection('tenants').doc(tenantId);
export const memberRef = (tenantId: string, uid: string) => tenantRef(tenantId).collection('members').doc(uid);

/**
 * Loads the caller's membership from the database (never from the request)
 * and checks the permission. Removed or suspended members are rejected.
 */
export async function requireMember(auth: AuthContext, tenantId: string, permission: Permission): Promise<MemberContext> {
  const snap = await memberRef(tenantId, auth.uid).get();
  const data = snap.data();
  if (!snap.exists || !data || data.status !== 'active' || !isRole(data.role)) fail('not_member');
  if (!can(data.role, permission)) fail('forbidden');
  return { ...auth, tenantId, role: data.role };
}

/** Same check inside a transaction, so a role change racing with the operation cannot be bypassed. */
export async function requireMemberTx(t: Transaction, ctx: MemberContext, permission: Permission): Promise<void> {
  const snap = await t.get(memberRef(ctx.tenantId, ctx.uid));
  const data = snap.data();
  if (!data || data.status !== 'active' || !isRole(data.role) || !can(data.role, permission)) fail('forbidden');
}

const callableOpts = { region: REGION, enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', cors: true };

/** A callable that needs a signed-in user but no tenant. */
export function userCallable<S extends z.ZodType, R>(schema: S, handler: (input: z.infer<S>, auth: AuthContext) => Promise<R>) {
  return onCall(callableOpts, async (req) => wrap(req, async () => handler(parse(schema, req.data), requireAuth(req))));
}

/** A callable scoped to a tenant: auth + input validation + membership + permission. */
export function tenantCallable<S extends z.ZodType<{ tenantId: string }>, R>(
  permission: Permission,
  schema: S,
  handler: (input: z.infer<S>, ctx: MemberContext) => Promise<R>,
) {
  return onCall(callableOpts, async (req) =>
    wrap(req, async () => {
      const auth = requireAuth(req);
      const input = parse(schema, req.data);
      const ctx = await requireMember(auth, input.tenantId, permission);
      return handler(input, ctx);
    }),
  );
}

/** A callable open to unauthenticated callers (client portal). Input must carry its own credential. */
export function publicCallable<S extends z.ZodType, R>(schema: S, handler: (input: z.infer<S>) => Promise<R>) {
  return onCall(callableOpts, async (req) => wrap(req, async () => handler(parse(schema, req.data))));
}

async function wrap<R>(req: CallableRequest<unknown>, fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    // Firestore transaction contention after retries.
    const code = (err as { code?: number | string }).code;
    if (code === 10 || code === 'ABORTED') fail('conflict', 'Another change happened at the same time. Please try again.');
    logger.error('Unhandled function error', { uid: req.auth?.uid ?? null, error: err instanceof Error ? err.stack : String(err) });
    fail('internal');
  }
}

/** Metadata for documents written by functions. */
export function createdMeta(uid: string) {
  return { createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedBy: uid, updatedAt: FieldValue.serverTimestamp() };
}
export function updatedMeta(uid: string) {
  return { updatedBy: uid, updatedAt: FieldValue.serverTimestamp() };
}

// ───────────────────────────── Idempotency ─────────────────────────────

/**
 * Idempotency for mutations. The client generates `requestId` once per form
 * submission; retries, double-clicks and replays with the same id return the
 * stored result. Because the check and the write happen in the same Firestore
 * transaction, two concurrent identical requests cannot both write.
 */
export async function idempotent<R extends Record<string, unknown>>(
  t: Transaction,
  ctx: { tenantId: string; uid: string },
  requestId: string,
  operation: string,
): Promise<{ replay: R | null; commit: (result: R) => void }> {
  const ref = tenantRef(ctx.tenantId).collection('requests').doc(`${ctx.uid}_${requestId}`);
  const snap = await t.get(ref);
  if (snap.exists) {
    const data = snap.data()!;
    if (data.operation !== operation) fail('conflict', 'This request id was already used for a different operation.');
    return { replay: data.result as R, commit: () => undefined };
  }
  return {
    replay: null,
    commit: (result: R) => {
      t.create(ref, { operation, result, uid: ctx.uid, createdAt: FieldValue.serverTimestamp() });
    },
  };
}

// ───────────────────────────── Audit log ─────────────────────────────

export function audit(
  t: Transaction,
  ctx: { tenantId: string; uid: string },
  action: string,
  resource: { type: string; id: string },
  metadata: Record<string, unknown> = {},
): void {
  const ref = tenantRef(ctx.tenantId).collection('auditLogs').doc();
  t.create(ref, { actorUid: ctx.uid, action, resource, metadata, at: FieldValue.serverTimestamp() });
}

export async function getOrFail<T = FirebaseFirestore.DocumentData>(t: Transaction, ref: DocumentReference, what = 'item'): Promise<T> {
  const snap = await t.get(ref);
  if (!snap.exists) fail('not_found', `That ${what} no longer exists.`);
  return snap.data() as T;
}
