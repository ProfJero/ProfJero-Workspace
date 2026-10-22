import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from '../errors';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export interface Caller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

/** Verifies a Firebase ID token. `uid` and `email` come from the verified token, never the request body. */
export async function verifyFirebaseToken(
  authorization: string | null,
  projectId: string,
): Promise<Caller> {
  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError('not_authenticated', 'Please sign in to continue.');
  }
  try {
    const { payload } = await jwtVerify(authorization.slice(7), JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length < 1) {
      throw new ApiError('not_authenticated', 'Please sign in to continue.');
    }
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
    };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('not_authenticated', 'Session expired. Please sign in again.');
  }
}