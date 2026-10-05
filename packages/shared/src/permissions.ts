/**
 * Central role → permission table.
 *
 * This file is the single source of truth for authorization. It is used by:
 *   - the UI (to hide actions a member cannot perform),
 *   - Cloud Functions (to authorize every privileged operation),
 *   - scripts/build-rules.ts, which generates the role lists inside
 *     firebase/firestore.rules and storage.rules from this table.
 * Never check role names anywhere else; check permissions.
 */

export const ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full control, including deleting the workspace and transferring ownership.',
  admin: 'Manages members, settings and all data.',
  manager: 'Manages workspace content, clients and finances.',
  member: 'Creates and edits workspace content. No access to finances.',
  viewer: 'Read-only access to workspace content.',
};

/** Higher rank = more privilege. Used only to decide who may assign which role. */
export const ROLE_RANK: Record<Role, number> = { owner: 50, admin: 40, manager: 30, member: 20, viewer: 10 };

export const PERMISSIONS = {
  'tenant.update': ['owner', 'admin'],
  'tenant.delete': ['owner'],
  'members.read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'members.manage': ['owner', 'admin'],
  'workspace.read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'workspace.write': ['owner', 'admin', 'manager', 'member'],
  /** Delete any workspace record. Writers may always delete records they created. */
  'workspace.deleteAny': ['owner', 'admin', 'manager'],
  'clients.read': ['owner', 'admin', 'manager', 'member'],
  'clients.write': ['owner', 'admin', 'manager'],
  'finance.read': ['owner', 'admin', 'manager'],
  'finance.write': ['owner', 'admin', 'manager'],
  /** Accounts, voiding, reconciliation, portal links. */
  'finance.manage': ['owner', 'admin'],
  'audit.read': ['owner', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export type MemberStatus = 'active' | 'suspended' | 'removed';

/**
 * Who may set `target` role on a member currently holding `current` role.
 * - Only owners can grant or revoke ownership (ownership transfer).
 * - Admins can manage roles strictly below admin.
 * - Nobody can change their own role (prevents self-escalation and
 *   accidental lock-out); ownership transfer is a dedicated operation.
 */
export function canAssignRole(params: {
  actorRole: Role;
  actorUid: string;
  targetUid: string;
  currentRole: Role | null;
  newRole: Role;
}): { ok: true } | { ok: false; reason: string } {
  const { actorRole, actorUid, targetUid, currentRole, newRole } = params;
  if (!can(actorRole, 'members.manage')) return { ok: false, reason: 'You cannot manage members.' };
  if (actorUid === targetUid) return { ok: false, reason: 'You cannot change your own role.' };
  if (newRole === 'owner' || currentRole === 'owner') {
    return { ok: false, reason: 'Use ownership transfer to change the owner.' };
  }
  if (actorRole !== 'owner') {
    if (ROLE_RANK[newRole] >= ROLE_RANK[actorRole]) return { ok: false, reason: 'You can only assign roles below your own.' };
    if (currentRole && ROLE_RANK[currentRole] >= ROLE_RANK[actorRole]) {
      return { ok: false, reason: 'You cannot change the role of someone at or above your level.' };
    }
  }
  return { ok: true };
}

export function canRemoveMember(params: {
  actorRole: Role;
  actorUid: string;
  targetUid: string;
  targetRole: Role;
}): { ok: true } | { ok: false; reason: string } {
  const { actorRole, actorUid, targetUid, targetRole } = params;
  if (actorUid === targetUid) {
    return targetRole === 'owner'
      ? { ok: false, reason: 'Transfer ownership before leaving the workspace.' }
      : { ok: true }; // anyone but the owner may leave
  }
  if (!can(actorRole, 'members.manage')) return { ok: false, reason: 'You cannot manage members.' };
  if (targetRole === 'owner') return { ok: false, reason: 'The owner cannot be removed.' };
  if (actorRole !== 'owner' && ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
    return { ok: false, reason: 'You cannot remove someone at or above your level.' };
  }
  return { ok: true };
}
