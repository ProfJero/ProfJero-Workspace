import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { orderBy, where } from 'firebase/firestore';
import { ArrowLeft, Briefcase, Copy, Link2, Mail, MoreHorizontal, Phone, Plus } from 'lucide-react';
import { CLIENT_STATUSES, clientSchema, formatIsoDate, isIsoDate, type ClientDoc, type ClientInteractionDoc } from '@profjero/shared';
import { createDoc, deleteDocument, updateDocFields, useTenantCollection } from '@/lib/data';
import { useAction } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, PageHeader, Select, Spinner, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Notice } from '@/ui/overlays';
import { useClients, useNotes, useProjects, type Client } from '../workspace/hooks';
import { InvoiceList } from '../finance/invoices';

const STATUS_TONE: Record<ClientDoc['status'], Tone> = { lead: 'warning', active: 'good', inactive: 'neutral' };
const STATUS_LABEL: Record<ClientDoc['status'], string> = { lead: 'Lead', active: 'Active', inactive: 'Inactive' };
const form = clientSchema.omit({ tags: true }).extend({ tags: z.string().max(800) });

function ClientDialog({ open, onOpenChange, client }: { open: boolean; onOpenChange: (o: boolean) => void; client: Client | null }) {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const defaults = (c: Client | null) => ({
    name: c?.name ?? '', company: c?.company ?? '', email: c?.email ?? '', phone: c?.phone ?? '', address: c?.address ?? '',
    status: c?.status ?? 'active', notes: c?.notes ?? '', tags: (c?.tags ?? []).join(', '),
  });
  const f = useForm({ resolver: zodResolver(form), defaultValues: defaults(client) });
  useEffect(() => {
    if (open) f.reset(defaults(client));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit((v) => {
    const tags = [...new Set(v.tags.split(',').map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
    const doc: ClientDoc = { ...v, tags };
    if (client) updateDocFields(tenantId, 'clients', client.id, doc);
    else navigate(`/w/${tenantId}/clients/${createDoc(tenantId, 'clients', doc)}`);
    toast(client ? 'Client updated' : 'Client added');
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={client ? 'Edit client' : 'New client'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <Field label="Name" required error={e.name?.message}>{(id) => <Input id={id} autoFocus invalid={!!e.name} {...f.register('name')} />}</Field>
        <Field label="Company">{(id) => <Input id={id} {...f.register('company')} />}</Field>
        <Field label="Email" error={e.email?.message}>{(id) => <Input id={id} type="email" invalid={!!e.email} {...f.register('email')} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} type="tel" {...f.register('phone')} />}</Field>
        <Field label="Address" className="sm:col-span-2">{(id) => <Input id={id} {...f.register('address')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...f.register('status')}>{CLIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>}</Field>
        <Field label="Tags" hint="Separate with commas.">{(id, d) => <Input id={id} aria-describedby={d} {...f.register('tags')} />}</Field>
        <Field label="Private notes" hint="Visible to your team only — never shown in the client portal." className="sm:col-span-2">{(id, d) => <Textarea id={id} rows={3} aria-describedby={d} {...f.register('notes')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function ClientsPage() {
  const { tenantId, can } = useTenant();
  const clients = useClients();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (clients.data ?? [])
      .filter((c) => !status || c.status === status)
      .filter((c) => !term || [c.name, c.company, c.email, c.phone].some((x) => x.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients.data, q, status]);
  return (
    <>
      <PageHeader title="Clients" description="People and organisations you work for."
        actions={can('clients.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New client</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search name, company, email or phone" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-44">
          <option value="">All statuses</option>
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <Card>
        {clients.loading ? <Spinner /> : clients.error ? <div className="p-4"><InlineError message={clients.error} /></div> : list.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-5" />} title="No clients found" action={can('clients.write') && <Button onClick={() => setCreating(true)}>Add a client</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`/w/${tenantId}/clients/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted">{[c.company, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ClientDialog open={creating} onOpenChange={setCreating} client={null} />
    </>
  );
}

function Interactions({ client }: { client: Client }) {
  const { tenantId, today, can } = useTenant();
  const items = useTenantCollection<ClientInteractionDoc>(tenantId, 'clientInteractions', ['client', client.id], [where('clientId', '==', client.id), orderBy('date', 'desc')]);
  const [kind, setKind] = useState<ClientInteractionDoc['kind']>('call');
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState('');
  const KIND = { call: 'Call', email: 'Email', meeting: 'Meeting', message: 'Message', note: 'Note' } as const;
  return (
    <Card>
      <CardHeader title="Communication history" />
      {can('clients.write') && (
        <form className="space-y-2 border-b border-line p-4" onSubmit={(e) => {
          e.preventDefault();
          if (!summary.trim() || !isIsoDate(date)) return;
          createDoc<ClientInteractionDoc>(tenantId, 'clientInteractions', { clientId: client.id, kind, date, summary: summary.trim().slice(0, 2000) });
          setSummary('');
        }}>
          <div className="flex gap-2">
            <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-32">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <Textarea aria-label="Summary" rows={2} placeholder="What was discussed?" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <div className="flex justify-end"><Button type="submit" size="sm" disabled={!summary.trim()}>Log</Button></div>
        </form>
      )}
      {(items.data ?? []).length === 0 ? <p className="px-5 py-4 text-sm text-muted">No interactions logged.</p> : (
        <ul className="divide-y divide-line">
          {(items.data ?? []).map((i) => (
            <li key={i.id} className="group flex gap-3 px-4 py-3 sm:px-5">
              <Badge>{KIND[i.kind]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{formatIsoDate(i.date)}</p>
                <p className="whitespace-pre-wrap text-sm">{i.summary}</p>
              </div>
              {can('clients.write') && <Button size="sm" variant="ghost" className="sm:opacity-0 sm:group-hover:opacity-100" onClick={() => deleteDocument(tenantId, 'clientInteractions', i.id)}>Delete</Button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PortalLink({ client }: { client: Client }) {
  const { tenantId } = useTenant();
  const create = useAction<{ token: string }>('createPortalLink', { idempotent: true });
  const revoke = useAction<{ revoked: number }>('revokePortalLinks');
  const [url, setUrl] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Client portal" description="A private link where this client can view their invoices and report payments." />
      <div className="space-y-3 p-4">
        {url ? (
          <>
            <Notice tone="warning">Copy this link now — for security it is shown only once. Anyone with the link can see this client’s invoices.</Notice>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Portal link" onFocus={(e) => e.currentTarget.select()} />
              <IconButton label="Copy link" onClick={() => { void navigator.clipboard.writeText(url); toast('Link copied'); }}><Copy className="size-4" /></IconButton>
            </div>
          </>
        ) : null}
        {(create.error || revoke.error) && <InlineError message={(create.error ?? revoke.error)!.message} />}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Link2 className="size-4" />} loading={create.pending} onClick={async () => {
            const r = await create.run({ tenantId, clientId: client.id, expiresInDays: 90 });
            if (r) setUrl(`${window.location.origin}/portal#${r.token}`);
          }}>Create link (90 days)</Button>
          <Button size="sm" variant="ghost" loading={revoke.pending} onClick={async () => {
            const r = await revoke.run({ tenantId, clientId: client.id });
            if (r) { setUrl(null); toast(`${r.revoked} link(s) revoked`); }
          }}>Revoke all links</Button>
        </div>
      </div>
    </Card>
  );
}

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { tenantId, can } = useTenant();
  const navigate = useNavigate();
  const clients = useClients();
  const projects = (useProjects().data ?? []).filter((p) => p.clientId === id);
  const notes = (useNotes().data ?? []).filter((n) => n.links.clientId === id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const client = clients.data?.find((c) => c.id === id);
  if (clients.loading) return <Spinner />;
  if (!client) return <EmptyState title="Client not found" action={<Link className="text-brand" to={`/w/${tenantId}/clients`}>Back to clients</Link>} />;
  return (
    <>
      <Link to={`/w/${tenantId}/clients`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Clients</Link>
      <PageHeader title={client.name} description={client.company || undefined}
        actions={can('clients.write') && (
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Menu label="More client actions" trigger={<IconButton label="More"><MoreHorizontal className="size-4" /></IconButton>}
              items={[{ label: 'Delete', danger: true, onSelect: () => setDeleting(true) }]} />
          </>
        )} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card className="space-y-2 p-4 text-sm">
            <Badge tone={STATUS_TONE[client.status]}>{STATUS_LABEL[client.status]}</Badge>
            {client.email && <a className="flex items-center gap-2 text-brand hover:underline" href={`mailto:${client.email}`}><Mail className="size-4" />{client.email}</a>}
            {client.phone && <a className="flex items-center gap-2 text-brand hover:underline" href={`tel:${client.phone}`}><Phone className="size-4" />{client.phone}</a>}
            {client.address && <p className="text-ink-2">{client.address}</p>}
            {client.notes && <p className="whitespace-pre-wrap border-t border-line pt-2 text-ink-2">{client.notes}</p>}
          </Card>
          <Card>
            <CardHeader title="Projects" />
            {projects.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No projects.</p> : (
              <ul className="divide-y divide-line">{projects.map((p) => <li key={p.id}><Link className="block px-5 py-2.5 text-sm hover:bg-surface-2" to={`/w/${tenantId}/projects/${p.id}`}>{p.name}</Link></li>)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Notes" action={can('workspace.write') && <Button size="sm" onClick={() => navigate(`/w/${tenantId}/notes?new=1&clientId=${id}`)}>New</Button>} />
            {notes.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No notes.</p> : (
              <ul className="divide-y divide-line">{notes.map((n) => <li key={n.id}><Link className="block px-5 py-2.5 text-sm hover:bg-surface-2" to={`/w/${tenantId}/notes?open=${n.id}`}>{n.title}</Link></li>)}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          {can('finance.read') && <InvoiceList clientId={id} />}
          {can('finance.manage') && <PortalLink client={client} />}
          <Interactions client={client} />
        </div>
      </div>
      <ClientDialog open={editing} onOpenChange={setEditing} client={client} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete client?" confirmLabel="Delete client"
        body="The client profile is deleted. Invoices and transactions keep the client's name for your records; projects are unlinked."
        onConfirm={() => {
          for (const p of projects) updateDocFields(tenantId, 'projects', p.id, { clientId: null });
          deleteDocument(tenantId, 'clients', id);
          navigate(`/w/${tenantId}/clients`);
          toast('Client deleted');
        }} />
    </>
  );
}
