import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../env';
import { HttpsError } from '../shims/firebase-functions-https';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);
const APPCHECK_JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));

export interface Caller {
  uid: string;
  token: Record<string, unknown> & { email?: string; email_verified?: boolean };
}

/** Emulator shortcuts are only ever honoured outside production. */
export function usingEmulators(env: Env): boolean {
  const configured = !!(env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST);
  if (configured && env.APP_ENV === 'production') {
    throw new HttpsError('internal', 'Server is misconfigured.', { reason: 'internal', message: 'Something went wrong on our side. Please try again.' });
  }
  return configured;
}

const unauthenticated = (message: string) => new HttpsError('unauthenticated', message, { reason: 'not_authenticated', message });

/**
 * Verifies a Firebase ID token: signature (Google JWKS), issuer, audience,
 * expiry and subject. Identity comes only from the verified token — never
 * from the request body.
 */
export async function verifyFirebaseToken(authorization: string, env: Env): Promise<Caller> {
  if (!authorization.startsWith('Bearer ')) throw unauthenticated('Please sign in to continue.');
  const jwt = authorization.slice(7).trim();
  let payload: JWTPayload;
  try {
    if (usingEmulators(env) && env.FIREBASE_AUTH_EMULATOR_HOST) {
      // Emulator tokens are unsigned; check the claims we can.
      payload = decodeJwt(jwt);
      if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('bad claims');
      if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('expired');
    } else {
      ({ payload } = await jwtVerify(jwt, FIREBASE_JWKS, {
        issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
        audience: env.FIREBASE_PROJECT_ID,
        algorithms: ['RS256'],
      }));
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw unauthenticated('Please sign in to continue.');
  }
  const token = payload as Caller['token'];
  return {
    uid: payload.sub,
    token: {
      ...token,
      email: typeof token.email === 'string' ? token.email : undefined,
      email_verified: token.email_verified === true,
    },
  };
}

/**
 * Optional Firebase App Check enforcement. When APPCHECK_PROJECT_NUMBER is set,
 * every request must carry a valid X-Firebase-AppCheck token for this project.
 */
export async function verifyAppCheck(header: string | null, env: Env): Promise<void> {
  if (!env.APPCHECK_PROJECT_NUMBER) return;
  const fail = () => new HttpsError('unauthenticated', 'This app could not be verified. Reload the page and try again.', { reason: 'not_authenticated', message: 'This app could not be verified. Reload the page and try again.' });
  if (!header) throw fail();
  try {
    const { payload } = await jwtVerify(header, APPCHECK_JWKS, {
      issuer: `https://firebaseappcheck.googleapis.com/${env.APPCHECK_PROJECT_NUMBER}`,
      algorithms: ['RS256'],
    });
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(`projects/${env.APPCHECK_PROJECT_NUMBER}`)) throw new Error('audience');
  } catch {
    throw fail();
  }
}
