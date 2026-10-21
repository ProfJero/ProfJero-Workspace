import { firestoreRequest, verifyFirebaseIdToken, type FirebaseIdentity } from './firebase';
import type { Env } from './types';

function json(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
function fieldsToObject(fields: Record<string, { stringValue?: string; booleanValue?: boolean; integerValue?: string; nullValue?: null; mapValue?: { fields?: Record<string, unknown> } }> = {}) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in value) result[key] = value.stringValue;
    else if ('booleanValue' in value) result[key] = value.booleanValue;
    else if ('integerValue' in value) result[key] = Number(value.integerValue);
    else if ('nullValue' in value) result[key] = null;
    else if ('mapValue' in value) result[key] = fieldsToObject(value.mapValue?.fields as Record<string, { stringValue?: string; booleanValue?: boolean; integerValue?: string; nullValue?: null; mapValue?: { fields?: Record<string, unknown> } }> ?? {});
  }
  return result;
}
async function authenticate(request: Request, env: Env): Promise<FirebaseIdentity> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }), { status: 401 });
  try {
    return await verifyFirebaseIdToken(authorization.slice(7), env.FIREBASE_PROJECT_ID);
  } catch {
    throw new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Your session is invalid or expired. Sign in again.' } }), { status: 401 });
  }
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
      'vary': 'Origin',
    });
    if (origin === env.WEB_ORIGIN) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-Firebase-AppCheck, X-Request-Id');
      headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('access-control-max-age', '600');
    }
    if (origin && origin !== env.WEB_ORIGIN) return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' }, requestId }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'ProfJero Workspace API', environment: env.APP_ENV, timestamp: new Date().toISOString(), requestId }, 200, headers);
    }
    try {
      if (url.pathname === '/v1/auth/me' && request.method === 'GET') {
        const identity = await authenticate(request, env);
        return json({ user: { uid: identity.uid, email: identity.email, emailVerified: identity.emailVerified } }, 200, headers);
      }
      const membershipMatch = url.pathname.match(/^\/v1\/tenants\/([A-Za-z0-9_-]{1,128})\/membership$/);
      if (membershipMatch && request.method === 'GET') {
        const identity = await authenticate(request, env);
        const tenantId = membershipMatch[1]!;
        const path = `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(identity.uid)}`;
        try {
          const document = await firestoreRequest<{ fields?: Record<string, never>; name?: string }>(env, path);
          const membership = fieldsToObject(document.fields as never);
          if (membership.status !== 'active' || typeof membership.role !== 'string') {
            return json({ error: { code: 'NOT_A_MEMBER', message: 'You do not have active access to this workspace.' }, requestId }, 403, headers);
          }
          return json({ membership: { tenantId, uid: identity.uid, role: membership.role, status: membership.status } }, 200, headers);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('firestore_http_404')) {
            return json({ error: { code: 'NOT_A_MEMBER', message: 'You do not have access to this workspace.' }, requestId }, 403, headers);
          }
          throw error;
        }
      }
      // Never pretend an unported mutation succeeded. Each legacy callable must be
      // ported with its original schema, role checks, transaction, idempotency and audit log.
      if (url.pathname.startsWith('/v1/')) {
        return json({ error: { code: 'NOT_IMPLEMENTED', message: 'This operation has not yet been migrated to the Worker API.' }, requestId }, 501, headers);
      }
      return json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId }, 404, headers);
    } catch (error) {
      if (error instanceof Response) return json(await error.json().catch(() => ({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } })), error.status, headers);
      // Do not expose database/provider internals to clients.
      console.error('Workspace API request failed', { requestId, error: error instanceof Error ? error.message : String(error) });
      return json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.', requestId } }, 500, headers);
    }
  },
};
