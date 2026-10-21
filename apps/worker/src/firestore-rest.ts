import type { Env } from './types';
import { getGoogleAccessToken } from './firebase';

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

type Document = { name: string; fields?: Record<string, FirestoreValue>; createTime?: string; updateTime?: string };
type Write = { update?: { name: string; fields: Record<string, FirestoreValue> }; updateMask?: { fieldPaths: string[] }; currentDocument?: { exists: boolean }; updateTransforms?: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[]; delete?: string };

const encodeValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (item !== undefined) fields[key] = encodeValue(item);
    return { mapValue: { fields } };
  }
  throw new Error('unsupported_firestore_value');
};

const decodeValue = (value: FirestoreValue): unknown => {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, decodeValue(v)]));
  return null;
};

export function decodeDocument(document: Document | null): Record<string, unknown> | null {
  if (!document) return null;
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

export function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value)]));
}

export function documentPath(env: Env, path: string): string {
  return `projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path.replace(/^\/+/, '')}`;
}

async function request<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured');
  const token = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`firestore_http_${response.status}:${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : {}) as T;
}

export async function getDocument(env: Env, path: string, transaction?: string): Promise<Document | null> {
  const suffix = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
  try {
    return await request<Document>(env, `${documentPath(env, path)}${suffix}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('firestore_http_404')) return null;
    throw error;
  }
}

export async function beginTransaction(env: Env): Promise<string> {
  const result = await request<{ transaction: string }>(env, `${documentPath(env, '').replace(/\\/$/, '')}:beginTransaction`, {
    method: 'POST', body: JSON.stringify({ options: { readWrite: {} } }),
  });
  return result.transaction;
}

export async function commitWrites(env: Env, writes: Write[], transaction?: string): Promise<void> {
  await request(env, `${documentPath(env, '').replace(/\\/$/, '')}:commit`, {
    method: 'POST',
    body: JSON.stringify({ writes, ...(transaction ? { transaction } : {}) }),
  });
}

export async function queryCollection(env: Env, collectionPath: string, field: string, value: unknown, transaction?: string): Promise<Document[]> {
  const parentPath = collectionPath.split('/').slice(0, -1).join('/');
  const collectionId = collectionPath.split('/').at(-1)!;
  const structuredQuery = {
    from: [{ collectionId }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } },
  };
  const result = await request<({ document?: Document }[])>(
    env,
    `${documentPath(env, '').replace(/\\/$/, '')}:runQuery`,
    { method: 'POST', body: JSON.stringify({ parent: documentPath(env, parentPath), structuredQuery, ...(transaction ? { transaction } : {}) }) },
  );
  return result.flatMap(item => item.document ? [item.document] : []);
}

export function updateWrite(env: Env, path: string, data: Record<string, unknown>, createOnly = false): Write {
  const full = documentPath(env, path);
  const fields = encodeFields(data);
  return {
    update: { name: full, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    ...(createOnly ? { currentDocument: { exists: false } } : {}),
  };
}

export function deleteWrite(env: Env, path: string): Write {
  return { delete: documentPath(env, path) };
}

export const serverTimestampTransform = (fieldPath: string) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' as const });
