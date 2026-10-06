import { useMemo, useSyncExternalStore } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';
import { toUserError } from '@profjero/shared';

/**
 * Live Firestore reads shared across components.
 *
 * Each distinct query (by key) has at most one onSnapshot listener no matter
 * how many components use it. Listeners stay alive for 30 s after the last
 * subscriber leaves so navigating between pages does not re-read data.
 */

type Source = Query | DocumentReference;
interface Entry {
  data: unknown;
  error: string | null;
  loaded: boolean;
  subscribers: Set<() => void>;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  snapshotVersion: number;
}

const registry = new Map<string, Entry>();
const RELEASE_DELAY_MS = 30_000;

function entryFor(key: string): Entry {
  let e = registry.get(key);
  if (!e) {
    e = { data: undefined, error: null, loaded: false, subscribers: new Set(), unsubscribe: null, releaseTimer: null, snapshotVersion: 0 };
    registry.set(key, e);
  }
  return e;
}

function start(key: string, source: Source) {
  const e = entryFor(key);
  if (e.unsubscribe) return;
  const notify = () => {
    e.snapshotVersion += 1;
    e.subscribers.forEach((fn) => fn());
  };
  const onError = (err: unknown) => {
    e.error = toUserError(err).message;
    e.loaded = true;
    e.unsubscribe = null;
    notify();
  };
  if (source.type !== 'document') {
    e.unsubscribe = onSnapshot(
      source as Query,
      (snap) => {
        e.data = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        e.error = null;
        e.loaded = true;
        notify();
      },
      onError,
    );
  } else {
    e.unsubscribe = onSnapshot(
      source as DocumentReference,
      (snap) => {
        e.data = snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null;
        e.error = null;
        e.loaded = true;
        notify();
      },
      onError,
    );
  }
}

function subscribe(key: string, source: Source | null, callback: () => void) {
  const e = entryFor(key);
  e.subscribers.add(callback);
  if (e.releaseTimer) {
    clearTimeout(e.releaseTimer);
    e.releaseTimer = null;
  }
  if (source) start(key, source);
  return () => {
    e.subscribers.delete(callback);
    if (e.subscribers.size === 0) {
      e.releaseTimer = setTimeout(() => {
        e.unsubscribe?.();
        registry.delete(key);
      }, RELEASE_DELAY_MS);
    }
  };
}

export interface LiveResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

const snapshots = new Map<string, { version: number; value: LiveResult<unknown> }>();

function read<T>(key: string): LiveResult<T> {
  const e = registry.get(key);
  const version = e?.snapshotVersion ?? -1;
  const cached = snapshots.get(key);
  if (cached && cached.version === version) return cached.value as LiveResult<T>;
  const value: LiveResult<unknown> = { data: e?.data, loading: !e?.loaded, error: e?.error ?? null };
  snapshots.set(key, { version, value });
  return value as LiveResult<T>;
}

/**
 * Subscribe to a query or document. `key` must uniquely describe the source
 * (include the tenant id and every filter). Pass `null` to disable.
 */
export function useLive<T>(key: readonly unknown[] | null, build: () => Source | null): LiveResult<T> {
  const k = key ? JSON.stringify(key) : 'disabled';
  // The key fully describes the source, so rebuilding only when it changes is correct.
  const source = useMemo(() => (key ? build() : null), [k]);
  const result = useSyncExternalStore(
    (cb) => (key ? subscribe(k, source, cb) : () => undefined),
    () => (key ? read<T>(k) : DISABLED),
    () => DISABLED,
  );
  return result as LiveResult<T>;
}

const DISABLED: LiveResult<never> = { data: undefined, loading: false, error: null };

/** Drop every cached listener (sign-out). */
export function resetLiveCache() {
  for (const e of registry.values()) e.unsubscribe?.();
  registry.clear();
  snapshots.clear();
}
