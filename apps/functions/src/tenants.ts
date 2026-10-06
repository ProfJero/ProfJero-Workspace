import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  acceptInvitationInput,
  canAssignRole,
  canRemoveMember,
  changeRoleInput,
  createTenantInput,
  inviteMemberInput,
  isRole,
  isValidTimeZone,
  removeMemberInput,
  revokeInvitationInput,
  transferOwnershipInput,
  updateTenantInput,
  type Role,
} from '@profjero/shared';
import {
  audit,
  createdMeta,
  db,
  fail,
  getOrFail,
  idempotent,
  memberRef,
  requireMemberTx,
  tenantCallable,
  tenantRef,
  updatedMeta,
  userCallable,
} from './lib/core';

const INVITATION_TTL_DAYS = 14;
const MAX_TENANTS_PER_USER = 20;

export const createTenant = userCallable(createTenantInput, async (input, auth) => {
  if (!isValidTimeZone(input.timezone)) fail('invalid_input', 'Unknown timezone.', { timezone: 'Unknown timezone' });
  // Bound the number of workspaces a single account can create (abuse protection).
  const owned = await db.collectionGroup('members').where('uid', '==', auth.uid).where('role', '==', 'owner').count().get();
  if (owned.data().count >= MAX_TENANTS_PER_USER) fail('limit_reached', 'You have reached the maximum number of workspaces.');

  const ref = tenantRef(db.collection('tenants').doc().id);
  return db.runTransaction(async (t) => {
    // Idempotency is keyed per user here because there is no tenant yet.
    const reqRef = db.collection('users').doc(auth.uid).collection('requests').doc(input.requestId);
    const prior = await t.get(reqRef);
    if (prior.exists) return prior.data()!.result as { tenantId: string };

    t.create(ref, {
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      timezone: input.timezone,
      weekStartsOn: 1,
      invoicePrefix: 'INV-',
      businessProfile: { legalName: '', email: '', phone: '', address: '', paymentInstructions: '' },
      status: 'active',
      ...createdMeta(auth.uid),
    });
    t.create(memberRef(ref.id, auth.uid), {
      uid: auth.uid,
      tenantId: ref.id,
      email: auth.email,
      role: 'owner',
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
      invitedBy: null,
      lastActiveAt: FieldValue.serverTimestamp(),
    });
    audit(t, { tenantId: ref.id, uid: auth.uid }, 'tenant.create', { type: 'tenant', id: ref.id }, { name: input.name, kind: input.kind });
    const result = { tenantId: ref.id };
    t.create(reqRef, { result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const updateTenant = tenantCallable('tenant.update', updateTenantInput, async (input, ctx) => {
  const s = input.settings;
  if (s.timezone && !isValidTimeZone(s.timezone)) fail('invalid_input', 'Unknown timezone.', { timezone: 'Unknown timezone' });
  return db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'tenant.update');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'tenant.update');
    if (replay) return replay;
    const ref = tenantRef(ctx.tenantId);
    const before = await getOrFail(t, ref, 'workspace');
    if (s.currency && s.currency !== before.currency) {
      // Changing the base currency would silently re-label every amount.
      const accounts = await t.get(ref.collection('accounts').limit(1));
      if (!accounts.empty) fail('conflict', 'The workspace currency cannot be changed after accounts exist.');
    }
    t.update(ref, { ...s, ...updatedMeta(ctx.uid) });
    audit(t, ctx, 'tenant.update', { type: 'tenant', id: ctx.tenantId }, { changed: Object.keys(s) });
    commit({ ok: true });
    return { ok: true as const };
  });
});

export const inviteMember = tenantCallable('members.manage', inviteMemberInput, async (input, ctx) => {
  const check = canAssignRole({ actorRole: ctx.role, actorUid: ctx.uid, targetUid: '__invitee__', currentRole: null, newRole: input.role });
  if (!check.ok) fail('forbidden', check.reason);
  return db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'members.manage');
    const { replay, commit } = await idempotent<{ invitationId: string }>(t, ctx, input.requestId, 'member.invite');
    if (replay) return replay;
    const tenant = await getOrFail(t, tenantRef(ctx.tenantId), 'workspace');
    const existing = await t.get(tenantRef(ctx.tenantId).collection('members').where('email', '==', input.email).where('status', '==', 'active').limit(1));
    if (!existing.empty) fail('already_exists', 'This person is already a member.');
    const pending = await t.get(tenantRef(ctx.tenantId).collection('invitations').where('email', '==', input.email).where('status', '==', 'pending'));
    for (const p of pending.docs) t.update(p.ref, { status: 'superseded' });
    const ref = tenantRef(ctx.tenantId).collection('invitations').doc();
    t.create(ref, {
      tenantId: ctx.tenantId,
      tenantName: tenant.name,
      email: input.email,
      role: input.role,
      status: 'pending',
      invitedBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
    });
    audit(t, ctx, 'member.invite', { type: 'invitation', id: ref.id }, { email: input.email, role: input.role });
    const result = { invitationId: ref.id };
    commit(result);
    return result;
  });
});

