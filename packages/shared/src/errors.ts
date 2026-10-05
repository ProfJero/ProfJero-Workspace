/**
 * Error vocabulary shared by Cloud Functions and the UI. Functions throw
 * HttpsError(code, message, { reason }) with a `reason` from this list; the UI
 * maps reasons (and raw Firebase codes) to human messages. Raw backend error
 * text is never shown to users.
 */
export const ERROR_REASONS = {
  not_authenticated: 'Please sign in to continue.',
  not_member: "You don't have access to this workspace.",
  forbidden: "You don't have permission to perform this action.",
  not_found: 'That item no longer exists. It may have been deleted.',
  invalid_input: 'Some of the information entered is not valid.',
  conflict: 'This item was changed somewhere else. Reload it and try again.',
  insufficient_balance: 'The amount is larger than the balance available.',
  already_exists: 'That already exists.',
  limit_reached: 'Too many requests. Please wait a moment and try again.',
  link_invalid: 'This link is invalid or has expired. Ask the sender for a new one.',
  email_unverified: 'Verify your email address before accepting invitations.',
  unavailable: "We couldn't reach the server. Check your connection and try again.",
  internal: 'Something went wrong on our side. Please try again.',
} as const;

export type ErrorReason = keyof typeof ERROR_REASONS;

const FIREBASE_CODE_TO_REASON: Record<string, ErrorReason> = {
  'permission-denied': 'forbidden',
  'functions/permission-denied': 'forbidden',
  unauthenticated: 'not_authenticated',
  'functions/unauthenticated': 'not_authenticated',
  'not-found': 'not_found',
  'functions/not-found': 'not_found',
  'invalid-argument': 'invalid_input',
  'functions/invalid-argument': 'invalid_input',
  'failed-precondition': 'conflict',
  'functions/failed-precondition': 'conflict',
  aborted: 'conflict',
  'functions/aborted': 'conflict',
  'already-exists': 'already_exists',
  'functions/already-exists': 'already_exists',
  'resource-exhausted': 'limit_reached',
  'functions/resource-exhausted': 'limit_reached',
  unavailable: 'unavailable',
  'functions/unavailable': 'unavailable',
  'deadline-exceeded': 'unavailable',
  'functions/deadline-exceeded': 'unavailable',
};

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account already exists with this email. Sign in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "We couldn't reach the server. Check your connection.",
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/account-exists-with-different-credential': 'This email is registered with a different sign-in method.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
};

export interface UserFacingError {
  reason: ErrorReason | 'auth';
  message: string;
  /** Field-level messages for form validation errors. */
  fields?: Record<string, string>;
}

export function toUserError(err: unknown): UserFacingError {
  const e = err as { code?: string; details?: { reason?: string; message?: string; fields?: Record<string, string> } } | null;
  const code = e?.code ?? '';
  if (code.startsWith('auth/')) return { reason: 'auth', message: AUTH_MESSAGES[code] ?? 'Sign-in failed. Please try again.' };
  const detailReason = e?.details?.reason;
  if (detailReason && detailReason in ERROR_REASONS) {
    const reason = detailReason as ErrorReason;
    // Server-provided messages for these reasons are written for users (never raw exceptions).
    const message = e?.details?.message ?? ERROR_REASONS[reason];
    return { reason, message, ...(e?.details?.fields ? { fields: e.details.fields } : {}) };
  }
  const reason = FIREBASE_CODE_TO_REASON[code] ?? 'internal';
  return { reason, message: ERROR_REASONS[reason] };
}
