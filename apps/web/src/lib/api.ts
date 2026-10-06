import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toUserError, type UserFacingError } from '@profjero/shared';
import { functions } from './firebase';

/** Names of the callable Cloud Functions (apps/functions/src). */
export type FunctionName =
  | 'createTenant' | 'updateTenant' | 'inviteMember' | 'revokeInvitation' | 'acceptInvitation' | 'changeMemberRole'
  | 'removeMember' | 'transferOwnership'
  | 'createAccount' | 'updateAccount' | 'createTransaction' | 'updateTransaction' | 'voidTransaction'
  | 'createDebt' | 'updateDebt' | 'recordRepayment' | 'voidDebt'
  | 'saveBudget' | 'deleteBudget' | 'saveSavingsGoal' | 'recordSavingsMovement' | 'reconcileAccounts'
  | 'saveInvoice' | 'sendInvoice' | 'voidInvoice' | 'recordInvoicePayment' | 'createPortalLink' | 'revokePortalLinks'
  | 'reviewPaymentNotice' | 'portalGetInvoices' | 'portalSubmitPaymentNotice' | 'migrateLegacyData';

export async function call<T = Record<string, unknown>>(name: FunctionName, data: unknown): Promise<T> {
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

/**
 * Calls a server function with an idempotency key.
 *
 * The key is created once per logical submission and reused for retries
 * (double clicks, a timeout after the server already committed, a refresh
 * mid-request); it rotates only after a success. Re-entrant calls while one is
 * pending are ignored, so a button cannot submit twice.
 *
 * Financial operations are never queued offline: when offline the call fails
 * fast with a clear message instead of being replayed later.
 */
export function useAction<T = Record<string, unknown>>(name: FunctionName, opts: { idempotent?: boolean } = {}): ActionState<T> {
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
        // A validation or permission failure means nothing was stored: the next attempt is a new request.
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
