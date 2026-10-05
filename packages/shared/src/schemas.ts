import { z } from 'zod';
import { isIsoDate } from './dates';
import { CURRENCY_CODES } from './money';
import { ROLES } from './permissions';
import {
  CLIENT_STATUSES,
  COURSE_STATUSES,
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
} from './workspace';
import { ACCOUNT_TYPES, SPENDING_NATURES, USER_TRANSACTION_TYPES } from './finance/types';

/*
 * Patterns avoid backslashes so they can be embedded verbatim into
 * Firestore rules (RE2) by scripts/build-rules.ts.
 */
export const ID_PATTERN = '^[A-Za-z0-9_-]{1,128}$';
export const ISO_DATE_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
export const WALL_TIME_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$';
export const TIME_PATTERN = '^[0-9]{2}:[0-9]{2}$';

export const zId = z.string().regex(new RegExp(ID_PATTERN), 'Invalid identifier');
export const zIsoDate = z.string().regex(new RegExp(ISO_DATE_PATTERN), 'Use YYYY-MM-DD').refine(isIsoDate, 'Not a real calendar date');
/** Wall-clock date-time in the tenant's timezone, e.g. 2026-10-05T14:30 */
export const zWallTime = z
  .string()
  .regex(new RegExp(WALL_TIME_PATTERN), 'Use YYYY-MM-DDTHH:mm')
  .refine((v) => isIsoDate(v.slice(0, 10)) && Number(v.slice(11, 13)) < 24 && Number(v.slice(14, 16)) < 60, 'Not a real date/time');
export const zTime = z.string().regex(new RegExp(TIME_PATTERN), 'Use HH:mm');
export const text = (max: number) => z.string().trim().max(max);
export const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max);
export const zCurrency = z.enum(CURRENCY_CODES as [string, ...string[]]);
export const zMinorPositive = z.number().int().min(1).max(100_000_000_000_000);
export const zMinorNonNegative = z.number().int().min(0).max(100_000_000_000_000);
export const zMinorSigned = z.number().int().min(-100_000_000_000_000).max(100_000_000_000_000);
const tags = z.array(z.string().trim().min(1).max(40)).max(20);

// ═══════════════════════════ Tenant & profile ═══════════════════════════

export const TENANT_KINDS = ['personal', 'business', 'ngo', 'church', 'school', 'company', 'other'] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];

export const tenantSettingsSchema = z.object({
  name: requiredText(80),
  kind: z.enum(TENANT_KINDS),
  currency: zCurrency,
  timezone: requiredText(64),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9-]{0,10}$/, 'Uppercase letters, digits and dashes only'),
  businessProfile: z.object({
    legalName: text(120),
    email: text(120),
    phone: text(40),
    address: text(300),
    paymentInstructions: text(1000),
  }),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const createTenantInput = z.object({
  name: requiredText(80),
  kind: z.enum(TENANT_KINDS),
  currency: zCurrency,
  timezone: requiredText(64),
  requestId: zId,
});

export const userProfileSchema = z.object({
  displayName: text(80),
  defaultTenantId: zId.nullable(),
  theme: z.enum(['system', 'light', 'dark']),
});

// ═══════════════════════════ Workspace documents ═══════════════════════════
// Stored shapes of client-writable collections. Server-managed metadata
// (createdBy, createdAt, updatedAt, updatedBy) is added by the data layer and
// enforced by the security rules.

const links = z.object({
  projectId: zId.nullable(),
  goalId: zId.nullable(),
  taskId: zId.nullable(),
  clientId: zId.nullable(),
  courseId: zId.nullable(),
});
export type Links = z.infer<typeof links>;
export const emptyLinks: Links = { projectId: null, goalId: null, taskId: null, clientId: null, courseId: null };

