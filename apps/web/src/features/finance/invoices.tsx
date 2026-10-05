import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { orderBy, where } from 'firebase/firestore';
import { FileText, MoreHorizontal, Plus, Printer, Trash2 } from 'lucide-react';
import {
  computeInvoiceTotals,
  formatIsoDate,
  isIsoDate,
  isInvoiceOverdue,
  minorToDecimalString,
  type InvoiceStatus,
  type InvoiceTotals,
} from '@profjero/shared';
import { useAction } from '@/lib/api';
import { useTenantCollection, type WithMeta } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Select, Spinner, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Notice } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { useClients, useProjects } from '../workspace/hooks';
import { useAccounts } from './data';

export interface Invoice {
  number: string;
  clientId: string;
  clientName: string;
  clientSnapshot: { name: string; company: string; email: string; phone: string; address: string } | null;
  projectId: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: 'GHS';
  lines: { description: string; quantityMilli: number; unitPriceMinor: number }[];
  lineTotalsMinor: number[];
  subtotalMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  status: InvoiceStatus;
  notes: string;
}
type StoredInvoice = WithMeta<Invoice>;

interface PaymentNotice { invoiceId: string; invoiceNumber: string; clientId: string; amountMinor: number; method: string; reference: string; paidOn: string; status: string }

