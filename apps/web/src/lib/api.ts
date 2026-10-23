import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toUserError, type UserFacingError } from '@profjero/shared';
import { getToken } from 'firebase/app-check';
import { appCheck, auth, functions } from './firebase';

/** Names of the server operations (apps/functions/src/callables.ts). */
export type FunctionName =
  | 'createTenant' | 'updateTenant' | 'inviteMember' | 'revokeInvitation' | 'acceptInvitation' | 'changeMemberRole'
  | 'removeMember' | 'transferOwnership'
  | 'createAccount' | 'updateAccount' | 'createTransaction' | 'updateTransaction' | 'voidTransaction'
  | 'createDebt' | 'updateDebt' | 'recordRepayment' | 'voidDebt'
  | 'saveBudget' | 'deleteBudget' | 'saveSavingsGoal' | 'recordSavingsMovement' | 'reconcileAccounts'
  | 'saveInvoice' | 'sendInvoice' | 'voidInvoice' | 'recordInvoicePayment' | 'createPortalLink' | 'revokePortalLinks'
  | 'reviewPaymentNotice' | 'portalGetInvoices' | 'portalSubmitPaymentNotice' | 'migrateLegacyData';

/**
 * Server operations run on the Cloudflare Worker (apps/worker) when
 * VITE_WORKER_URL is set, otherwise on Firebase Functions. Both run the same
 * handler code and speak the same error format.
 */
const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)?.replace(/\/+$/, '') || undefined;

function callError(code: string, details: { reason: string; message: string; fields?: Record<string, string> }): Error {
  return Object.assign(new Error(details.message), { code: `functions/${code}`, details });
}

async function callViaWorker<T>(name: FunctionName, data: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Signed-in calls carry the Firebase ID token; the public portal calls do not.
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (appCheck) {
    const { token } = await getToken(appCheck).catch(() => ({ token: '' }));
    if (token) headers['X-Firebase-AppCheck'] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/${name}`, { method: 'POST', headers, body: JSON.stringify(data ?? {}) });
  } catch {
    throw callError('unavailable', { reason: 'unavailable', message: "We couldn't reach the server. Check your connection and try again." });
  }
  const body = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: { code?: string; message?: string; details?: { reason?: string; message?: string; fields?: Record<string, string> } };
  };
  if (!res.ok || body.error) {
    // Same shape the Firebase Functions SDK throws, so toUserError() maps both identically.
    const d = body.error?.details;
    throw callError(body.error?.code ?? (res.status >= 500 ? 'internal' : 'unknown'), {
      reason: d?.reason ?? 'internal',
      message: d?.message ?? 'Something went wrong on our side. Please try again.',
      ...(d?.fields ? { fields: d.fields } : {}),
    });
  }
  return body.result as T;
}

export async function call<T = Record<string, unknown>>(name: FunctionName, data: unknown): Promise<T> {
  if (WORKER_URL) return callViaWorker<T>(name, data);
  const res = await httpsCallable(functions, name, { timeout: 60_000 })(data);
  return res.data as T;
}

export const newRequestId = () => crypto.randomUUID();

// ───────────────────────────── Connectivity ─────────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// ───────────────────────────── Actions ─────────────────────────────

export interface ActionState<T> {
  run: (payload: Record<string, unknown>) => Promise<T | undefined>;
  pending: boolean;
  error: UserFacingError | null;
  reset: () => void;
}

export function useAction<T = Record<string, unknown>>(
  name: FunctionName,
  opts: { idempotent?: boolean } = {},
): ActionState<T> {
  const { idempotent = true } = opts;
  const requestId = useRef(newRequestId());
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);

  const run = useCallback(
    async (payload: Record<string, unknown>) => {
      if (inFlight.current) return undefined;
      if (!navigator.onLine) {
        setError({ reason: 'unavailable', message: "You're offline. This change needs a connection — nothing was saved." });
        return undefined;
      }
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const result = await call<T>(name, idempotent ? { ...payload, requestId: requestId.current } : payload);
        requestId.current = newRequestId();
        return result;
      } catch (e) {
        const ue = toUserError(e);
        if (ue.reason !== 'unavailable' && ue.reason !== 'internal') requestId.current = newRequestId();
        setError(ue);
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [name, idempotent],
  );

  return { run, pending, error, reset: () => setError(null) };
}