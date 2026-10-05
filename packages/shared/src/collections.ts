import type { z } from 'zod';
import type { Permission } from './permissions';
import {
  categorySchema,
  clientInteractionSchema,
  clientSchema,
  courseSchema,
  documentSchema,
  eventSchema,
  goalSchema,
  habitLogSchema,
  habitSchema,
  milestoneSchema,
  noteSchema,
  projectSchema,
  studySessionSchema,
  taskSchema,
} from './schemas';

/**
 * Registry of tenant-owned collections (tenants/{tenantId}/{name}/{id}).
 *
 * clientWritable: documents written directly from the app, validated by
 *   security rules generated from `schema` (scripts/build-rules.ts).
 * Function-owned collections (finance, members, audit…) are read-only to
 *   clients; only Cloud Functions write them.
 */
export interface ClientCollection {
  name: string;
  schema: z.ZodObject;
  read: Permission;
  write: Permission;
  /** Permission to delete any document; writers may always delete documents they created. */
  deleteAny: Permission;
}

export const CLIENT_COLLECTIONS = [
  { name: 'tasks', schema: taskSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'projects', schema: projectSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'goals', schema: goalSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'milestones', schema: milestoneSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'notes', schema: noteSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'events', schema: eventSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'courses', schema: courseSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'studySessions', schema: studySessionSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'documents', schema: documentSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'habits', schema: habitSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'habitLogs', schema: habitLogSchema, read: 'workspace.read', write: 'workspace.write', deleteAny: 'workspace.deleteAny' },
  { name: 'clients', schema: clientSchema, read: 'clients.read', write: 'clients.write', deleteAny: 'clients.write' },
  { name: 'clientInteractions', schema: clientInteractionSchema, read: 'clients.read', write: 'clients.write', deleteAny: 'clients.write' },
  { name: 'categories', schema: categorySchema, read: 'finance.read', write: 'finance.write', deleteAny: 'finance.manage' },
] as const satisfies readonly ClientCollection[];

export type ClientCollectionName = (typeof CLIENT_COLLECTIONS)[number]['name'];

/** Collections only Cloud Functions write. Clients may read with the given permission. */
export const FUNCTION_COLLECTIONS = {
  members: 'members.read',
  invitations: 'members.manage',
  auditLogs: 'audit.read',
  accounts: 'finance.read',
  transactions: 'finance.read',
  debts: 'finance.read',
  budgets: 'finance.read',
  savingsGoals: 'finance.read',
  savingsContributions: 'finance.read',
  invoices: 'finance.read',
  paymentNotices: 'finance.read',
} as const satisfies Record<string, Permission>;

/** Metadata the data layer adds to every client-written document. */
export const METADATA_FIELDS = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'] as const;
