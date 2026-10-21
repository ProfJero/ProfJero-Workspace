import type { Env } from './types';

type Json = Record<string, unknown>;
type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = { iss?: string; aud?: string; sub?: string; exp?: number; iat?: number; auth_time?: number; email?: string; email_verified?: boolean };

const encoder = new TextEncoder();
const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const encodeBase64Url = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const parseJwt = (part: string) => JSON.parse(new TextDecoder().decode(decodeBase64Url(part))) as Json;
const cache = new Map<string, { expiresAt: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>, ttlMs: number): Promise<T> {
  const item = cache.get(key);
  if (item && item.expiresAt > Date.now()) return item.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_token');
  const header = parseJwt(parts[0]!) as JwtHeader;
  const payload = parseJwt(parts[1]!) as JwtPayload;
  if (!header.kid || header.alg !== 'RS256') throw new Error('invalid_token');
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || payload.sub.length > 128) throw new Error('invalid_token');
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now || !payload.iat || payload.iat > now + 60) throw new Error('expired_token');
  const keys = await cached('firebase-public-keys', async () => {
    const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!response.ok) throw new Error('token_verification_unavailable');
    return await response.json() as Record<string, string>;
  }, 45 * 60 * 1000);
  const certificate = keys[header.kid];
  if (!certificate) throw new Error('invalid_token');
  const pem = certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  const der = decodeBase64Url(btoa(String.fromCharCode(...Uint8Array.from(atob(pem), c => c.charCodeAt(0)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'));
  const cert = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']).catch(async () => {
    // Certificates are X.509; extract SubjectPublicKeyInfo from DER instead of trusting JWT claims.
    return await importCertificatePublicKey(decodeBase64Url(encodeBase64Url(der)));
  });
  const signed = encoder.encode(`${parts[0]}.${parts[1]}`);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cert, decodeBase64Url(parts[2]!), signed)) throw new Error('invalid_token');
  return payload;
}

async function importCertificatePublicKey(_der: Uint8Array): Promise<CryptoKey> {
  // The X.509 certificate must be parsed to SPKI. Fail closed until a proper parser is available.
  throw new Error('certificate_parser_unavailable');
}

export async function getGoogleAccessToken(serviceAccountJson: string): Promise<{ token: string; expiresAt: number }> {
  return cached('google-access-token', async () => {
    const account = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string; token_uri?: string };
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = encodeBase64Url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: account.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const unsigned = `${header}.${claim}`;
    const pkcs8 = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', decodeBase64Url(encodeBase64Url(Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0)))), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
    const assertion = `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`;
    const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    if (!response.ok) throw new Error('google_auth_unavailable');
    const result = await response.json() as { access_token: string; expires_in: number };
    return { token: result.access_token, expiresAt: Date.now() + Math.max(60, result.expires_in - 120) * 1000 };
  }, 50 * 60 * 1000);
}

export async function firestoreRequest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured');
  const { token } = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents${path}`;
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`firestore_http_${response.status}:${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
