import type { Role } from '@profjero/shared';
import { useTenantCollection } from '@/lib/data';
import { useTenant } from '@/app/tenant';

export interface Member {
  id: string;
  uid: string;
  email: string | null;
  role: Role;
  status: 'active' | 'suspended' | 'removed';
}

export function useMembers() {
  const { tenantId } = useTenant();
  const all = useTenantCollection<Member>(tenantId, 'members');
  return { ...all, data: all.data?.filter((m) => m.status === 'active') };
}