export const revokeInvitation = tenantCallable('members.manage', revokeInvitationInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    const ref = tenantRef(ctx.tenantId).collection('invitations').doc(input.invitationId);
    const inv = await getOrFail(t, ref, 'invitation');
    if (inv.status !== 'pending') fail('conflict', 'This invitation is no longer pending.');
    t.update(ref, { status: 'revoked', revokedBy: ctx.uid, revokedAt: FieldValue.serverTimestamp() });
    audit(t, ctx, 'member.invite_revoke', { type: 'invitation', id: input.invitationId }, { email: inv.email });
    return { ok: true };
  }),
);

/** Accepting requires a verified email that matches the invitation — invitations cannot be redeemed by someone else. */
export const acceptInvitation = userCallable(acceptInvitationInput, async (input, auth) => {
  if (!auth.email || !auth.emailVerified) fail('email_unverified');
  return db.runTransaction(async (t) => {
    const ref = tenantRef(input.tenantId).collection('invitations').doc(input.invitationId);
    const inv = await getOrFail(t, ref, 'invitation');
    if (inv.email !== auth.email) fail('forbidden', 'This invitation was sent to a different email address.');
    if (inv.status !== 'pending') fail('conflict', 'This invitation is no longer valid.');
    if ((inv.expiresAt as Timestamp).toMillis() < Date.now()) fail('link_invalid', 'This invitation has expired. Ask for a new one.');
    if (!isRole(inv.role)) fail('internal');
    const mRef = memberRef(input.tenantId, auth.uid);
    const existing = await t.get(mRef);
    if (existing.exists && existing.data()!.status === 'active') fail('already_exists', 'You are already a member of this workspace.');
    t.set(mRef, {
      uid: auth.uid,
      tenantId: input.tenantId,
      email: auth.email,
      role: inv.role,
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
      invitedBy: inv.invitedBy,
      lastActiveAt: FieldValue.serverTimestamp(),
    });
    t.update(ref, { status: 'accepted', acceptedBy: auth.uid, acceptedAt: FieldValue.serverTimestamp() });
    audit(t, { tenantId: input.tenantId, uid: auth.uid }, 'member.join', { type: 'member', id: auth.uid }, { role: inv.role, invitationId: input.invitationId });
    return { tenantId: input.tenantId };
  });
});

export const changeMemberRole = tenantCallable('members.manage', changeRoleInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'members.manage');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'member.role');
    if (replay) return replay;
    const target = await getOrFail(t, memberRef(ctx.tenantId, input.uid), 'member');
    if (target.status !== 'active') fail('conflict', 'This person is no longer an active member.');
    const check = canAssignRole({ actorRole: ctx.role, actorUid: ctx.uid, targetUid: input.uid, currentRole: target.role as Role, newRole: input.role });
    if (!check.ok) fail('forbidden', check.reason);
    t.update(memberRef(ctx.tenantId, input.uid), { role: input.role, roleChangedBy: ctx.uid, roleChangedAt: FieldValue.serverTimestamp() });
    audit(t, ctx, 'member.role_change', { type: 'member', id: input.uid }, { from: target.role, to: input.role });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

/** Removal keeps the membership document (status: removed) for the audit trail; rules deny all access immediately. */
export const removeMember = tenantCallable('workspace.read', removeMemberInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'member.remove');
    if (replay) return replay;
    const target = await getOrFail(t, memberRef(ctx.tenantId, input.uid), 'member');
    if (target.status !== 'active') fail('conflict', 'This person is not an active member.');
    const check = canRemoveMember({ actorRole: ctx.role, actorUid: ctx.uid, targetUid: input.uid, targetRole: target.role as Role });
    if (!check.ok) fail('forbidden', check.reason);
    t.update(memberRef(ctx.tenantId, input.uid), { status: 'removed', removedBy: ctx.uid, removedAt: FieldValue.serverTimestamp() });
    audit(t, ctx, ctx.uid === input.uid ? 'member.leave' : 'member.remove', { type: 'member', id: input.uid }, { role: target.role });
    commit({ ok: true });
    return { ok: true as const };
  }),
);

export const transferOwnership = tenantCallable('tenant.delete', transferOwnershipInput, async (input, ctx) =>
  db.runTransaction(async (t) => {
    await requireMemberTx(t, ctx, 'tenant.delete');
    const { replay, commit } = await idempotent<{ ok: true }>(t, ctx, input.requestId, 'tenant.transfer');
    if (replay) return replay;
    if (input.uid === ctx.uid) fail('invalid_input', 'You already own this workspace.');
    const target = await getOrFail(t, memberRef(ctx.tenantId, input.uid), 'member');
    if (target.status !== 'active') fail('conflict', 'Ownership can only be transferred to an active member.');
    t.update(memberRef(ctx.tenantId, input.uid), { role: 'owner' });
    t.update(memberRef(ctx.tenantId, ctx.uid), { role: 'admin' });
    audit(t, ctx, 'tenant.transfer_ownership', { type: 'member', id: input.uid }, { previousOwner: ctx.uid });
    commit({ ok: true });
    return { ok: true as const };
  }),
);
