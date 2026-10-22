import { createTenantInput, isValidTimeZone } from '@profjero/shared';
import type { Env } from '../env';
import type { Caller } from '../auth/firebase';
import { ApiError } from '../errors';
import { batchWrite, getDoc } from '../firestore/rest';
import { countCollectionGroup } from '../firestore/query';

const MAX_TENANTS_PER_USER = 20;

/**
 * Mirrors apps/functions/src/tenants.ts → createTenant.
 *
 * Uses `documents:batchWrite` (atomic) instead of a Firestore transaction: no
 * reads are contended — the tenant id is randomly generated and the only
 * precondition is on the idempotency record (last write, createOnly). If two
 * requests with the same requestId race, one batch's idempotency write fails
 * with ALREADY_EXISTS and the whole batch rolls back; the loser then replays
 * the winner's stored result.
 */
export async function handleCreateTenant(
  env: Env,
  caller: Caller,
  raw: unknown,
): Promise<{ tenantId: string }> {
  const parsed = createTenantInput.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new ApiError('invalid_input', 'Some of the information entered is not valid.', fields);
  }
  const input = parsed.data;

  if (!isValidTimeZone(input.timezone)) {
    throw new ApiError('invalid_input', 'Unknown timezone.', { timezone: 'Unknown timezone' });
  }

  const owned = await countCollectionGroup(env, 'members', [
    { field: 'uid', value: caller.uid },
    { field: 'role', value: 'owner' },
  ]);
  if (owned >= MAX_TENANTS_PER_USER) {
    throw new ApiError('limit_reached', 'You have reached the maximum number of workspaces.');
  }

  const requestPath = `users/${caller.uid}/requests/${input.requestId}`;
  const prior = await getDoc(env, requestPath);
  if (prior) {
    const result = prior.result as { tenantId?: unknown } | undefined;
    if (result && typeof result.tenantId === 'string') {
      return { tenantId: result.tenantId };
    }
  }

  const tenantId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const auditId = crypto.randomUUID();

  // Mirrors the original function exactly: defaults from the schema,
  // createdMeta(uid) fields (createdBy, updatedBy, and server-timestamp
  // createdAt/updatedAt), no `version` field.
  const tenantFields = {
    name: input.name,
    kind: input.kind,
    currency: input.currency,
    timezone: input.timezone,
    weekStartsOn: 1,
    invoicePrefix: 'INV-',
    businessProfile: {
      legalName: '',
      email: '',
      phone: '',
      address: '',
      paymentInstructions: '',
    },
    status: 'active',
    createdBy: caller.uid,
    updatedBy: caller.uid,
  };

  const memberFields = {
    uid: caller.uid,
    tenantId,
    email: caller.email, // preserved as null when the token has no email, matching the original
    role: 'owner',
    status: 'active',
    invitedBy: null,
  };

  // Matches audit(t, ctx, action, resource, metadata) in core.ts.
  const auditFields = {
    actorUid: caller.uid,
    action: 'tenant.create',
    resource: { type: 'tenant', id: tenantId },
    metadata: { name: input.name, kind: input.kind },
  };

  // Matches t.create(reqRef, { result, createdAt }) in the original.
  const requestFields = { result: { tenantId } };

  const writes = [
    { path: `tenants/${tenantId}`, fields: tenantFields, serverTimestamps: ['createdAt', 'updatedAt'] },
    { path: `tenants/${tenantId}/members/${caller.uid}`, fields: memberFields, serverTimestamps: ['joinedAt', 'lastActiveAt'] },
    { path: `tenants/${tenantId}/auditLogs/${auditId}`, fields: auditFields, serverTimestamps: ['at'] },
    { path: requestPath, fields: requestFields, createOnly: true, serverTimestamps: ['createdAt'] },
  ];

  const results = await batchWrite(env, writes);
  const last = results[results.length - 1];
  if (!last.ok) {
    if (last.status?.includes('ALREADY_EXISTS')) {
      const winner = await getDoc(env, requestPath);
      const result = winner?.result as { tenantId?: unknown } | undefined;
      if (result && typeof result.tenantId === 'string') {
        return { tenantId: result.tenantId };
      }
    }
    throw new ApiError('internal', 'Something went wrong on our side. Please try again.');
  }

  return { tenantId };
}