import { importPKCS8, SignJWT } from 'jose';
import type { Env } from '../env';
import { ApiError } from '../errors';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cache: { token: string; expiresAt: number } | null = null;

/** Exchanges the service-account JSON for a short-lived OAuth token (datastore scope). */
export async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cache && cache.expiresAt > now + 60) return cache.token;

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  } catch {
    throw new ApiError('internal', 'Worker is misconfigured.');
  }

  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    console.error('OAuth exchange failed', res.status, await res.text());
    throw new ApiError('internal', 'Worker is misconfigured.');
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}