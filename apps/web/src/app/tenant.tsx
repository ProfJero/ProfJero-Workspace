import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  can as canRole,
  categoryMap,
  todayInZone,
  type Category,
  type CurrencyCode,
  type IsoDate,
  type Permission,
  type Role,
  type TenantSettings,
} from '@profjero/shared';
import { db } from '@/lib/firebase';
import { useLive } from '@/lib/live';
import { useTenantCollection } from '@/lib/data';
import { useAuth } from './auth';

export interface Membership {
  id: string;
  uid: string;
  tenantId: string;
  role: Role;
  status: 'active' | 'suspended' | 'removed';
}

export type Tenant = TenantSettings & { id: string };

/** All active memberships of the signed-in user (rules allow reading only one's own). */
export function useMemberships() {
  const { user } = useAuth();
  return useLive<Membership[]>(user ? ['memberships', user.uid] : null, () =>
    user ? query(collectionGroup(db, 'members'), where('uid', '==', user.uid), where('status', '==', 'active')) : null,
  );
}

/** Tenant documents for a list of ids, kept live. */
export function useTenants(ids: string[]): Map<string, Tenant> {
  const [tenants, setTenants] = useState<Map<string, Tenant>>(new Map());
  const key = [...ids].sort().join(',');
  useEffect(() => {
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, 'tenants', id),
        (snap) => {
          setTenants((prev) => {
            const next = new Map(prev);
            if (snap.exists()) next.set(id, { id, ...(snap.data() as TenantSettings) });
            else next.delete(id);
            return next;
          });
        },
        () => undefined,
      ),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tenants;
}

interface TenantContextValue {
  tenantId: string;
  tenant: Tenant;
  role: Role;
  currency: CurrencyCode;
  /** Today's date in the workspace timezone (refreshes after midnight). */
  today: IsoDate;
  can: (p: Permission) => boolean;
  categories: Map<string, Category>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function useTodayIn(timeZone: string): IsoDate {
  const [today, setToday] = useState(() => todayInZone(timeZone));
  useEffect(() => {
    setToday(todayInZone(timeZone));
    const t = setInterval(() => setToday(todayInZone(timeZone)), 60_000);
    return () => clearInterval(t);
  }, [timeZone]);
  return today;
}

export function TenantProvider({ tenant, membership, children }: { tenant: Tenant; membership: Membership; children: ReactNode }) {
  const today = useTodayIn(tenant.timezone || 'UTC');
  const canFinance = canRole(membership.role, 'finance.read');
  const custom = useTenantCollection<Omit<Category, 'id' | 'system'> & { archived: boolean }>(canFinance ? tenant.id : null, 'categories');
  const value = useMemo<TenantContextValue>(
    () => ({
      tenantId: tenant.id,
      tenant,
      role: membership.role,
      currency: tenant.currency as CurrencyCode,
      today,
      can: (p) => canRole(membership.role, p),
      categories: categoryMap((custom.data ?? []).filter((c) => !c.archived).map((c) => ({ ...c, system: false }))),
    }),
    [tenant, membership.role, today, custom.data],
  );
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant outside TenantProvider');
  return ctx;
}

export function rememberTenant(id: string) {
  try {
    localStorage.setItem('pj.lastTenant', id);
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function lastTenant(): string | null {
  try {
    return localStorage.getItem('pj.lastTenant');
  } catch {
    return null;
  }
}
