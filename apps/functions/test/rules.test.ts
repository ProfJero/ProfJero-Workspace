import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
const root = resolve(__dirname, '../../..');

const A = 'tenantA';
const B = 'tenantB';

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const member = (t: string, uid: string, role: string, status = 'active') =>
      setDoc(doc(db, `tenants/${t}/members/${uid}`), { uid, tenantId: t, role, status, email: `${uid}@x.com` });
    await setDoc(doc(db, `tenants/${A}`), { name: 'A', currency: 'GHS' });
    await setDoc(doc(db, `tenants/${B}`), { name: 'B', currency: 'GHS' });
    await member(A, 'alice', 'owner');
    await member(A, 'vic', 'viewer');
    await member(A, 'mary', 'member');
    await member(A, 'manny', 'manager');
    await member(A, 'rob', 'member', 'removed');
    await member(B, 'bob', 'owner');
    await setDoc(doc(db, `tenants/${A}/tasks/t1`), task('alice'));
    await setDoc(doc(db, `tenants/${B}/tasks/secret`), task('bob'));
    await setDoc(doc(db, `tenants/${A}/transactions/x1`), { type: 'income', amountMinor: 100 });
    await setDoc(doc(db, `tenants/${A}/accounts/acc1`), { name: 'MoMo', balanceMinor: 100 });
    await setDoc(doc(db, `tenants/${A}/invitations/inv1`), { email: 'newbie@x.com', role: 'member', status: 'pending' });
    await setDoc(doc(db, `passwords/legacy1`), { userId: 'alice', password: 'plain' });
  });
}

function task(uid: string, extra: Record<string, unknown> = {}) {
  return {
    title: 'Write report', description: '', status: 'todo', priority: 'medium', dueDate: null, dueTime: null,
    projectId: null, goalId: null, assigneeId: null, labels: [], recurrence: null, completedOn: null,
    createdBy: uid, createdAt: serverTimestamp(), updatedBy: uid, updatedAt: serverTimestamp(), ...extra,
  };
}

const as = (uid: string, token: Record<string, unknown> = {}) => env.authenticatedContext(uid, { email: `${uid}@x.com`, ...token }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-profjero',
    firestore: { rules: readFileSync(resolve(root, 'firebase/firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(resolve(root, 'firebase/storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});
afterAll(async () => env?.cleanup());

describe('tenant isolation', () => {
  it('a member of tenant A cannot read tenant B data', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), `tenants/${A}/tasks/t1`)));
    await assertFails(getDoc(doc(as('alice'), `tenants/${B}/tasks/secret`)));
    await assertFails(getDocs(collection(as('alice'), `tenants/${B}/tasks`)));
    await assertFails(getDoc(doc(as('alice'), `tenants/${B}`)));
  });
  it('cannot write into another tenant even with a forged createdBy', async () => {
    await assertFails(setDoc(doc(as('alice'), `tenants/${B}/tasks/evil`), task('alice')));
    await assertFails(setDoc(doc(as('alice'), `tenants/${B}/tasks/evil`), task('bob')));
    await assertFails(updateDoc(doc(as('alice'), `tenants/${B}/tasks/secret`), { title: 'pwned' }));
    await assertFails(deleteDoc(doc(as('alice'), `tenants/${B}/tasks/secret`)));
  });
  it('unauthenticated users can read nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `tenants/${A}/tasks/t1`)));
    await assertFails(getDoc(doc(anon, `tenants/${A}`)));
    await assertFails(getDocs(collection(anon, 'portalTokens')));
  });
  it('a removed member immediately loses access', async () => {
    await assertFails(getDoc(doc(as('rob'), `tenants/${A}/tasks/t1`)));
    await assertFails(setDoc(doc(as('rob'), `tenants/${A}/tasks/t9`), task('rob')));
  });
  it('legacy flat collections are closed except own plaintext vault cleanup', async () => {
    await assertFails(getDocs(collection(as('alice'), 'tasks')));
    await assertFails(getDocs(collection(as('alice'), 'invoices')));
    await assertSucceeds(getDoc(doc(as('alice'), 'passwords/legacy1')));
    await assertFails(getDoc(doc(as('bob'), 'passwords/legacy1')));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'passwords/legacy1')));
  });
});

describe('membership cannot be self-granted', () => {
  it('a user cannot create a membership for themselves', async () => {
    await assertFails(setDoc(doc(as('bob'), `tenants/${A}/members/bob`), { uid: 'bob', role: 'owner', status: 'active' }));
  });
  it('a member cannot raise their own role', async () => {
    await assertFails(updateDoc(doc(as('vic'), `tenants/${A}/members/vic`), { role: 'owner' }));
    await assertFails(updateDoc(doc(as('alice'), `tenants/${A}/members/vic`), { role: 'admin' })); // even owners go through functions
  });
  it('users can list only their own memberships', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as('alice'), 'members'), where('uid', '==', 'alice'))));
    await assertFails(getDocs(query(collectionGroup(as('alice'), 'members'), where('uid', '==', 'bob'))));
  });
  it('invitations are visible only to the verified invitee', async () => {
    const q = (db: ReturnType<typeof as>) => getDocs(query(collectionGroup(db, 'invitations'), where('email', '==', 'newbie@x.com')));
    await assertSucceeds(q(env.authenticatedContext('newbie', { email: 'newbie@x.com', email_verified: true }).firestore()));
    await assertFails(q(env.authenticatedContext('newbie', { email: 'newbie@x.com', email_verified: false }).firestore()));
    await assertFails(q(as('mallory', { email_verified: true })));
  });
  it('tenant settings cannot be written from the client', async () => {
    await assertFails(updateDoc(doc(as('alice'), `tenants/${A}`), { name: 'renamed' }));
  });
});

