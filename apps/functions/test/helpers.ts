import { randomUUID } from 'node:crypto';
import { initializeApp as initClient, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp as initAdmin, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

export const PROJECT = 'demo-profjero';
if (getAdminApps().length === 0) initAdmin({ projectId: PROJECT });
export const admin = { db: getAdminFirestore(), auth: getAdminAuth() };

const apps: FirebaseApp[] = [];

export interface TestUser {
  uid: string;
  email: string;
  call: <T = Record<string, unknown>>(name: string, data: unknown) => Promise<T>;
  refreshToken: () => Promise<void>;
}

export async function createUser(label: string): Promise<TestUser> {
  const app = initClient({ apiKey: 'fake-api-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `${label}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const email = `${label}-${randomUUID().slice(0, 8)}@example.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, 'correct-horse-battery');
  return {
    uid: cred.user.uid,
    email,
    call: async <T>(name: string, data: unknown) => (await httpsCallable(fns, name)(data)).data as T,
    refreshToken: async () => {
      await cred.user.getIdToken(true);
    },
  };
}

export async function cleanupApps() {
  await Promise.all(apps.map((a) => deleteApp(a)));
}

export const rid = () => randomUUID();

/** Resolves to the error's `details.reason` (or code) so tests can assert on the failure category. */
export async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { details?: { reason?: string }; code?: string };
    return err.details?.reason ?? err.code ?? 'unknown';
  }
  throw new Error('Expected the call to fail, but it succeeded');
}

export async function newTenant(owner: TestUser, name = 'Test Workspace'): Promise<string> {
  const { tenantId } = await owner.call<{ tenantId: string }>('createTenant', {
    name, kind: 'business', currency: 'GHS', timezone: 'Africa/Accra', requestId: rid(),
  });
  return tenantId;
}

/** Adds a member directly (bypassing invitations) for tests that are not about invitations. */
export async function addMember(tenantId: string, user: TestUser, role: string) {
  await admin.db.doc(`tenants/${tenantId}/members/${user.uid}`).set({ uid: user.uid, tenantId, email: user.email, role, status: 'active' });
}

export async function account(owner: TestUser, tenantId: string, name: string, openingBalanceMinor: number, type = 'bank') {
  const { accountId } = await owner.call<{ accountId: string }>('createAccount', {
    tenantId, requestId: rid(), account: { name, type, currency: 'GHS', openingBalanceMinor },
  });
  return accountId;
}

export async function balance(tenantId: string, accountId: string): Promise<number> {
  return (await admin.db.doc(`tenants/${tenantId}/accounts/${accountId}`).get()).data()!.balanceMinor;
}

export function txInput(p: Record<string, unknown>) {
  return {
    toAccountId: null, categoryId: null, nature: null, adjustmentDirection: null, description: '', payee: null,
    reference: null, refundOfId: null, projectId: null, clientId: null, goalId: null, date: '2026-10-01', ...p,
  };
}