export const taskSchema = z.object({
  title: requiredText(200),
  description: text(5000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: zIsoDate.nullable(),
  dueTime: zTime.nullable(),
  projectId: zId.nullable(),
  goalId: zId.nullable(),
  assigneeId: zId.nullable(),
  labels: tags,
  recurrence: z.object({ frequency: z.enum(['daily', 'weekly', 'monthly']), interval: z.number().int().min(1).max(365) }).nullable(),
  completedOn: zIsoDate.nullable(),
});
export type TaskDoc = z.infer<typeof taskSchema>;

export const projectSchema = z.object({
  name: requiredText(120),
  description: text(5000),
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PRIORITIES),
  startDate: zIsoDate.nullable(),
  deadline: zIsoDate.nullable(),
  clientId: zId.nullable(),
  goalId: zId.nullable(),
  memberIds: z.array(zId).max(50),
  budgetMinor: zMinorNonNegative.nullable(),
  progressMode: z.enum(['tasks', 'manual']),
  manualProgress: z.number().int().min(0).max(100),
  archived: z.boolean(),
});
export type ProjectDoc = z.infer<typeof projectSchema>;

export const goalSchema = z.object({
  title: requiredText(160),
  description: text(5000),
  category: z.enum(GOAL_CATEGORIES),
  status: z.enum(GOAL_STATUSES),
  startDate: zIsoDate.nullable(),
  targetDate: zIsoDate.nullable(),
  measureKind: z.enum(['milestones', 'numeric', 'tasks']),
  measureTarget: z.number().min(0).max(1_000_000_000),
  measureCurrent: z.number().min(0).max(1_000_000_000),
  measureUnit: text(30),
  why: text(2000),
});
export type GoalDoc = z.infer<typeof goalSchema>;

export const milestoneSchema = z.object({
  goalId: zId,
  title: requiredText(160),
  dueDate: zIsoDate.nullable(),
  done: z.boolean(),
  doneOn: zIsoDate.nullable(),
  order: z.number().int().min(0).max(10_000),
});
export type MilestoneDoc = z.infer<typeof milestoneSchema>;

export const noteSchema = z.object({
  title: requiredText(200),
  /** Plain text with lightweight markdown; never rendered as HTML. */
  body: text(100_000),
  category: z.enum(['general', 'meeting', 'idea', 'research', 'study', 'personal', 'work']),
  tags,
  pinned: z.boolean(),
  links,
  meeting: z
    .object({
      date: zIsoDate.nullable(),
      attendees: z.array(z.string().trim().min(1).max(80)).max(50),
      agenda: text(5000),
      actionItems: z.array(z.string().trim().min(1).max(300)).max(50),
    })
    .nullable(),
});
export type NoteDoc = z.infer<typeof noteSchema>;

export const EVENT_KINDS = ['event', 'meeting', 'reminder', 'study', 'deadline'] as const;
export const eventSchema = z.object({
  title: requiredText(200),
  description: text(5000),
  kind: z.enum(EVENT_KINDS),
  allDay: z.boolean(),
  /** All-day events use T00:00. Wall time in the tenant timezone. */
  start: zWallTime,
  end: zWallTime,
  location: text(200),
  links,
});
export type EventDoc = z.infer<typeof eventSchema>;

export const clientSchema = z.object({
  name: requiredText(120),
  company: text(120),
  email: z.union([z.literal(''), z.string().trim().email().max(120)]),
  phone: text(40),
  address: text(300),
  status: z.enum(CLIENT_STATUSES),
  notes: text(5000),
  tags,
});
export type ClientDoc = z.infer<typeof clientSchema>;

export const clientInteractionSchema = z.object({
  clientId: zId,
  kind: z.enum(['call', 'email', 'meeting', 'message', 'note']),
  date: zIsoDate,
  summary: requiredText(2000),
});
export type ClientInteractionDoc = z.infer<typeof clientInteractionSchema>;

export const courseSchema = z.object({
  title: requiredText(200),
  provider: text(120),
  url: z.union([z.literal(''), z.string().trim().url().max(500).regex(/^https?:/)]),
  status: z.enum(COURSE_STATUSES),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  totalUnits: z.number().int().min(0).max(10_000),
  completedUnits: z.number().int().min(0).max(10_000),
  goalId: zId.nullable(),
  targetDate: zIsoDate.nullable(),
  notes: text(5000),
});
export type CourseDoc = z.infer<typeof courseSchema>;

export const studySessionSchema = z.object({
  date: zIsoDate,
  minutes: z.number().int().min(1).max(1440),
  courseId: zId.nullable(),
  documentId: zId.nullable(),
  topic: text(200),
  notes: text(5000),
});
export type StudySessionDoc = z.infer<typeof studySessionSchema>;

