import type { Env } from './types';

type JwtHeader = { alg?: string; kid?: string };
export type FirebaseIdentity = { uid: string; email: string | null; emailVerified: boolean };
type JwtPayload = { iss?: string; aud?: string; sub?: string; exp?: number; iat?: number; auth_time?: number; email?: string; email_verified?: boolean };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const cache = new Map<string, { expiresAt: number; value: unknown }>();

function b64urlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function b64url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function parseJwt<T>(value: string): T { return JSON.parse(decoder.decode(b64urlBytes(value))) as T; }
async function cached<T>(key: string, load: () => Promise<T>, ttlMs: number): Promise<T> {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function readDer(data: Uint8Array, offset: number): { tag: number; start: number; end: number; next: number } {
  const tag = data[offset]!;
  let length = data[offset + 1]!;
  let cursor = offset + 2;
  if ((length & 0x80) !== 0) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new Error('invalid_certificate');
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | data[cursor++]!;
  }
  return { tag, start: cursor, end: cursor + length, next: cursor + length };
}
function certificateSpki(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  const der = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const outer = readDer(der, 0);
  const tbs = readDer(der, outer.start);
  let cursor = tbs.start;
  if (der[cursor] === 0xa0) cursor = readDer(der, cursor).next;
  // serial, signature algorithm, issuer, validity, subject
  for (let i = 0; i < 5; i++) cursor = readDer(der, cursor).next;
  const spki = readDer(der, cursor);
  if (spki.tag !== 0x30) throw new Error('invalid_certificate');
  return der.slice(cursor, spki.next);
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<FirebaseIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_token');
  const header = parseJwt<JwtHeader>(parts[0]!);
  const payload = parseJwt<JwtPayload>(parts[1]!);
  if (!header.kid || header.alg !== 'RS256') throw new Error('invalid_token');
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || payload.sub.length > 128) throw new Error('invalid_token');
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now || !payload.iat || payload.iat > now + 60) throw new Error('expired_token');
  const keys = await cached('firebase-public-keys', async () => {
    const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!response.ok) throw new Error('token_verification_unavailable');
    return await response.json() as Record<string, string>;
  }, 45 * 60 * 1000);
  const pem = keys[header.kid];
  if (!pem) throw new Error('invalid_token');
  const key = await crypto.subtle.importKey('spki', certificateSpki(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]!), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('invalid_token');
  return { uid: payload.sub!, email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null, emailVerified: payload.email_verified === true };
}

export async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  return cached('google-access-token', async () => {
    const account = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string; token_uri?: string };
    const now = Math.floor(Date.now() / 1000);
    const audience = account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: audience, iat: now, exp: now + 3600 }))}`;
    const pkcs8 = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
    const response = await fetch(audience, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(new Uint8Array(signature))}` }) });
    if (!response.ok) throw new Error('google_auth_unavailable');
    const result = await response.json() as { access_token: string; expires_in: number };
    return result.access_token;
  }, 50 * 60 * 1000);
}

export async function firestoreRequest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured');
  const token = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents${path}`;
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`firestore_http_${response.status}:${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
