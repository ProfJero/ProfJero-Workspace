import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type QueryConstraint,
  type Timestamp,
} from 'firebase/firestore';
import {
  CLIENT_COLLECTIONS,
  toUserError,
  type ClientCollectionName,
  type FUNCTION_COLLECTIONS,
} from '@profjero/shared';
import type { z } from 'zod';
import { auth, db } from './firebase';
import { useLive, type LiveResult } from './live';
import { toast } from './toast';

export type Meta = { id: string; createdBy: string; updatedBy?: string; createdAt?: Timestamp; updatedAt?: Timestamp };
export type WithMeta<T> = T & Meta;

type CollectionName = ClientCollectionName | keyof typeof FUNCTION_COLLECTIONS | 'savingsContributions';

export const tenantCollection = (tenantId: string, name: CollectionName) => collection(db, 'tenants', tenantId, name);
export const tenantDoc = (tenantId: string, name: CollectionName, id: string) => doc(db, 'tenants', tenantId, name, id);

/** Live list of a tenant collection. Constraints must be described in `keyParts` too. */
export function useTenantCollection<T>(
  tenantId: string | null,
  name: CollectionName,
  keyParts: readonly unknown[] = [],
  constraints: QueryConstraint[] = [],
): LiveResult<WithMeta<T>[]> {
  return useLive<WithMeta<T>[]>(tenantId ? ['col', tenantId, name, ...keyParts] : null, () =>
    tenantId ? query(tenantCollection(tenantId, name), ...constraints) : null,
  );
}

export function useTenantDoc<T>(tenantId: string | null, name: CollectionName, id: string | null): LiveResult<WithMeta<T> | null> {
  return useLive<WithMeta<T> | null>(tenantId && id ? ['doc', tenantId, name, id] : null, () =>
    tenantId && id ? tenantDoc(tenantId, name, id) : null,
  );
}

const schemaFor = (name: ClientCollectionName) => CLIENT_COLLECTIONS.find((c) => c.name === name)!.schema as z.ZodObject;

function report(err: unknown) {
  toast(toUserError(err).message, 'error');
}

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error('Not signed in');
  return u;
}

/**
 * Workspace writes are validated with the same schema the security rules are
 * generated from, applied to the local cache immediately (works offline) and
 * synced in the background. A server rejection surfaces as a toast.
 */
export function createDoc<T extends Record<string, unknown>>(tenantId: string, name: ClientCollectionName, data: T): string {
  const parsed = schemaFor(name).parse(data);
  const ref = doc(tenantCollection(tenantId, name));
  const me = uid();
  void setDoc(ref, { ...parsed, createdBy: me, updatedBy: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(report);
  return ref.id;
}

/** Create with a caller-chosen id (for natural keys such as habitId_date). The caller must know the doc does not exist yet. */
export function createDocWithId<T extends Record<string, unknown>>(tenantId: string, name: ClientCollectionName, id: string, data: T): void {
  const parsed = schemaFor(name).parse(data);
  const me = uid();
  void setDoc(tenantDoc(tenantId, name, id), { ...parsed, createdBy: me, updatedBy: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(report);
}

export function updateDocFields<T extends Record<string, unknown>>(tenantId: string, name: ClientCollectionName, id: string, changes: Partial<T>): void {
  const parsed = schemaFor(name).partial().parse(changes);
  void updateDoc(tenantDoc(tenantId, name, id), { ...parsed, updatedBy: uid(), updatedAt: serverTimestamp() }).catch(report);
}

export function deleteDocument(tenantId: string, name: ClientCollectionName, id: string): void {
  void deleteDoc(tenantDoc(tenantId, name, id)).catch(report);
}
