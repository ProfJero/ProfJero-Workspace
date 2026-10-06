import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { limit, orderBy, where } from 'firebase/firestore';
import { sendEmailVerification, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  SPENDING_NATURES,
  SPENDING_NATURE_LABELS,
  TENANT_KINDS,
  canAssignRole,
  canRemoveMember,
  isValidTimeZone,
  tenantSettingsSchema,
  type CategoryDoc,
  type Role,
} from '@profjero/shared';
import type { Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAction } from '@/lib/api';
import { createDoc, updateDocFields, useTenantCollection } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, PageHeader, Select, Spinner, Textarea } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Notice, Tabs } from '@/ui/overlays';
import { useMembers, type Member } from './members';

// ───────────────────────────── General ─────────────────────────────

function General() {
  const { tenantId, tenant, can } = useTenant();
  const action = useAction('updateTenant');
  const schema = tenantSettingsSchema.omit({ currency: true, weekStartsOn: true }).extend({ timezone: z.string().refine(isValidTimeZone, 'Unknown timezone') });
  const defaults = () => ({
    name: tenant.name, kind: tenant.kind, timezone: tenant.timezone, invoicePrefix: tenant.invoicePrefix ?? 'INV-',
    businessProfile: tenant.businessProfile ?? { legalName: '', email: '', phone: '', address: '', paymentInstructions: '' },
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults() });
  useEffect(() => {
    f.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);
  const e = f.formState.errors;
  const editable = can('tenant.update');
  return (
    <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => { if (await action.run({ tenantId, settings: v })) toast('Settings saved'); })}>
      {!editable && <Notice>Only owners and admins can change workspace settings.</Notice>}
      {action.error && <InlineError message={action.error.message} />}
      <Card className="p-4 sm:p-5">
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace name" error={e.name?.message}>{(id) => <Input id={id} invalid={!!e.name} {...f.register('name')} />}</Field>
          <Field label="Type">{(id) => <Select id={id} {...f.register('kind')}>{TENANT_KINDS.map((k) => <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>)}</Select>}</Field>
          <Field label="Timezone" hint="Decides when days and months start for due dates and reports." error={e.timezone?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!e.timezone} {...f.register('timezone')} />}</Field>
          <Field label="Currency" hint="Fixed once accounts exist, so amounts are never re-labelled.">{(id, d) => <Input id={id} aria-describedby={d} value={tenant.currency} disabled readOnly />}</Field>
        </fieldset>
      </Card>
      <Card>
        <CardHeader title="Business profile" description="Shown on invoices and in the client portal." />
        <fieldset disabled={!editable} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Business name">{(id) => <Input id={id} {...f.register('businessProfile.legalName')} />}</Field>
          <Field label="Invoice number prefix" error={e.invoicePrefix?.message}>{(id) => <Input id={id} {...f.register('invoicePrefix')} />}</Field>
          <Field label="Email" error={e.businessProfile?.email?.message}>{(id) => <Input id={id} type="email" {...f.register('businessProfile.email')} />}</Field>
          <Field label="Phone">{(id) => <Input id={id} {...f.register('businessProfile.phone')} />}</Field>
          <Field label="Address" className="sm:col-span-2">{(id) => <Input id={id} {...f.register('businessProfile.address')} />}</Field>
          <Field label="Payment instructions" hint="e.g. MoMo number, bank account details." className="sm:col-span-2">{(id, d) => <Textarea id={id} rows={3} aria-describedby={d} {...f.register('businessProfile.paymentInstructions')} />}</Field>
        </fieldset>
      </Card>
      {editable && <div className="flex justify-end"><Button type="submit" variant="primary" loading={action.pending}>Save settings</Button></div>}
    </form>
  );
}

// ───────────────────────────── Members ─────────────────────────────