export const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const documentSchema = z.object({
  title: requiredText(200),
  fileName: requiredText(200),
  contentType: z.enum(DOCUMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  /** Must be tenants/{tenantId}/documents/{docId}/… (enforced by rules). */
  storagePath: requiredText(400),
  /** Processed text (JSON CleanPage[]) stored next to the file. */
  textPath: text(400).nullable(),
  pageCount: z.number().int().min(0).max(10_000),
  wordCount: z.number().int().min(0).max(10_000_000),
  status: z.enum(['uploaded', 'processed', 'failed']),
  courseId: zId.nullable(),
  position: z.object({ page: z.number().int().min(1).max(10_000), paragraph: z.number().int().min(0).max(100_000) }),
});
export type DocumentDoc = z.infer<typeof documentSchema>;

export const habitSchema = z.object({
  name: requiredText(80),
  frequency: z.enum(['daily', 'weekly']),
  target: z.number().int().min(1).max(1000),
  unit: text(30),
  archived: z.boolean(),
});
export type HabitDoc = z.infer<typeof habitSchema>;

export const habitLogSchema = z.object({
  habitId: zId,
  date: zIsoDate,
  value: z.number().int().min(0).max(100_000),
});
export type HabitLogDoc = z.infer<typeof habitLogSchema>;

export const categorySchema = z.object({
  name: requiredText(60),
  kind: z.enum(['income', 'expense']),
  defaultNature: z.enum(SPENDING_NATURES).nullable(),
  archived: z.boolean(),
});
export type CategoryDoc = z.infer<typeof categorySchema>;

// ═══════════════════════════ Function inputs ═══════════════════════════
// Every privileged write goes through a callable function with one of these
// inputs. `requestId` is a client-generated idempotency key: replaying a
// request with the same id returns the original result instead of writing again.

const withTenant = { tenantId: zId, requestId: zId };

export const inviteMemberInput = z.object({ ...withTenant, email: z.string().trim().toLowerCase().email().max(120), role: z.enum(ROLES) });
export const acceptInvitationInput = z.object({ tenantId: zId, invitationId: zId });
export const revokeInvitationInput = z.object({ tenantId: zId, invitationId: zId });
export const changeRoleInput = z.object({ ...withTenant, uid: zId, role: z.enum(ROLES) });
export const removeMemberInput = z.object({ ...withTenant, uid: zId });
export const transferOwnershipInput = z.object({ ...withTenant, uid: zId });
export const updateTenantInput = z.object({ ...withTenant, settings: tenantSettingsSchema.partial() });

export const accountInput = z.object({
  name: requiredText(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: zCurrency,
  openingBalanceMinor: zMinorSigned,
});
export const createAccountInput = z.object({ ...withTenant, account: accountInput });
export const updateAccountInput = z.object({
  ...withTenant,
  accountId: zId,
  changes: accountInput.omit({ currency: true }).partial().extend({ archived: z.boolean().optional() }),
});

export const transactionInput = z.object({
  type: z.enum(USER_TRANSACTION_TYPES),
  amountMinor: zMinorPositive,
  date: zIsoDate,
  accountId: zId,
  toAccountId: zId.nullable(),
  categoryId: zId.nullable(),
  nature: z.enum(SPENDING_NATURES).nullable(),
  adjustmentDirection: z.enum(['increase', 'decrease']).nullable(),
  description: text(300),
  payee: text(120).nullable(),
  reference: text(120).nullable(),
  refundOfId: zId.nullable(),
  projectId: zId.nullable(),
  clientId: zId.nullable(),
  goalId: zId.nullable(),
});
export type TransactionInput = z.infer<typeof transactionInput>;
export const createTransactionInput = z.object({ ...withTenant, transaction: transactionInput });
export const updateTransactionInput = z.object({ ...withTenant, transactionId: zId, transaction: transactionInput, expectedVersion: z.number().int().min(1) });
export const voidTransactionInput = z.object({ ...withTenant, transactionId: zId, reason: requiredText(300) });

export const debtInput = z.object({
  direction: z.enum(['lent', 'borrowed']),
  counterparty: requiredText(120),
  principalMinor: zMinorPositive,
  currency: zCurrency,
  date: zIsoDate,
  dueDate: zIsoDate.nullable(),
  notes: text(2000),
  /** Account the money left (lent) or arrived in (borrowed). null = not tracked in an account. */
  accountId: zId.nullable(),
});
export const createDebtInput = z.object({ ...withTenant, debt: debtInput });
export const updateDebtInput = z.object({
  ...withTenant,
  debtId: zId,
  changes: debtInput.pick({ counterparty: true, dueDate: true, notes: true }).partial(),
});
export const recordRepaymentInput = z.object({
  ...withTenant,
  debtId: zId,
  amountMinor: zMinorPositive,
  date: zIsoDate,
  accountId: zId.nullable(),
  note: text(300),
});
export const voidDebtInput = z.object({ ...withTenant, debtId: zId, reason: requiredText(300) });

export const budgetInput = z.object({
  name: requiredText(80),
  categoryIds: z.array(zId).min(1).max(30),
  period: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('monthly') }),
    z.object({ kind: z.literal('custom'), start: zIsoDate, end: zIsoDate }),
  ]),
  amountMinor: zMinorNonNegative,
  currency: zCurrency,
  accountIds: z.array(zId).max(30),
});
export const saveBudgetInput = z.object({ ...withTenant, budgetId: zId.nullable(), budget: budgetInput });
export const deleteBudgetInput = z.object({ ...withTenant, budgetId: zId });

