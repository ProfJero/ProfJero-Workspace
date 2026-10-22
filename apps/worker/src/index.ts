/**
 * ProfJero Workspace API (Cloudflare Worker).
 *
 * POST /<operation>  — one route per server operation, e.g. /createTransaction.
 * The handlers are the same code as apps/functions/src (imported through
 * callables.ts); firebase-admin / firebase-functions are replaced by the shims
 * in src/shims via wrangler [alias]. Every handler verifies identity, tenant
 * membership, permission and input itself — the router only authenticates the
 * caller and transports the request.
 */
import * as callables from '../../functions/src/callables';
import type { Env } from './env';
import { usingEmulators, verifyAppCheck, verifyFirebaseToken } from './auth/firebase';
import { getAccessToken } from './firestore/auth';
import { configureFirestore } from './firestore/client';
import { HttpsError, isCallable, type CallableRequest } from './shims/firebase-functions-https';

const MAX_BODY_BYTES = 256 * 1024;
/** Operations callable without signing in (they authenticate with a portal token in the body). */
const PUBLIC_OPERATIONS = new Set(['portalGetInvoices', 'portalSubmitPaymentNotice']);

function allowedOrigins(env: Env): Set<string> {
  return new Set([...(env.WEB_ORIGINS ?? '').split(','), env.WEB_ORIGIN ?? ''].map((o) => o.trim()).filter(Boolean));
}

function errorBody(e: HttpsError) {
  return { error: { code: e.code, message: e.message, details: e.details ?? { reason: 'internal', message: e.message } } };
}

function log(severity: string, message: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ severity, message, ...data }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      vary: 'Origin',
    });
    // Exact-origin allow-list; arbitrary Origin values are never reflected.
    if (origin && allowedOrigins(env).has(origin)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
      headers.set('access-control-allow-methods', 'POST, GET, OPTIONS');
      headers.set('access-control-expose-headers', 'x-request-id');
      headers.set('access-control-max-age', '600');
    }
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(200, { ok: true, service: 'ProfJero Workspace API', environment: env.APP_ENV, requestId });
    }

    const operation = url.pathname.slice(1);
    const callable = Object.prototype.hasOwnProperty.call(callables, operation) ? (callables as Record<string, unknown>)[operation] : undefined;
    if (request.method !== 'POST' || !isCallable(callable)) {
      return json(404, { error: { code: 'not-found', message: 'Route not found', details: { reason: 'not_found', message: 'Route not found' } }, requestId });
    }

    const started = Date.now();
    let uid: string | null = null;
    try {
      // Firestore access: the emulator in development, the service account otherwise.
      const emulator = usingEmulators(env) && env.FIRESTORE_EMULATOR_HOST;
      configureFirestore({
        projectId: env.FIREBASE_PROJECT_ID,
        origin: emulator ? `http://${env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com',
        token: emulator ? async () => 'owner' : () => getAccessToken(env),
      });

      if (origin && !allowedOrigins(env).has(origin)) {
        throw new HttpsError('permission-denied', 'This site is not allowed to use the API.', { reason: 'forbidden', message: 'This site is not allowed to use the API.' });
      }
      await verifyAppCheck(request.headers.get('X-Firebase-AppCheck'), env);

      if (PUBLIC_OPERATIONS.has(operation) && env.PORTAL_RATE_LIMITER) {
        const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const { success } = await env.PORTAL_RATE_LIMITER.limit({ key: `${operation}:${key}` });
        if (!success) throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment and try again.', { reason: 'limit_reached', message: 'Too many requests. Please wait a moment and try again.' });
      }

      const declared = Number(request.headers.get('content-length') ?? '0');
      const text = declared > MAX_BODY_BYTES ? null : await request.text();
      if (text === null || text.length > MAX_BODY_BYTES) {
        throw new HttpsError('invalid-argument', 'The request is too large.', { reason: 'invalid_input', message: 'The request is too large.' });
      }
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new HttpsError('invalid-argument', 'The request is not valid JSON.', { reason: 'invalid_input', message: 'Some of the information entered is not valid.' });
      }

      const authorization = request.headers.get('Authorization');
      const caller = authorization ? await verifyFirebaseToken(authorization, env) : null;
      uid = caller?.uid ?? null;
      const req: CallableRequest = { data, rawRequest: request, acceptsStreaming: false, ...(caller ? { auth: caller } : {}) };
      const result = await callable.run(req);
      log('INFO', 'request', { requestId, operation, uid, status: 200, ms: Date.now() - started });
      return json(200, { result: result ?? null });
    } catch (err) {
      if (err instanceof HttpsError) {
        log(err.httpStatus >= 500 ? 'ERROR' : 'INFO', 'request', { requestId, operation, uid, status: err.httpStatus, code: err.code, ms: Date.now() - started });
        return json(err.httpStatus, errorBody(err));
      }
      log('ERROR', 'Unhandled error', { requestId, operation, uid, error: err instanceof Error ? err.stack : String(err) });
      return json(500, errorBody(new HttpsError('internal', 'Something went wrong on our side. Please try again.', { reason: 'internal', message: 'Something went wrong on our side. Please try again.' })));
    }
  },
};
