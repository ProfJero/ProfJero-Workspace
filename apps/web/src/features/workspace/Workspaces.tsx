import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collectionGroup, query, where } from 'firebase/firestore';
import { sendEmailVerification } from 'firebase/auth';
import { Building2, Mail } from 'lucide-react';
import { CURRENCIES, CURRENCY_CODES, TENANT_KINDS, isValidTimeZone } from '@profjero/shared';
import { db } from '@/lib/firebase';
import { useLive } from '@/lib/live';
import { useAction } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuth, useUser } from '@/app/auth';
import { lastTenant, useMemberships } from '@/app/tenant';
import { Button, Card, CardHeader, Field, Input, Select, Spinner } from '@/ui/primitives';
import { Dialog, InlineError, Notice } from '@/ui/overlays';

const KIND_LABELS: Record<(typeof TENANT_KINDS)[number], string> = {
  personal: 'Personal', business: 'Business', ngo: 'NGO', church: 'Church', school: 'School', company: 'Company', other: 'Other',
};

const schema = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name').max(80),
  kind: z.enum(TENANT_KINDS),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
});

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Accra';
  } catch {
    return 'Africa/Accra';
  }
}

export function CreateWorkspaceForm({ onCreated, defaultName = 'Personal', defaultKind = 'personal' }: { onCreated: (tenantId: string) => void; defaultName?: string; defaultKind?: (typeof TENANT_KINDS)[number] }) {
  const action = useAction<{ tenantId: string }>('createTenant');
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: defaultName, kind: defaultKind, currency: 'GHS', timezone: defaultTimezone() } });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        const r = await action.run(values);
        if (r) onCreated(r.tenantId);
      })}
    >
      {action.error && <InlineError message={action.error.message} />}
      <Field label="Workspace name" error={e.name?.message}>
        {(id) => <Input id={id} invalid={!!e.name} {...form.register('name')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          {(id) => (
            <Select id={id} {...form.register('kind')}>
              {TENANT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Currency" hint="Cannot change once accounts exist.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} {...form.register('currency')}>
              {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} — {CURRENCIES[c].name}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Timezone" hint="Decides when your days, months and due dates begin." error={e.timezone?.message}>
        {(id, d) => <Input id={id} aria-describedby={d} invalid={!!e.timezone} {...form.register('timezone')} />}
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={action.pending}>Create workspace</Button>
    </form>
  );
}

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New workspace" description="Each workspace has its own members, data and finances.">
      <CreateWorkspaceForm
        defaultName=""
        defaultKind="business"
        onCreated={(id) => {
          onOpenChange(false);
          toast('Workspace created');
          navigate(`/w/${id}`);
        }}
      />
    </Dialog>
  );
}

interface Invitation {
  id: string;
  tenantId: string;
  tenantName: string;
  role: string;
  status: string;
}

export function PendingInvitations() {
  const user = useUser();
  const navigate = useNavigate();
  const email = user.email?.toLowerCase() ?? '';
  const invitations = useLive<Invitation[]>(user.emailVerified && email ? ['invitations', email] : null, () =>
    query(collectionGroup(db, 'invitations'), where('email', '==', email), where('status', '==', 'pending')),
  );
  const accept = useAction<{ tenantId: string }>('acceptInvitation', { idempotent: false });
  const [sent, setSent] = useState(false);

  if (!user.emailVerified) {
    return (
      <Notice>
        Verify your email address to see invitations to other workspaces.{' '}
        <button
          className="font-medium underline"
          disabled={sent}
          onClick={async () => {
            await sendEmailVerification(user).catch(() => undefined);
            setSent(true);
          }}
        >
          {sent ? 'Verification email sent' : 'Resend verification email'}
        </button>
      </Notice>
    );
  }
  const list = invitations.data ?? [];
  if (list.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Invitations" description="Workspaces you have been invited to join." />
      <ul className="divide-y divide-line">
        {list.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Mail className="size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{inv.tenantName}</p>
                <p className="text-xs text-muted">as {inv.role}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="primary"
              loading={accept.pending}
              onClick={async () => {
                const r = await accept.run({ tenantId: inv.tenantId, invitationId: inv.id });
                if (r) navigate(`/w/${r.tenantId}`);
              }}
            >
              Join
            </Button>
          </li>
        ))}
      </ul>
      {accept.error && <div className="px-4 pb-3"><InlineError message={accept.error.message} /></div>}
    </Card>
  );
}

/** "/" — sends the user to their last workspace, or onboards them. */
export function WorkspaceHome() {
  const { signOut } = useAuth();
  const memberships = useMemberships();
  const navigate = useNavigate();
  if (memberships.loading) return <Spinner label="Loading your workspaces" />;
  if (memberships.error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <InlineError title="We couldn't load your workspaces" message={memberships.error} />
      </main>
    );
  }
  const list = memberships.data ?? [];
  if (list.length > 0) {
    const preferred = lastTenant();
    const target = list.find((m) => m.tenantId === preferred) ?? list[0]!;
    return <Navigate to={`/w/${target.tenantId}`} replace />;
  }
  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-12">
      <div className="text-center">
        <Building2 className="mx-auto mb-3 size-10 text-brand" aria-hidden />
        <h1 className="text-xl font-semibold">Set up your workspace</h1>
        <p className="mt-1 text-sm text-ink-2">Everything you add lives in a workspace. Start with a personal one — you can create or join others any time.</p>
      </div>
      <PendingInvitations />
      <Card className="p-5">
        <CreateWorkspaceForm onCreated={(id) => navigate(`/w/${id}`, { replace: true })} />
      </Card>
      <p className="text-center text-sm">
        <button className="text-muted hover:text-ink hover:underline" onClick={() => void signOut()}>Sign out</button>
      </p>
    </main>
  );
}
