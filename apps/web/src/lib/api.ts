import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toUserError, type UserFacingError } from '@profjero/shared';
import { auth, functions } from './firebase';

/** Names of the callable server functions (apps/functions + apps/worker). */
export type FunctionName =
  | 'createTenant' | 'updateTenant' | 'inviteMember' | 'revokeInvitation' | 'acceptInvitation' | 'changeMemberRole'
  | 'removeMember' | 'transferOwnership'
  | 'createAccount' | 'updateAccount' | 'createTransaction' | 'updateTransaction' | 'voidTransaction'
  | 'createDebt' | 'updateDebt' | 'recordRepayment' | 'voidDebt'
  | 'saveBudget' | 'deleteBudget' | 'saveSavingsGoal' | 'recordSavingsMovement' | 'reconcileAccounts'
  | 'saveInvoice' | 'sendInvoice' | 'voidInvoice' | 'recordInvoicePayment' | 'createPortalLink' | 'revokePortalLinks'
  | 'reviewPaymentNotice' | 'portalGetInvoices' | 'portalSubmitPaymentNotice' | 'migrateLegacyData';

/** Functions migrated to the Cloudflare Worker. Remove from this map when they go back to Firebase, add when they move. */
const WORKER_ROUTED: Partial<Record<FunctionName, string>> = {
  createTenant: '/createTenant',
};

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined;

async function callViaWorker<T>(route: string, data: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    const err = new Error('Please sign in to continue.');
    Object.assign(err, {
      code: 'functions/unauthenticated',
      details: { reason: 'not_authenticated', message: 'Please sign in to continue.' },
    });
    throw err;
  }

  const token = await user.getIdToken();
  const res = await fetch(`${WORKER_URL}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const body = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: {
      code?: string;
      message?: string;
      details?: { reason?: string; message?: string; fields?: Record<string, string> };
    };
  };

  if (!res.ok || body.error) {
    // Reconstruct the same shape the Firebase Functions SDK throws so
    // toUserError() maps the error identically to a failed callable.
    const err = new Error(body.error?.message ?? 'Request failed.');
    Object.assign(err, {
      code: `functions/${body.error?.code ?? 'internal'}`,
      details: body.error?.details ?? { reason: 'internal', message: 'Request failed.' },
    });
    throw err;
  }

  return body.result as T;
}

export async function call<T = Record<string, unknown>>(name: FunctionName, data: unknown): Promise<T> {
  const route = WORKER_ROUTED[name];
  if (route && WORKER_URL) return callViaWorker<T>(route, data);
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