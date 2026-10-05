import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Landmark, MoreHorizontal, Plus, ShieldCheck } from 'lucide-react';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, minorToDecimalString, netPosition, sumMinor } from '@profjero/shared';
import { useAction } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Select, Spinner, StatTile } from '@/ui/primitives';
import { Dialog, EmptyState, InlineError, Menu, Notice } from '@/ui/overlays';
import { Money, MoneyInput, moneyError, toMinor } from '@/ui/money';
import { useAccounts, useDebts, type StoredAccount } from './data';

function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account: StoredAccount | null }) {
  const { tenantId, currency } = useTenant();
  const create = useAction('createAccount');
  const update = useAction('updateAccount');
  const action = account ? update : create;
  const schema = z.object({
    name: z.string().trim().min(1, 'Name the account').max(60),
    type: z.enum(ACCOUNT_TYPES),
    opening: z.string().refine((v) => moneyError(v, currency, { allowZero: true, allowNegative: true }) === null, 'Enter an amount like 1,250.00 (negative for money owed on a credit account)'),
  });
  const defaults = (a: StoredAccount | null) => ({ name: a?.name ?? '', type: a?.type ?? 'mobile_money', opening: a ? minorToDecimalString(a.openingBalanceMinor, currency) : '0' });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(account) });
  useEffect(() => {
    if (open) { f.reset(defaults(account)); action.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit(async (v) => {
    const openingBalanceMinor = toMinor(v.opening, currency, true);
    const r = account
      ? await update.run({ tenantId, accountId: account.id, changes: { name: v.name, type: v.type, openingBalanceMinor } })
      : await create.run({ tenantId, account: { name: v.name, type: v.type, currency, openingBalanceMinor } });
    if (r) { toast(account ? 'Account updated' : 'Account added'); onOpenChange(false); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={account ? 'Edit account' : 'New account'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={action.pending} onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        {action.error && <InlineError message={action.error.message} />}
        <Field label="Name" required error={e.name?.message}>{(id) => <Input id={id} autoFocus placeholder="e.g. MTN MoMo, GCB Current" invalid={!!e.name} {...f.register('name')} />}</Field>
        <Field label="Type">{(id) => <Select id={id} {...f.register('type')}>{ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}</Select>}</Field>
        <Field label="Opening balance" hint="The balance before the first transaction you record here." error={e.opening?.message}>
          {(id, d) => <MoneyInput id={id} currency={currency} aria-describedby={d} invalid={!!e.opening} {...f.register('opening')} />}
        </Field>
        {account && <Notice>Changing the opening balance shifts the current balance by the same amount. It is recorded in the audit log.</Notice>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

interface ReconcileRow { accountId: string; name: string; storedMinor: number; computedMinor: number; driftMinor: number }

function Reconcile() {
  const { tenantId, currency } = useTenant();
  const check = useAction<{ accounts: ReconcileRow[] }>('reconcileAccounts');
  const [rows, setRows] = useState<ReconcileRow[] | null>(null);
  const drift = rows?.filter((r) => r.driftMinor !== 0) ?? [];
  return (
    <Card>
      <CardHeader title="Balance check" description="Recomputes every balance from the full transaction history and compares it with the stored balance." />
      <div className="space-y-3 p-4">
        {check.error && <InlineError message={check.error.message} />}
        {rows && (drift.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-good-ink"><CheckCircle2 className="size-4" /> All {rows.length} balances match the ledger exactly.</p>
        ) : (
          <div className="space-y-2">
            <Notice tone="warning">{drift.length} account(s) differ from their transaction history.</Notice>
            <ul className="text-sm">{drift.map((r) => <li key={r.accountId}>{r.name}: stored <Money minor={r.storedMinor} currency={currency} />, ledger <Money minor={r.computedMinor} currency={currency} /></li>)}</ul>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" icon={<ShieldCheck className="size-4" />} loading={check.pending} onClick={async () => { const r = await check.run({ tenantId, fix: false }); if (r) setRows(r.accounts); }}>Run check</Button>
          {drift.length > 0 && <Button size="sm" variant="primary" loading={check.pending} onClick={async () => { const r = await check.run({ tenantId, fix: true }); if (r) { setRows(r.accounts.map((a) => ({ ...a, storedMinor: a.computedMinor, driftMinor: 0 }))); toast('Balances corrected from the ledger'); } }}>Correct from ledger</Button>}
        </div>
      </div>
    </Card>
  );
}

export function AccountsPage() {
  const { tenantId, currency, can } = useTenant();
  const accounts = useAccounts();
  const debts = useDebts().data ?? [];
  const update = useAction('updateAccount');
  const [editing, setEditing] = useState<StoredAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = (accounts.data ?? []).filter((a) => showArchived || !a.archived).sort((a, b) => a.name.localeCompare(b.name));
  const pos = netPosition((accounts.data ?? []).filter((a) => !a.archived), debts, currency);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In accounts" value={<Money minor={pos.accountsMinor} currency={currency} />} />
        <StatTile label="Owed to me" value={<Money minor={pos.receivablesMinor} currency={currency} />} />
        <StatTile label="I owe" value={<Money minor={pos.payablesMinor} currency={currency} />} />
        <StatTile label="Net position" value={<Money minor={pos.netMinor} currency={currency} />} tone={pos.netMinor < 0 ? 'critical' : undefined} />
      </div>
      <Card className="mb-4">
        <CardHeader title="Accounts" description="Transfers between accounts move money without changing your net position."
          action={<div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived</label>
            {can('finance.manage') && <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Add</Button>}
          </div>} />
        {accounts.loading ? <Spinner /> : list.length === 0 ? (
          <EmptyState icon={<Landmark className="size-5" />} title="No accounts yet" body="Add Cash, Mobile Money and bank accounts so every balance is traceable." action={can('finance.manage') && <Button onClick={() => setCreating(true)}>Add an account</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name} {a.archived && <Badge>Archived</Badge>}</p>
                  <p className="text-xs text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</p>
                </div>
                <Money minor={a.balanceMinor} currency={a.currency} className={a.balanceMinor < 0 ? 'text-critical-ink font-semibold' : 'font-semibold'} />
                {can('finance.manage') && (
                  <Menu label={`Actions for ${a.name}`} trigger={<IconButton label={`Actions for ${a.name}`}><MoreHorizontal className="size-4" /></IconButton>} items={[
                    { label: 'Edit', onSelect: () => setEditing(a) },
                    { label: a.archived ? 'Unarchive' : 'Archive', onSelect: async () => {
                      if (await update.run({ tenantId, accountId: a.id, changes: { archived: !a.archived } })) toast(a.archived ? 'Account restored' : 'Account archived');
                    } },
                  ]} />
                )}
              </li>
            ))}
            <li className="flex justify-between bg-surface-2 px-4 py-2.5 text-sm font-semibold sm:px-5"><span>Total</span><Money minor={sumMinor(list.filter((a) => !a.archived).map((a) => a.balanceMinor))} currency={currency} /></li>
          </ul>
        )}
        {update.error && <div className="p-3"><InlineError message={update.error.message} /></div>}
      </Card>
      {can('finance.manage') && <Reconcile />}
      <AccountDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} account={editing} />
    </>
  );
}
