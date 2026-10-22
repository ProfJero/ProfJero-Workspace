import type { ErrorReason } from '@profjero/shared';

/**
 * Maps a shared ErrorReason to the Firebase Functions code and HTTP status.
 * The `code` is what `toUserError()` reads on the client when `details.reason`
 * is somehow absent; the reason itself drives the primary mapping path.
 */
const REASON_TO_CODE: Record<ErrorReason, { code: string; http: number }> = {
  not_authenticated:    { code: 'unauthenticated',    http: 401 },
  not_member:           { code: 'permission-denied',  http: 403 },
  forbidden:            { code: 'permission-denied',  http: 403 },
  not_found:            { code: 'not-found',          http: 404 },
  invalid_input:        { code: 'invalid-argument',   http: 400 },
  conflict:             { code: 'failed-precondition', http: 409 },
  insufficient_balance: { code: 'failed-precondition', http: 409 },
  already_exists:       { code: 'already-exists',     http: 409 },
  limit_reached:        { code: 'resource-exhausted', http: 429 },
  link_invalid:         { code: 'not-found',          http: 404 },
  email_unverified:     { code: 'failed-precondition', http: 400 },
  unavailable:          { code: 'unavailable',        http: 503 },
  internal:             { code: 'internal',           http: 500 },
};

export class ApiError extends Error {
  constructor(
    public reason: ErrorReason,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorToResponse(err: unknown): { http: number; body: unknown } {
  if (err instanceof ApiError) {
    const { code, http } = REASON_TO_CODE[err.reason];
    return {
      http,
      body: {
        error: {
          code,
          message: err.message,
          details: {
            reason: err.reason,
            message: err.message,
            ...(err.fields ? { fields: err.fields } : {}),
          },
        },
      },
    };
  }
  console.error('Unhandled worker error', err);
  const { code, http } = REASON_TO_CODE.internal;
  const message = 'Something went wrong on our side. Please try again.';
  return {
    http,
    body: { error: { code, message, details: { reason: 'internal', message } } },
  };
}