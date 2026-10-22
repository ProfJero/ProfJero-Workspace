import type { Env } from '../env';
import { ApiError } from '../errors';
import { getAccessToken } from './auth';
import { fromFsFields, toFsFields, type FsFields } from './codec';

const base = (env: Env) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function authHeaders(env: Env): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${await getAccessToken(env)}`,
    'Content-Type': 'application/json',
  };
}

export type DocPath = string;

export async function getDoc(
  env: Env,
  path: DocPath,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${base(env)}/${path}`, { headers: await authHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`Firestore GET ${path} failed`, res.status, await res.text());
    throw new ApiError('internal', 'Could not read data.');
  }
  const body = (await res.json()) as { fields?: FsFields };
  return fromFsFields(body.fields);
}

export interface BatchWrite {
  path: DocPath;
  fields: Record<string, unknown>;
  /** If true, this write fails if the document already exists (create precondition). */
  createOnly?: boolean;
  /** Field names to set to `REQUEST_TIME` (server timestamp). */
  serverTimestamps?: string[];
}

export interface BatchWriteResult {
  index: number;
  ok: boolean;
  /** Human-readable status message from Firestore, e.g. "ALREADY_EXISTS: …". Present only on failure. */
  status?: string;
}

/**
 * Atomic multi-document write. If any write fails, all are rolled back.
 * Returns one result per input write, in order.
 */
export async function batchWrite(env: Env, writes: BatchWrite[]): Promise<BatchWriteResult[]> {
  const payload = {
    writes: writes.map((w) => ({
      update: {
        name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${w.path}`,
        fields: toFsFields(w.fields),
      },
      ...(w.createOnly ? { currentDocument: { exists: false } } : {}),
      ...(w.serverTimestamps?.length
        ? {
            updateTransforms: w.serverTimestamps.map((f) => ({
              fieldPath: f,
              setToServerValue: 'REQUEST_TIME',
            })),
          }
        : {}),
    })),
  };

  const res = await fetch(`${base(env)}:batchWrite`, {
    method: 'POST',
    headers: await authHeaders(env),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('Firestore batchWrite failed', res.status, await res.text());
    throw new ApiError('internal', 'Could not save data.');
  }

  // BatchWriteResponse: writeResults and status are parallel arrays, one entry per write.
  const data = (await res.json()) as {
    writeResults?: unknown[];
    status?: { code?: number; message?: string }[];
  };

  const statuses = data.status ?? [];
  return writes.map((_, index) => {
    const s = statuses[index];
    if (!s || s.code === 0) return { index, ok: true };
    return { index, ok: false, status: s.message ?? 'UNKNOWN' };
  });
}