interface Invitation { id: string; email: string; role: Role; status: string; expiresAt: Timestamp }

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tenantId, role } = useTenant();
  const uid = useUser().uid;
  const action = useAction('inviteMember');
  const assignable = ROLES.filter((r) => canAssignRole({ actorRole: role, actorUid: uid, targetUid: '_', currentRole: null, newRole: r }).ok);
  const f = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email'), role: z.enum(ROLES) })), defaultValues: { email: '', role: 'member' as Role } });
  useEffect(() => { if (open) { f.reset({ email: '', role: 'member' }); action.reset(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const selected = f.watch('role');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite someone"
      description="They will see the invitation after signing in with this email address (verified)."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void f.handleSubmit(async (v) => { if (await action.run({ tenantId, ...v })) { toast(`Invitation created for ${v.email}`); onOpenChange(false); } })()}>Invite</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {action.error && <InlineError message={action.error.message} />}
        <Field label="Email" error={f.formState.errors.email?.message}>{(id) => <Input id={id} type="email" autoFocus {...f.register('email')} />}</Field>
        <Field label="Role" hint={ROLE_DESCRIPTIONS[selected]}>{(id, d) => <Select id={id} aria-describedby={d} {...f.register('role')}>{assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>}</Field>
      </form>
    </Dialog>
  );
}

function Members() {
  const { tenantId, role, can } = useTenant();
  const uid = useUser().uid;
  const navigate = useNavigate();
  const members = useMembers();
  const invitations = useTenantCollection<Invitation>(can('members.manage') ? tenantId : null, 'invitations', ['pending'], [where('status', '==', 'pending')]);
  const changeRole = useAction('changeMemberRole');
  const remove = useAction('removeMember');
  const revoke = useAction('revokeInvitation', { idempotent: false });
  const transfer = useAction('transferOwnership');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [transferring, setTransferring] = useState<Member | null>(null);
  const [roleChange, setRoleChange] = useState<{ member: Member; role: Role } | null>(null);
  const error = changeRole.error ?? remove.error ?? revoke.error ?? transfer.error;

  return (
    <div className="space-y-4">
      {error && <InlineError message={error.message} />}
      <Card>
        <CardHeader title="Members" description="Roles decide what each person can see and change. They are enforced on the server." action={can('members.manage') && <Button size="sm" variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>Invite</Button>} />
        {members.loading ? <Spinner /> : (
          <ul className="divide-y divide-line">
            {(members.data ?? []).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)).map((m) => {
              const roleOptions = ROLES.filter((r) => r === m.role || canAssignRole({ actorRole: role, actorUid: uid, targetUid: m.uid, currentRole: m.role, newRole: r }).ok);
              const canRemove = canRemoveMember({ actorRole: role, actorUid: uid, targetUid: m.uid, targetRole: m.role }).ok;
              return (
                <li key={m.uid} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.email ?? m.uid}{m.uid === uid && <span className="text-muted"> (you)</span>}</p>
                    <p className="text-xs text-muted">{ROLE_DESCRIPTIONS[m.role]}</p>
                  </div>
                  {roleOptions.length > 1 ? (
                    <Select aria-label={`Role for ${m.email ?? m.uid}`} value={m.role} className="w-32" onChange={(e) => setRoleChange({ member: m, role: e.target.value as Role })}>
                      {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  ) : <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABELS[m.role]}</Badge>}
                  <Menu label="Member actions" trigger={<IconButton label="Member actions"><MoreHorizontal className="size-4" /></IconButton>} items={[
                    { label: 'Make owner…', hidden: role !== 'owner' || m.uid === uid, onSelect: () => setTransferring(m) },
                    { label: m.uid === uid ? 'Leave workspace…' : 'Remove…', danger: true, hidden: !canRemove, onSelect: () => setRemoving(m) },
                  ]} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {can('members.manage') && (invitations.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Pending invitations" />
          <ul className="divide-y divide-line">
            {(invitations.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 truncate">{i.email} · {ROLE_LABELS[i.role]}</span>
                <Button size="sm" variant="ghost" onClick={async () => { if (await revoke.run({ tenantId, invitationId: i.id })) toast('Invitation revoked'); }}>Revoke</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog open={!!roleChange} onOpenChange={(o) => !o && setRoleChange(null)} destructive={false} title="Change role?" confirmLabel="Change role" pending={changeRole.pending}
        body={roleChange && <>{roleChange.member.email} will become <strong>{ROLE_LABELS[roleChange.role]}</strong>: {ROLE_DESCRIPTIONS[roleChange.role]}</>}
        onConfirm={async () => { if (roleChange && (await changeRole.run({ tenantId, uid: roleChange.member.uid, role: roleChange.role }))) { toast('Role changed'); setRoleChange(null); } }} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={removing?.uid === uid ? 'Leave this workspace?' : 'Remove member?'} confirmLabel={removing?.uid === uid ? 'Leave' : 'Remove'} pending={remove.pending}
        body={removing?.uid === uid ? 'You will lose access immediately.' : `${removing?.email ?? 'This person'} loses access immediately. Their past work stays in the workspace.`}
        onConfirm={async () => {
          if (!removing) return;
          if (await remove.run({ tenantId, uid: removing.uid })) {
            toast(removing.uid === uid ? 'You left the workspace' : 'Member removed');
            if (removing.uid === uid) navigate('/');
            setRemoving(null);
          }
        }} />
      <ConfirmDialog open={!!transferring} onOpenChange={(o) => !o && setTransferring(null)} title="Transfer ownership?" confirmLabel="Transfer" pending={transfer.pending}
        body={`${transferring?.email ?? 'This member'} becomes the owner. You become an admin.`}
        onConfirm={async () => { if (transferring && (await transfer.run({ tenantId, uid: transferring.uid }))) { toast('Ownership transferred'); setTransferring(null); } }} />
    </div>
  );
}

// ───────────────────────────── Categories ─────────────────────────────

function Categories() {
  const { tenantId, categories, can } = useTenant();
  const custom = useTenantCollection<CategoryDoc>(tenantId, 'categories');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [nature, setNature] = useState('');
  const builtIn = [...categories.values()].filter((c) => c.system);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Your categories" />
        {can('finance.write') && (
          <form className="flex flex-wrap gap-2 border-b border-line p-4" onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createDoc<CategoryDoc>(tenantId, 'categories', { name: name.trim().slice(0, 60), kind, defaultNature: kind === 'expense' && nature ? (nature as CategoryDoc['defaultNature']) : null, archived: false });
            setName('');
          }}>
            <Input aria-label="Category name" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} className="min-w-40 flex-1" />
            <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as 'income' | 'expense')} className="w-32"><option value="expense">Expense</option><option value="income">Income</option></Select>
            {kind === 'expense' && <Select aria-label="Usual kind of spending" value={nature} onChange={(e) => setNature(e.target.value)} className="w-40"><option value="">No default</option>{SPENDING_NATURES.map((n) => <option key={n} value={n}>{SPENDING_NATURE_LABELS[n]}</option>)}</Select>}
            <Button type="submit" disabled={!name.trim()}>Add</Button>
          </form>
        )}
        {(custom.data ?? []).length === 0 ? <p className="px-5 py-4 text-sm text-muted">No custom categories.</p> : (
          <ul className="divide-y divide-line">
            {(custom.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span className={c.archived ? 'text-muted line-through' : ''}>{c.name} <span className="text-xs text-muted">({c.kind})</span></span>
                {can('finance.write') && <Button size="sm" variant="ghost" onClick={() => updateDocFields<CategoryDoc>(tenantId, 'categories', c.id, { archived: !c.archived })}>{c.archived ? 'Restore' : 'Archive'}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Built-in categories" description="Always available. Archived custom categories stay on past transactions." />
        <ul className="grid grid-cols-1 gap-x-4 px-5 py-3 text-sm sm:grid-cols-2">
          {builtIn.map((c) => <li key={c.id} className="py-1 text-ink-2">{c.name} <span className="text-xs text-muted">({c.kind})</span></li>)}
        </ul>
      </Card>
    </div>
  );
}

// ───────────────────────────── Audit log ─────────────────────────────

interface AuditEntry { actorUid: string; action: string; resource: { type: string; id: string }; metadata: Record<string, unknown>; at?: Timestamp }

function AuditLog() {
  const { tenantId } = useTenant();
  const members = useMembers().data ?? [];
  const entries = useTenantCollection<AuditEntry>(tenantId, 'auditLogs', ['latest'], [orderBy('at', 'desc'), limit(200)]);
  const who = (uid: string) => members.find((m) => m.uid === uid)?.email ?? 'Former member';
  return (
    <Card>
      <CardHeader title="Audit log" description="Security- and money-related changes, newest first (latest 200)." />
      {entries.loading ? <Spinner /> : (entries.data ?? []).length === 0 ? <EmptyState title="No entries yet" /> : (
        <ul className="divide-y divide-line">
          {(entries.data ?? []).map((e) => (
            <li key={e.id} className="px-4 py-2.5 text-sm sm:px-5">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{e.action}</span>
                <span className="text-xs text-muted">{e.at ? e.at.toDate().toLocaleString() : ''}</span>
              </div>
              <p className="text-xs text-ink-2">{who(e.actorUid)} · {e.resource.type}</p>
              {Object.keys(e.metadata ?? {}).length > 0 && <p className="mt-0.5 break-all font-mono text-[11px] text-muted">{JSON.stringify(e.metadata)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────────── Profile ─────────────────────────────

function Profile() {
  const user = useUser();
  const [name, setName] = useState(user.displayName ?? '');
  const [sent, setSent] = useState<string | null>(null);
  return (
    <Card className="max-w-xl space-y-4 p-4 sm:p-5">
      <Field label="Display name">{(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
      <Button onClick={async () => {
        await updateProfile(user, { displayName: name.trim() });
        await updateDoc(doc(db, 'users', user.uid), { displayName: name.trim().slice(0, 80), updatedAt: serverTimestamp() }).catch(() => undefined);
        toast('Profile updated');
      }}>Save name</Button>
      <div className="border-t border-line pt-4 text-sm">
        <p><span className="text-muted">Email:</span> {user.email} {user.emailVerified ? <Badge tone="good">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!user.emailVerified && <Button size="sm" onClick={async () => { await sendEmailVerification(user).catch(() => undefined); setSent('Verification email sent.'); }}>Verify email</Button>}
          {user.email && <Button size="sm" onClick={async () => { await sendPasswordResetEmail(auth, user.email!).catch(() => undefined); setSent('Password reset email sent.'); }}>Change password</Button>}
        </div>
        {sent && <p className="mt-2 text-good-ink">{sent}</p>}
      </div>
    </Card>
  );
}

// ───────────────────────────── Legacy import ─────────────────────────────

interface MigrationReport { dryRun: boolean; counts: Record<string, number>; skipped: Record<string, number>; archived: Record<string, number>; warnings: string[] }

function LegacyImport() {
  const { tenantId } = useTenant();
  const action = useAction<MigrationReport>('migrateLegacyData');
  const [report, setReport] = useState<MigrationReport | null>(null);
  const run = async (dryRun: boolean) => { const r = await action.run({ tenantId, dryRun }); if (r) setReport(r); };
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Import from the previous ProfJero app</h2>
        <p className="mt-1 text-sm text-ink-2">Copies your data from the old app into this workspace. Your old records are not changed or deleted. Run a preview first to see what will be imported; importing twice does not create duplicates.</p>
      </div>
      {action.error && <InlineError message={action.error.message} />}
      <div className="flex flex-wrap gap-2">
        <Button loading={action.pending} onClick={() => void run(true)}>Preview import</Button>
        {report?.dryRun && <Button variant="primary" loading={action.pending} onClick={() => void run(false)}>Import now</Button>}
      </div>
      {report && (
        <div className="space-y-3 text-sm">
          <Notice>{report.dryRun ? 'Preview — nothing has been written yet.' : 'Import complete.'}</Notice>
          <table className="w-full">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Data</th><th className="py-1 text-right">{report.dryRun ? 'Will import' : 'Imported'}</th><th className="py-1 text-right">Skipped</th></tr></thead>
            <tbody className="tabular divide-y divide-line">
              {Object.keys({ ...report.counts, ...report.skipped }).sort().map((k) => <tr key={k}><td className="py-1">{k}</td><td className="py-1 text-right">{report.counts[k] ?? 0}</td><td className="py-1 text-right">{report.skipped[k] ?? 0}</td></tr>)}
            </tbody>
          </table>
          {Object.keys(report.archived).length > 0 && <p className="text-ink-2">Kept as read-only archive (no new module yet): {Object.entries(report.archived).map(([k, v]) => `${k} (${v})`).join(', ')}.</p>}
          {report.warnings.length > 0 && <ul className="list-disc pl-5 text-warning-ink">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { can, role } = useTenant();
  const [tab, setTab] = useState('general');
  const tabs = [
    { value: 'general', label: 'Workspace' },
    { value: 'members', label: 'Members' },
    ...(can('finance.read') ? [{ value: 'categories', label: 'Categories' }] : []),
    ...(can('audit.read') ? [{ value: 'audit', label: 'Audit log' }] : []),
    { value: 'profile', label: 'Your profile' },
    ...(role === 'owner' ? [{ value: 'import', label: 'Import' }] : []),
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs className="mb-4" value={tab} onValueChange={setTab} tabs={tabs} />
      {tab === 'general' && <General />}
      {tab === 'members' && <Members />}
      {tab === 'categories' && <Categories />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'profile' && <Profile />}
      {tab === 'import' && <LegacyImport />}
    </>
  );
}