describe('role-based access', () => {
  it('viewers can read but not write', async () => {
    await assertSucceeds(getDoc(doc(as('vic'), `tenants/${A}/tasks/t1`)));
    await assertFails(setDoc(doc(as('vic'), `tenants/${A}/tasks/v1`), task('vic')));
    await assertFails(deleteDoc(doc(as('vic'), `tenants/${A}/tasks/t1`)));
  });
  it('members can write and delete only what they created', async () => {
    await assertSucceeds(setDoc(doc(as('mary'), `tenants/${A}/tasks/m1`), task('mary')));
    await assertSucceeds(deleteDoc(doc(as('mary'), `tenants/${A}/tasks/m1`)));
    await assertFails(deleteDoc(doc(as('mary'), `tenants/${A}/tasks/t1`)));
    await assertSucceeds(deleteDoc(doc(as('manny'), `tenants/${A}/tasks/t1`)));
  });
  it('members and viewers have no finance access; managers read only', async () => {
    await assertFails(getDocs(collection(as('mary'), `tenants/${A}/transactions`)));
    await assertFails(getDocs(collection(as('vic'), `tenants/${A}/accounts`)));
    await assertSucceeds(getDocs(collection(as('manny'), `tenants/${A}/transactions`)));
  });
  it('no one can write finance records directly — not even the owner', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, `tenants/${A}/transactions/forged`), { type: 'income', amountMinor: 1_000_000 }));
    await assertFails(updateDoc(doc(db, `tenants/${A}/accounts/acc1`), { balanceMinor: 999_999_999 }));
    await assertFails(deleteDoc(doc(db, `tenants/${A}/transactions/x1`)));
  });
  it('members cannot read the audit log or invitations', async () => {
    await assertFails(getDocs(collection(as('mary'), `tenants/${A}/auditLogs`)));
    await assertFails(getDocs(collection(as('mary'), `tenants/${A}/invitations`)));
    await assertSucceeds(getDocs(collection(as('alice'), `tenants/${A}/auditLogs`)));
  });
});

describe('document validation', () => {
  it('rejects unknown fields, wrong types and oversize values', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v1`), { ...task('alice'), isAdmin: true }));
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v2`), task('alice', { status: 'whatever' })));
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v3`), task('alice', { title: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v4`), task('alice', { dueDate: '05/10/2026' })));
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v5`), task('alice', { labels: 'not-a-list' })));
    const { title: _omit, ...missing } = task('alice');
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/v6`), missing));
  });
  it('enforces server-managed metadata', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/m1`), task('alice', { createdBy: 'bob' })));
    await assertFails(setDoc(doc(db, `tenants/${A}/tasks/m2`), task('alice', { createdAt: new Date('2020-01-01') })));
    await assertSucceeds(setDoc(doc(db, `tenants/${A}/tasks/m3`), task('alice')));
    await assertFails(updateDoc(doc(db, `tenants/${A}/tasks/m3`), { title: 'x', createdBy: 'mary', updatedBy: 'alice', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, `tenants/${A}/tasks/m3`), { title: 'x', updatedBy: 'alice', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('mary'), `tenants/${A}/tasks/m3`), { title: 'y', updatedBy: 'alice', updatedAt: serverTimestamp() }));
  });
  it('documents must point at their own storage path', async () => {
    const db = as('alice');
    const meta = (path: string) => ({
      title: 'Notes', fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 10, storagePath: path, textPath: null,
      pageCount: 0, wordCount: 0, status: 'uploaded', courseId: null, position: { page: 1, paragraph: 0 },
      createdBy: 'alice', createdAt: serverTimestamp(), updatedBy: 'alice', updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db, `tenants/${A}/documents/d1`), meta(`tenants/${A}/documents/d1/source.pdf`)));
    await assertFails(setDoc(doc(db, `tenants/${A}/documents/d2`), meta(`tenants/${B}/documents/x/source.pdf`)));
  });
});

describe('user-private data', () => {
  it('only the owner reads their profile and vault', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), {
      displayName: 'Alice', defaultTenantId: null, theme: 'system', email: 'alice@x.com', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(as('bob'), 'users/alice')));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/vault/i1'), { password: 'plaintext', kind: 'login' }));
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/vault/i1'), { ciphertext: 'abc', iv: 'def', kind: 'login', version: 1, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/vault/i1')));
  });
  it('profile email must match the signed-in identity', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), {
      displayName: 'Alice', defaultTenantId: null, theme: 'system', email: 'someone-else@x.com', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
});

describe('storage', () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  it('members upload allowed types into their tenant only', async () => {
    const s = env.authenticatedContext('mary').storage();
    await assertSucceeds(uploadBytes(ref(s, `tenants/${A}/documents/d1/source.pdf`), pdf, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(s, `tenants/${B}/documents/d1/source.pdf`), pdf, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(s, `tenants/${A}/documents/d1/evil.html`), pdf, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(s, `tenants/${A}/documents/d1/source.pdf`), pdf, { contentType: 'application/x-msdownload' }));
  });
  it('viewers read but cannot upload; outsiders cannot read', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `tenants/${A}/documents/d2/source.pdf`), pdf, { contentType: 'application/pdf' });
    });
    await assertSucceeds(getBytes(ref(env.authenticatedContext('vic').storage(), `tenants/${A}/documents/d2/source.pdf`)));
    await assertFails(uploadBytes(ref(env.authenticatedContext('vic').storage(), `tenants/${A}/documents/d3/source.pdf`), pdf, { contentType: 'application/pdf' }));
    await assertFails(getBytes(ref(env.authenticatedContext('bob').storage(), `tenants/${A}/documents/d2/source.pdf`)));
  });
});
