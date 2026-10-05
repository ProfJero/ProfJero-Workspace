import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { formatIsoDate, isIsoDate, minorToDecimalString, todayInZone, toUserError, type CurrencyCode } from '@profjero/shared';
import { call, useAction } from '@/lib/api';
import { Badge, Button, Card, Field, Input, Select, Spinner } from '@/ui/primitives';
import { Dialog, InlineError, Notice } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { InvoiceView, type Invoice } from '../finance/invoices';

interface PortalInvoice extends Omit<Invoice, 'clientId' | 'clientName' | 'clientSnapshot' | 'projectId' | 'lineTotalsMinor'> {
  id: string;
  lines: (Invoice['lines'][number] & { totalMinor: number })[];
}
interface PortalData {
  business: { name: string; email: string; phone: string; address: string; paymentInstructions: string };
  client: { name: string };
  invoices: PortalInvoice[];
  pendingNotices: { id: string; invoiceId: string; amountMinor: number; paidOn: string }[];
}

const METHODS = { mobile_money: 'Mobile Money', bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', cheque: 'Cheque', other: 'Other' } as const;

/**
 * Public client portal. The access token travels in the URL fragment (never
 * sent to servers or in Referer headers) and is checked by the server on every
 * call; the server returns only this client's issued invoices.
 */
function PayDialog({ token, invoice, pending, onClose, onDone }: { token: string; invoice: PortalInvoice | null; pending: number; onClose: () => void; onDone: () => void }) {
  const currency = (invoice?.currency ?? 'GHS') as CurrencyCode;
  const due = invoice ? invoice.totalMinor - invoice.paidMinor - pending : 0;
  const action = useAction('portalSubmitPaymentNotice');
  const today = todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const schema = z.object({
    amount: z.string().superRefine((v, ctx) => {
      const m = moneyError(v, currency);
      if (m) ctx.addIssue({ code: 'custom', message: m });
      else if (toMinor(v, currency) > due) ctx.addIssue({ code: 'custom', message: 'More than the balance due' });
    }),
    method: z.enum(Object.keys(METHODS) as [keyof typeof METHODS]),
    reference: z.string().trim().min(1, 'Enter the transaction reference').max(120),
    paidOn: z.string().refine((v) => isIsoDate(v) && v <= today, 'Choose the date you paid'),
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { amount: '', method: 'mobile_money' as const, reference: '', paidOn: today } });
  useEffect(() => {
    if (invoice) { f.reset({ amount: minorToDecimalString(Math.max(0, due), currency), method: 'mobile_money', reference: '', paidOn: today }); action.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);
  const e = f.formState.errors;
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()} title={`Report a payment for ${invoice?.number}`} size="sm"
      description="This tells the business you have paid. They will confirm once the money arrives."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void f.handleSubmit(async (v) => {
        if (!invoice) return;
        const r = await action.run({ token, invoiceId: invoice.id, amountMinor: toMinor(v.amount, currency), method: v.method, reference: v.reference, paidOn: v.paidOn });
        if (r) onDone();
      })()}>Submit</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => ev.preventDefault()}>
        {action.error && <InlineError message={action.error.message} />}
        <Field label="Amount paid" error={e.amount?.message}>{(id) => <MoneyInput id={id} currency={currency} invalid={!!e.amount} {...f.register('amount')} />}</Field>
        <Field label="How you paid">{(id) => <Select id={id} {...f.register('method')}>{Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Transaction reference" hint="e.g. the MoMo transaction ID" error={e.reference?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!e.reference} {...f.register('reference')} />}</Field>
        <Field label="Date paid" error={e.paidOn?.message}>{(id) => <Input id={id} type="date" max={today} {...f.register('paidOn')} />}</Field>
      </form>
    </Dialog>
  );
}

export function PortalPage() {
  const token = window.location.hash.replace(/^#/, '');
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PortalInvoice | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => {
    try {
      setData(await call<PortalData>('portalGetInvoices', { token }));
      setError(null);
    } catch (e) {
      setError(toUserError(e).message);
    }
  };
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) setError('This link is invalid or has expired. Ask the sender for a new one.');
    else void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) return <main className="mx-auto max-w-md px-4 py-20"><InlineError title="Can’t open this page" message={error} /></main>;
  if (!data) return <Spinner label="Loading your invoices" />;
  const pendingFor = (id: string) => data.pendingNotices.filter((n) => n.invoiceId === id).reduce((a, n) => a + n.amountMinor, 0);
  const viewing = data.invoices.find((i) => i.id === open);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <header>
        <p className="text-sm text-muted">Invoices from</p>
        <h1 className="text-xl font-semibold">{data.business.name}</h1>
        <p className="text-sm text-ink-2">for {data.client.name}</p>
      </header>
      {data.invoices.length === 0 ? <Card className="p-6 text-center text-sm text-muted">There are no invoices for you at the moment.</Card> : (
        <Card>
          <ul className="divide-y divide-line">
            {data.invoices.map((inv) => {
              const pending = pendingFor(inv.id);
              const due = inv.totalMinor - inv.paidMinor;
              const cur = inv.currency as CurrencyCode;
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(inv.id)}>
                    <p className="text-sm font-medium">{inv.number}</p>
                    <p className="text-xs text-muted">Issued {formatIsoDate(inv.issueDate)}{inv.dueDate ? ` · due ${formatIsoDate(inv.dueDate)}` : ''}</p>
                  </button>
                  <div className="text-right text-sm">
                    <Money minor={due} currency={cur} className="font-semibold" />
                    <p className="text-xs text-muted">of <Money minor={inv.totalMinor} currency={cur} /></p>
                  </div>
                  {inv.status === 'paid' ? <Badge tone="good" icon={<CheckCircle2 className="size-3" />}>Paid</Badge>
                    : pending >= due ? <Badge tone="warning">Payment being confirmed</Badge>
                    : <Button size="sm" variant="primary" onClick={() => setPaying(inv)}>I’ve paid</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {data.business.paymentInstructions && <Notice><span className="whitespace-pre-line">{data.business.paymentInstructions}</span></Notice>}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setOpen(null)} title={viewing?.number ?? ''} size="lg" footer={<Button onClick={() => window.print()}>Print</Button>}>
        {viewing && <InvoiceView business={data.business} invoice={{ ...viewing, clientName: data.client.name, lineTotalsMinor: viewing.lines.map((l) => l.totalMinor) }} />}
      </Dialog>
      <PayDialog token={token} invoice={paying} pending={paying ? pendingFor(paying.id) : 0} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void load(); }} />
    </main>
  );
}
