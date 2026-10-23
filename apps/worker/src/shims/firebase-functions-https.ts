/**
 * Worker stand-in for 'firebase-functions/v2/https'.
 *
 * onCall() returns a descriptor the Worker router invokes with an
 * already-verified identity (src/index.ts). HttpsError mirrors the Firebase
 * class so handlers can throw it unchanged.
 */
export type FunctionsErrorCode =
  | 'ok' | 'cancelled' | 'unknown' | 'invalid-argument' | 'deadline-exceeded' | 'not-found' | 'already-exists'
  | 'permission-denied' | 'resource-exhausted' | 'failed-precondition' | 'aborted' | 'out-of-range' | 'unimplemented'
  | 'internal' | 'unavailable' | 'data-loss' | 'unauthenticated';

const HTTP_STATUS: Record<FunctionsErrorCode, number> = {
  ok: 200, cancelled: 499, unknown: 500, 'invalid-argument': 400, 'deadline-exceeded': 504, 'not-found': 404,
  'already-exists': 409, 'permission-denied': 403, 'resource-exhausted': 429, 'failed-precondition': 400,
  aborted: 409, 'out-of-range': 400, unimplemented: 501, internal: 500, unavailable: 503, 'data-loss': 500, unauthenticated: 401,
};

export class HttpsError extends Error {
  readonly httpStatus: number;
  constructor(public readonly code: FunctionsErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'HttpsError';
    this.httpStatus = HTTP_STATUS[code] ?? 500;
  }
}

export interface AuthData {
  uid: string;
  token: Record<string, unknown> & { email?: string; email_verified?: boolean };
}

export interface CallableRequest<T = unknown> {
  data: T;
  auth?: AuthData;
  rawRequest: Request;
  acceptsStreaming: boolean;
}

export interface CallableFunction {
  readonly __workerCallable: true;
  run(req: CallableRequest): Promise<unknown>;
}

export function onCall(optsOrHandler: unknown, maybeHandler?: (req: CallableRequest) => unknown): CallableFunction {
  const handler = (typeof optsOrHandler === 'function' ? optsOrHandler : maybeHandler) as (req: CallableRequest) => unknown;
  return { __workerCallable: true, run: async (req) => handler(req) };
}

export function isCallable(v: unknown): v is CallableFunction {
  return typeof v === 'object' && v !== null && (v as CallableFunction).__workerCallable === true;
}