const STATUS: Record<InvoiceStatus | 'overdue', { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Awaiting payment', tone: 'brand' }, partially_paid: { label: 'Partly paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'good' }, void: { label: 'Void', tone: 'neutral' }, overdue: { label: 'Overdue', tone: 'critical' },
};
const METHODS = { mobile_money: 'Mobile Money', bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', cheque: 'Cheque', other: 'Other' } as const;

const qtyToMilli = (v: string) => Math.round(Number(v) * 1000);
const validQty = (v: string) => /^\d+(\.\d{1,3})?$/.test(v.trim()) && Number(v) > 0 && Number(v) <= 1_000_000;
const validRate = (v: string) => /^\d{1,3}(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100;

// ───────────────────────────── Editor ─────────────────────────────

function InvoiceDialog({ open, onOpenChange, invoice, clientId }: { open: boolean; onOpenChange: (o: boolean) => void; invoice: StoredInvoice | null; clientId?: string }) {
  const { tenantId, currency, today } = useTenant();
  const clients = useClients().data ?? [];
  const projects = useProjects().data ?? [];
  const save = useAction<{ number: string }>('saveInvoice');
  const schema = z.object({
    clientId: z.string().min(1, 'Choose a client'),
    projectId: z.string(),
    issueDate: z.string().refine(isIsoDate, 'Choose a date'),
    dueDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'),
    lines: z.array(z.object({
      description: z.string().trim().min(1, 'Describe the item').max(300),
      quantity: z.string().refine(validQty, 'Up to 3 decimals'),
      unitPrice: z.string().refine((v) => moneyError(v, currency, { allowZero: true }) === null, 'Invalid price'),
    })).min(1),
    discount: z.string().refine((v) => v.trim() === '' || moneyError(v, currency, { allowZero: true }) === null, 'Invalid amount'),
    taxRate: z.string().refine((v) => v.trim() === '' || validRate(v), '0–100, up to 2 decimals'),
    notes: z.string().max(2000),
  }).refine((v) => !v.dueDate || v.dueDate >= v.issueDate, { path: ['dueDate'], message: 'Due date is before the issue date' });
  type V = z.infer<typeof schema>;
  const defaults = (i: StoredInvoice | null): V => ({
    clientId: i?.clientId ?? clientId ?? '', projectId: i?.projectId ?? '', issueDate: i?.issueDate ?? today, dueDate: i?.dueDate ?? '',
    lines: i?.lines.map((l) => ({ description: l.description, quantity: String(l.quantityMilli / 1000), unitPrice: minorToDecimalString(l.unitPriceMinor, currency) })) ?? [{ description: '', quantity: '1', unitPrice: '' }],
    discount: i && i.discountMinor ? minorToDecimalString(i.discountMinor, currency) : '', taxRate: i ? String(i.taxRateBps / 100) : '', notes: i?.notes ?? '',
  });
  const f = useForm<V>({ resolver: zodResolver(schema), defaultValues: defaults(invoice) });
  const lines = useFieldArray({ control: f.control, name: 'lines' });
  useEffect(() => {
    if (open) { f.reset(defaults(invoice)); save.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);
  const e = f.formState.errors;
  const watched = f.watch();
  const preview = useMemo((): InvoiceTotals | string => {
    try {
      const ls = watched.lines.map((l) => ({ description: l.description, quantityMilli: validQty(l.quantity) ? qtyToMilli(l.quantity) : 0, unitPriceMinor: moneyError(l.unitPrice, currency, { allowZero: true }) ? 0 : toMinor(l.unitPrice, currency) }));
      if (ls.some((l) => l.quantityMilli <= 0)) return 'Enter quantities to see totals';
      const discount = watched.discount.trim() && !moneyError(watched.discount, currency, { allowZero: true }) ? toMinor(watched.discount, currency) : 0;
      const bps = watched.taxRate.trim() && validRate(watched.taxRate) ? Math.round(Number(watched.taxRate) * 100) : 0;
      return computeInvoiceTotals(ls, discount, bps);
    } catch (err) {
      return err instanceof Error ? err.message : 'Check the amounts';
    }
  }, [watched, currency]);
  const submit = f.handleSubmit(async (v) => {
    const r = await save.run({
      tenantId, invoiceId: invoice?.id ?? null,
      invoice: {
        clientId: v.clientId, projectId: v.projectId || null, issueDate: v.issueDate, dueDate: v.dueDate || null, currency,
        lines: v.lines.map((l) => ({ description: l.description, quantityMilli: qtyToMilli(l.quantity), unitPriceMinor: toMinor(l.unitPrice, currency) })),
        discountMinor: v.discount.trim() ? toMinor(v.discount, currency) : 0, taxRateBps: v.taxRate.trim() ? Math.round(Number(v.taxRate) * 100) : 0, notes: v.notes,
      },
    });
    if (r) { toast(invoice ? 'Invoice saved' : `Invoice ${r.number} created as a draft`); onOpenChange(false); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={invoice ? `Edit ${invoice.number}` : 'New invoice'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={() => void submit()}>Save draft</Button></>}>
      {clients.length === 0 ? <Notice>Add a client first (Clients → New client).</Notice> : (
        <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
          {save.error && <InlineError message={save.error.message} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" error={e.clientId?.message}>{(id) => <Select id={id} invalid={!!e.clientId} {...f.register('clientId')}><option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
            <Field label="Project">{(id) => <Select id={id} {...f.register('projectId')}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
            <Field label="Issue date" error={e.issueDate?.message}>{(id) => <Input id={id} type="date" {...f.register('issueDate')} />}</Field>
            <Field label="Due date" error={e.dueDate?.message}>{(id) => <Input id={id} type="date" invalid={!!e.dueDate} {...f.register('dueDate')} />}</Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Items</legend>
            {lines.fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_90px_140px_auto]">
                <Input aria-label={`Item ${i + 1} description`} placeholder="Description" invalid={!!e.lines?.[i]?.description} className="col-span-2 sm:col-span-1" {...f.register(`lines.${i}.description`)} />
                <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" placeholder="Qty" invalid={!!e.lines?.[i]?.quantity} {...f.register(`lines.${i}.quantity`)} />
                <MoneyInput aria-label={`Item ${i + 1} unit price`} currency={currency} invalid={!!e.lines?.[i]?.unitPrice} {...f.register(`lines.${i}.unitPrice`)} />
                <IconButton label={`Remove item ${i + 1}`} disabled={lines.fields.length === 1} onClick={() => lines.remove(i)}><Trash2 className="size-4" /></IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => lines.append({ description: '', quantity: '1', unitPrice: '' })}>Add item</Button>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount" error={e.discount?.message}>{(id) => <MoneyInput id={id} currency={currency} invalid={!!e.discount} {...f.register('discount')} />}</Field>
            <Field label="Tax rate (%)" hint="Applied after discount." error={e.taxRate?.message}>{(id, d) => <Input id={id} inputMode="decimal" aria-describedby={d} invalid={!!e.taxRate} {...f.register('taxRate')} />}</Field>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            {typeof preview === 'string' ? <p className="text-muted">{preview}</p> : (
              <dl className="tabular space-y-1">
                <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd><Money minor={preview.subtotalMinor} currency={currency} /></dd></div>
                {preview.discountMinor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Discount</dt><dd>−<Money minor={preview.discountMinor} currency={currency} /></dd></div>}
                {preview.taxMinor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd><Money minor={preview.taxMinor} currency={currency} /></dd></div>}
                <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd><Money minor={preview.totalMinor} currency={currency} /></dd></div>
              </dl>
            )}
            <p className="mt-2 text-xs text-muted">Final totals are calculated on the server when you save.</p>
          </div>
          <Field label="Notes to client">{(id) => <Textarea id={id} rows={2} {...f.register('notes')} />}</Field>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

function PaymentDialog({ invoice, notice, onClose }: { invoice: StoredInvoice | null; notice?: (PaymentNotice & { id: string }) | null; onClose: () => void }) {
  const { tenantId, currency, today } = useTenant();
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived);
  const record = useAction('recordInvoicePayment');
  const review = useAction('reviewPaymentNotice');
  const due = invoice ? invoice.totalMinor - invoice.paidMinor : 0;
  const schema = z.object({
    amount: z.string().superRefine((v, ctx) => {
      const m = moneyError(v, currency);
      if (m) ctx.addIssue({ code: 'custom', message: m });
      else if (toMinor(v, currency) > due) ctx.addIssue({ code: 'custom', message: 'More than the balance due' });
    }),
    date: z.string().refine(isIsoDate, 'Choose a date'),
    accountId: z.string().min(1, 'Choose the account the money went into'),
    method: z.enum(Object.keys(METHODS) as [keyof typeof METHODS]),
    reference: z.string().max(120),
  });
  const init = () => ({
    amount: notice ? minorToDecimalString(notice.amountMinor, currency) : '', date: notice?.paidOn ?? today, accountId: accounts[0]?.id ?? '',
    method: (notice?.method as keyof typeof METHODS) ?? 'mobile_money', reference: notice?.reference ?? '',
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: init() });
  useEffect(() => {
    if (invoice) { f.reset(init()); record.reset(); review.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, notice?.id]);
  const e = f.formState.errors;
  const action = notice ? review : record;
  const submit = f.handleSubmit(async (v) => {
    if (!invoice) return;
    const r = notice
      ? await review.run({ tenantId, noticeId: notice.id, decision: 'approve', accountId: v.accountId, reason: '' })
      : await record.run({ tenantId, invoiceId: invoice.id, amountMinor: toMinor(v.amount, currency), date: v.date, accountId: v.accountId, method: v.method, reference: v.reference, paymentNoticeId: null });
    if (r) { toast('Payment recorded as income'); onClose(); }
  });
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()} title={notice ? `Confirm payment for ${invoice?.number}` : `Record payment for ${invoice?.number}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void submit()}>{notice ? 'Confirm received' : 'Record payment'}</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {action.error && <InlineError message={action.error.message} />}
        <p className="text-sm text-ink-2">Balance due: <Money minor={due} currency={currency} className="font-semibold text-ink" /></p>
        {notice && <Notice>The client reported paying <Money minor={notice.amountMinor} currency={currency} /> by {METHODS[notice.method as keyof typeof METHODS] ?? notice.method} (ref. {notice.reference}). Check it arrived before confirming.</Notice>}
        <Field label="Amount" error={e.amount?.message}>{(id) => <MoneyInput id={id} currency={currency} disabled={!!notice} invalid={!!e.amount} {...f.register('amount')} />}</Field>
        {!notice && <Field label="Date received" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>}
        <Field label="Received into" error={e.accountId?.message}>{(id) => <Select id={id} invalid={!!e.accountId} {...f.register('accountId')}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
        {!notice && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">{(id) => <Select id={id} {...f.register('method')}>{Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            <Field label="Reference">{(id) => <Input id={id} {...f.register('reference')} />}</Field>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function InvoiceView({ invoice, business }: { invoice: Omit<Invoice, 'clientSnapshot' | 'clientName' | 'clientId' | 'projectId'> & { clientName?: string; clientSnapshot?: Invoice['clientSnapshot'] }; business: { name: string; email: string; phone: string; address: string; paymentInstructions: string } }) {
  const cur = invoice.currency;
  return (
    <div className="print-area space-y-5 text-sm">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{business.name}</p>
          <p className="whitespace-pre-line text-ink-2">{[business.address, business.email, business.phone].filter(Boolean).join('\n')}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">Invoice {invoice.number}</p>
          <p className="text-ink-2">Issued {formatIsoDate(invoice.issueDate)}</p>
          {invoice.dueDate && <p className="text-ink-2">Due {formatIsoDate(invoice.dueDate)}</p>}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase text-muted">Bill to</p>
        <p className="font-medium">{invoice.clientSnapshot?.name ?? invoice.clientName}</p>
        {invoice.clientSnapshot && <p className="whitespace-pre-line text-ink-2">{[invoice.clientSnapshot.company, invoice.clientSnapshot.address, invoice.clientSnapshot.email].filter(Boolean).join('\n')}</p>}
      </div>
      <table className="w-full">
        <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 font-medium">Item</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Price</th><th className="py-1.5 text-right font-medium">Amount</th></tr></thead>
        <tbody className="tabular">
          {invoice.lines.map((l, i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 text-right">{l.quantityMilli / 1000}</td>
              <td className="py-1.5 text-right"><Money minor={l.unitPriceMinor} currency={cur} /></td>
              <td className="py-1.5 text-right"><Money minor={invoice.lineTotalsMinor[i] ?? 0} currency={cur} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="tabular ml-auto max-w-xs space-y-1">
        <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd><Money minor={invoice.subtotalMinor} currency={cur} /></dd></div>
        {invoice.discountMinor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Discount</dt><dd>−<Money minor={invoice.discountMinor} currency={cur} /></dd></div>}
        {invoice.taxMinor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Tax ({invoice.taxRateBps / 100}%)</dt><dd><Money minor={invoice.taxMinor} currency={cur} /></dd></div>}
        <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd><Money minor={invoice.totalMinor} currency={cur} /></dd></div>
        {invoice.paidMinor > 0 && <div className="flex justify-between text-ink-2"><dt>Paid</dt><dd><Money minor={invoice.paidMinor} currency={cur} /></dd></div>}
        <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd><Money minor={invoice.totalMinor - invoice.paidMinor} currency={cur} /></dd></div>
      </dl>
      {invoice.notes && <p className="whitespace-pre-line text-ink-2">{invoice.notes}</p>}
      {business.paymentInstructions && <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs uppercase text-muted">How to pay</p><p className="whitespace-pre-line">{business.paymentInstructions}</p></div>}
    </div>
  );
}

// ───────────────────────────── List ─────────────────────────────

export function InvoiceList({ clientId }: { clientId?: string }) {
  const { tenantId, tenant, today, currency, can } = useTenant();
  const invoices = useTenantCollection<Invoice>(tenantId, 'invoices', ['inv', clientId ?? 'all'], clientId ? [where('clientId', '==', clientId)] : [orderBy('issueDate', 'desc')]);
  const notices = useTenantCollection<PaymentNotice>(tenantId, 'paymentNotices', ['pending'], [where('status', '==', 'pending')]);
  const send = useAction('sendInvoice');
  const voidInv = useAction('voidInvoice');
  const review = useAction('reviewPaymentNotice');
  const [editing, setEditing] = useState<StoredInvoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<{ invoice: StoredInvoice; notice?: PaymentNotice & { id: string } } | null>(null);
  const [viewing, setViewing] = useState<StoredInvoice | null>(null);
  const [voiding, setVoiding] = useState<StoredInvoice | null>(null);
  const list = (invoices.data ?? []).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
  const pending = (notices.data ?? []).filter((n) => !clientId || n.clientId === clientId);
  const outstanding = list.filter((i) => i.status === 'sent' || i.status === 'partially_paid').reduce((a, i) => a + i.totalMinor - i.paidMinor, 0);
  const bp = tenant.businessProfile;

  return (
    <>
      {pending.length > 0 && (
        <Card className="mb-4 border-warning/40">
          <CardHeader title="Payments reported by clients" description="Confirm each one once the money has arrived." />
          <ul className="divide-y divide-line">
            {pending.map((n) => {
              const inv = list.find((i) => i.id === n.invoiceId);
              return (
                <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{n.invoiceNumber} · <Money minor={n.amountMinor} currency={currency} /></p>
                    <p className="text-xs text-muted">{METHODS[n.method as keyof typeof METHODS] ?? n.method} · ref. {n.reference} · {formatIsoDate(n.paidOn)}</p>
                  </div>
                  {can('finance.write') && inv && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => setPaying({ invoice: inv, notice: n })}>Confirm</Button>
                      <Button size="sm" variant="ghost" loading={review.pending} onClick={async () => { if (await review.run({ tenantId, noticeId: n.id, decision: 'reject', accountId: null, reason: 'Not received' })) toast('Marked as not received'); }}>Not received</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Invoices" description={outstanding > 0 ? <>Outstanding: <Money minor={outstanding} currency={currency} /></> : undefined}
          action={can('finance.write') && <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New</Button>} />
        {invoices.loading ? <Spinner /> : list.length === 0 ? <EmptyState icon={<FileText className="size-5" />} title="No invoices yet" /> : (
          <ul className="divide-y divide-line">
            {list.map((inv) => {
              const st = isInvoiceOverdue(inv, today) ? STATUS.overdue : STATUS[inv.status];
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(inv)}>
                    <p className="text-sm font-medium">{inv.number} <span className="font-normal text-muted">· {inv.clientSnapshot?.name ?? inv.clientName}</span></p>
                    <p className="text-xs text-muted">{formatIsoDate(inv.issueDate)}{inv.dueDate ? ` · due ${formatIsoDate(inv.dueDate)}` : ''}</p>
                  </button>
                  <div className="text-right">
                    <Money minor={inv.totalMinor} currency={inv.currency} className="text-sm font-semibold" />
                    <div><Badge tone={st.tone}>{st.label}</Badge></div>
                  </div>
                  {can('finance.write') && (
                    <Menu label={`Actions for ${inv.number}`} trigger={<IconButton label={`Actions for ${inv.number}`}><MoreHorizontal className="size-4" /></IconButton>} items={[
                      { label: 'View / print', onSelect: () => setViewing(inv) },
                      { label: 'Edit', hidden: inv.status !== 'draft', onSelect: () => setEditing(inv) },
                      { label: 'Mark as sent', hidden: inv.status !== 'draft', onSelect: async () => { if (await send.run({ tenantId, invoiceId: inv.id })) toast(`${inv.number} issued`); } },
                      { label: 'Record payment', hidden: inv.status !== 'sent' && inv.status !== 'partially_paid', onSelect: () => setPaying({ invoice: inv }) },
                      { label: 'Void…', danger: true, hidden: inv.status === 'void' || inv.paidMinor > 0 || !can('finance.manage'), onSelect: () => setVoiding(inv) },
                    ]} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(send.error || review.error) && <div className="p-3"><InlineError message={(send.error ?? review.error)!.message} /></div>}
      </Card>
      <InvoiceDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} invoice={editing} clientId={clientId} />
      <PaymentDialog invoice={paying?.invoice ?? null} notice={paying?.notice} onClose={() => setPaying(null)} />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.number ?? ''} size="lg"
        footer={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>}>
        {viewing && <InvoiceView invoice={viewing} business={{ name: bp?.legalName || tenant.name, email: bp?.email ?? '', phone: bp?.phone ?? '', address: bp?.address ?? '', paymentInstructions: bp?.paymentInstructions ?? '' }} />}
      </Dialog>
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title={`Void ${voiding?.number}?`} confirmLabel="Void invoice" requireReason pending={voidInv.pending} error={voidInv.error?.message}
        body="The invoice stays in your records marked as void. Its number is not reused."
        onConfirm={async (reason) => { if (voiding && (await voidInv.run({ tenantId, invoiceId: voiding.id, reason }))) { toast('Invoice voided'); setVoiding(null); } }} />
    </>
  );
}

export function InvoicesPage() {
  return <InvoiceList />;
}