export const savingsGoalInput = z.object({
  name: requiredText(80),
  targetMinor: zMinorPositive,
  currency: zCurrency,
  targetDate: zIsoDate.nullable(),
  accountId: zId.nullable(),
});
export const saveSavingsGoalInput = z.object({
  ...withTenant,
  goalId: zId.nullable(),
  goal: savingsGoalInput,
  status: z.enum(['active', 'achieved', 'archived']).optional(),
});
export const savingsMovementInput = z.object({
  ...withTenant,
  goalId: zId,
  kind: z.enum(['deposit', 'withdrawal']),
  amountMinor: zMinorPositive,
  date: zIsoDate,
  note: text(300),
  /** When set (deposits), also records a transfer from this account into the goal's account. */
  fromAccountId: zId.nullable(),
});

export const invoiceLineInput = z.object({
  description: requiredText(300),
  quantityMilli: z.number().int().min(1).max(1_000_000_000),
  unitPriceMinor: zMinorNonNegative,
});
export const invoiceInput = z.object({
  clientId: zId,
  issueDate: zIsoDate,
  dueDate: zIsoDate.nullable(),
  currency: zCurrency,
  lines: z.array(invoiceLineInput).min(1).max(100),
  discountMinor: zMinorNonNegative,
  taxRateBps: z.number().int().min(0).max(10_000),
  notes: text(2000),
  projectId: zId.nullable(),
});
export const saveInvoiceInput = z.object({ ...withTenant, invoiceId: zId.nullable(), invoice: invoiceInput });
export const invoiceActionInput = z.object({ ...withTenant, invoiceId: zId, reason: text(300).optional() });
export const recordInvoicePaymentInput = z.object({
  ...withTenant,
  invoiceId: zId,
  amountMinor: zMinorPositive,
  date: zIsoDate,
  accountId: zId,
  method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other']),
  reference: text(120),
  paymentNoticeId: zId.nullable(),
});
export const createPortalLinkInput = z.object({ ...withTenant, clientId: zId, expiresInDays: z.number().int().min(1).max(365) });
export const revokePortalLinksInput = z.object({ ...withTenant, clientId: zId });
export const portalTokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const portalPaymentNoticeInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  invoiceId: zId,
  amountMinor: zMinorPositive,
  method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other']),
  reference: requiredText(120),
  paidOn: zIsoDate,
  requestId: zId,
});
export const reviewPaymentNoticeInput = z.object({ ...withTenant, noticeId: zId, decision: z.enum(['approve', 'reject']), accountId: zId.nullable(), reason: text(300) });
export const reconcileInput = z.object({ ...withTenant, fix: z.boolean() });
export const migrateLegacyInput = z.object({ ...withTenant, dryRun: z.boolean() });
