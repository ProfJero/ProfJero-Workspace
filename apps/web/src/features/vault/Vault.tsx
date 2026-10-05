import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLive } from '@/lib/live';
import { toast } from '@/lib/toast';
import { useUser } from '@/app/auth';
import { Button, Card, CardHeader, Field, IconButton, Input, Spinner, Textarea } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Notice } from '@/ui/overlays';
import { PBKDF2_ITERATIONS, checkVerifier, createVerifier, decrypt, deriveKey, encrypt, fromB64, generatePassword, randomBytes, toB64 } from './crypto';

interface KeyMeta { salt: string; iterations: number; verifier: string; verifierIv: string; version: 1 }
interface StoredItem { id: string; ciphertext: string; iv: string; kind: 'login' | 'card' | 'note' }
interface Payload { title: string; username: string; password: string; url: string; notes: string }
type Item = { id: string; kind: StoredItem['kind'] } & Payload;

const AUTO_LOCK_MS = 5 * 60_000;

async function writeItem(uid: string, key: CryptoKey, id: string, kind: StoredItem['kind'], payload: Payload) {
  const { ciphertext, iv } = await encrypt(key, JSON.stringify(payload));
  await setDoc(doc(db, 'users', uid, 'vault', id), { ciphertext, iv, kind, version: 1, updatedAt: serverTimestamp() });
}

/** Moves the legacy plaintext entries into the vault, then deletes the plaintext copies. */
function LegacyMigration({ uid, cryptoKey }: { uid: string; cryptoKey: CryptoKey }) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legacy = useCallback(async () => {
    const [p, n, c] = await Promise.all(['passwords', 'secureNotes', 'paymentCards'].map((col) => getDocs(query(collection(db, col), where('userId', '==', uid))).catch(() => null)));
    return { passwords: p?.docs ?? [], notes: n?.docs ?? [], cards: c?.docs ?? [] };
  }, [uid]);
  useEffect(() => {
    void legacy().then((l) => setCount(l.passwords.length + l.notes.length + l.cards.length));
  }, [legacy]);
  if (!count) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return (
    <Card className="border-warning/40 p-4">
      <p className="font-medium">{count} item(s) from the old app are stored without encryption</p>
      <p className="mt-1 text-sm text-ink-2">Move them into your encrypted vault. The unencrypted copies are deleted afterwards.</p>
      {error && <div className="mt-2"><InlineError message={error} /></div>}
      <Button className="mt-3" variant="primary" loading={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          const l = await legacy();
          for (const d of l.passwords) {
            const x = d.data();
            await writeItem(uid, cryptoKey, `legacy_${d.id}`, 'login', { title: str(x.website ?? x.title ?? x.name ?? 'Login'), username: str(x.username ?? x.email), password: str(x.password), url: str(x.url ?? x.website), notes: str(x.notes) });
            await deleteDoc(d.ref);
          }
          for (const d of l.notes) {
            const x = d.data();
            await writeItem(uid, cryptoKey, `legacy_${d.id}`, 'note', { title: str(x.title ?? 'Secure note'), username: '', password: '', url: '', notes: str(x.content ?? x.notes ?? x.note) });
            await deleteDoc(d.ref);
          }
          for (const d of l.cards) {
            const x = d.data();
            await writeItem(uid, cryptoKey, `legacy_${d.id}`, 'card', { title: str(x.cardName ?? x.name ?? 'Card'), username: str(x.cardholderName ?? x.holder), password: str(x.cardNumber ?? x.number), url: '', notes: [x.expiry ?? x.expiryDate ? `Expiry: ${str(x.expiry ?? x.expiryDate)}` : '', str(x.notes)].filter(Boolean).join('\n') });
            await deleteDoc(d.ref);
          }
          setCount(0);
          toast('Old items encrypted and plaintext copies deleted');
        } catch {
          setError('Some items could not be moved. Nothing already moved is lost — try again.');
        } finally {
          setBusy(false);
        }
      }}>Encrypt and move</Button>
    </Card>
  );
}

function ItemDialog({ open, onOpenChange, item, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; item: Item | null; onSave: (kind: StoredItem['kind'], p: Payload) => Promise<void> }) {
  const [p, setP] = useState<Payload>({ title: '', username: '', password: '', url: '', notes: '' });
  const [kind, setKind] = useState<StoredItem['kind']>('login');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setP(item ? { title: item.title, username: item.username, password: item.password, url: item.url, notes: item.notes } : { title: '', username: '', password: '', url: '', notes: '' }); setKind(item?.kind ?? 'login'); setShow(false); }
  }, [open, item]);
  const set = (k: keyof Payload, v: string) => setP((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Edit item' : 'New item'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!p.title.trim()} onClick={async () => { setBusy(true); try { await onSave(kind, p); onOpenChange(false); } finally { setBusy(false); } }}>Save</Button></>}>
      <div className="space-y-4">
        {!item && (
          <div className="flex gap-2">{(['login', 'note', 'card'] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? 'primary' : 'secondary'} onClick={() => setKind(k)}>{k === 'login' ? 'Login' : k === 'note' ? 'Secure note' : 'Card'}</Button>)}</div>
        )}
        <Field label="Title">{(id) => <Input id={id} autoFocus value={p.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />}</Field>
        {kind !== 'note' && <Field label={kind === 'card' ? 'Cardholder' : 'Username or email'}>{(id) => <Input id={id} autoComplete="off" value={p.username} onChange={(e) => set('username', e.target.value)} />}</Field>}
        {kind !== 'note' && (
          <Field label={kind === 'card' ? 'Card number' : 'Password'}>{(id) => (
            <div className="flex gap-2">
              <Input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={p.password} onChange={(e) => set('password', e.target.value)} />
              <IconButton label={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</IconButton>
              {kind === 'login' && <IconButton label="Generate a strong password" onClick={() => { set('password', generatePassword(20)); setShow(true); }}><RefreshCw className="size-4" /></IconButton>}
            </div>
          )}</Field>
        )}
        {kind === 'login' && <Field label="Website">{(id) => <Input id={id} type="url" value={p.url} onChange={(e) => set('url', e.target.value)} />}</Field>}
        <Field label="Notes">{(id) => <Textarea id={id} rows={3} value={p.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

export function VaultPage() {
  const user = useUser();
  const meta = useLive<(KeyMeta & { id: string }) | null>(['vaultMeta', user.uid], () => doc(db, 'users', user.uid, 'vaultMeta', 'key'));
  const stored = useLive<StoredItem[]>(['vault', user.uid], () => collection(db, 'users', user.uid, 'vault'));
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => { setKey(null); setItems([]); setRevealed(null); }, []);
  // Auto-lock after inactivity and when the tab is hidden for a while.
  useEffect(() => {
    if (!key) return;
    const reset = () => { if (lockTimer.current) clearTimeout(lockTimer.current); lockTimer.current = setTimeout(lock, AUTO_LOCK_MS); };
    reset();
    const events = ['pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => { events.forEach((e) => window.removeEventListener(e, reset)); if (lockTimer.current) clearTimeout(lockTimer.current); };
  }, [key, lock]);
  useEffect(() => lock, [lock]);

  // Decrypt in memory whenever the stored items change.
  useEffect(() => {
    if (!key || !stored.data) return;
    let cancelled = false;
    void Promise.all(stored.data.map(async (s) => {
      try {
        return { id: s.id, kind: s.kind, ...(JSON.parse(await decrypt(key, s.ciphertext, s.iv)) as Payload) };
      } catch {
        return { id: s.id, kind: s.kind, title: '(cannot decrypt)', username: '', password: '', url: '', notes: '' };
      }
    })).then((list) => !cancelled && setItems(list.sort((a, b) => a.title.localeCompare(b.title))));
    return () => { cancelled = true; };
  }, [key, stored.data]);

  if (meta.loading) return <Spinner />;

  const header = (
    <>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Back to workspace</Link>
      <div className="mb-5 flex items-center gap-3">
        <ShieldCheck className="size-7 text-brand" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold">Password vault</h1>
          <p className="text-sm text-ink-2">Private to you. Encrypted on this device before it is saved — we cannot read it.</p>
        </div>
      </div>
    </>
  );

  if (!meta.data) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        {header}
        <Card className="space-y-4 p-5">
          <Notice tone="warning">Choose a master password you will remember. It cannot be reset — if you forget it, the vault cannot be opened by anyone.</Notice>
          {error && <InlineError message={error} />}
          <Field label="Master password" hint="At least 12 characters. A short sentence works well.">{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Field label="Confirm">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
          <Button variant="primary" className="w-full" loading={busy} onClick={async () => {
            if (pw.length < 12) return setError('Use at least 12 characters.');
            if (pw !== pw2) return setError('The passwords do not match.');
            setBusy(true); setError(null);
            try {
              const salt = randomBytes(16);
              const k = await deriveKey(pw, salt);
              await setDoc(doc(db, 'users', user.uid, 'vaultMeta', 'key'), { salt: toB64(salt), iterations: PBKDF2_ITERATIONS, ...(await createVerifier(k)), version: 1 });
              setKey(k); setPw(''); setPw2('');
            } catch { setError('The vault could not be created. Try again.'); } finally { setBusy(false); }
          }}>Create vault</Button>
        </Card>
      </main>
    );
  }

  if (!key) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        {header}
        <Card className="p-5">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              const k = await deriveKey(pw, fromB64(meta.data!.salt), meta.data!.iterations);
              if (await checkVerifier(k, meta.data!.verifier, meta.data!.verifierIv)) { setKey(k); setPw(''); }
              else setError('That master password is not correct.');
            } finally { setBusy(false); }
          }}>
            {error && <InlineError message={error} />}
            <Field label="Master password">{(id) => <Input id={id} type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
            <Button type="submit" variant="primary" className="w-full" icon={<KeyRound className="size-4" />} loading={busy}>Unlock</Button>
          </form>
        </Card>
      </main>
    );
  }

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied — clipboard clears in 30 seconds`, 'info');
    setTimeout(() => { void navigator.clipboard.readText().then(async (t) => { if (t === text) await navigator.clipboard.writeText(''); }).catch(() => undefined); }, 30_000);
  };
  const shown = items.filter((i) => !q.trim() || `${i.title} ${i.username} ${i.url}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      {header}
      <LegacyMigration uid={user.uid} cryptoKey={key} />
      <Card>
        <CardHeader title={`${items.length} item${items.length === 1 ? '' : 's'}`} action={<div className="flex gap-2"><Button size="sm" icon={<Lock className="size-4" />} onClick={lock}>Lock</Button><Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Add</Button></div>} />
        <div className="border-b border-line p-3"><Input aria-label="Search vault" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {shown.length === 0 ? <EmptyState icon={<KeyRound className="size-5" />} title="Nothing here yet" /> : (
          <ul className="divide-y divide-line">
            {shown.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(i)}>
                  <p className="truncate text-sm font-medium">{i.title}</p>
                  <p className="truncate text-xs text-muted">{i.kind === 'note' ? 'Secure note' : i.username || i.url}</p>
                  {revealed === i.id && i.password && <p className="mt-1 break-all font-mono text-sm">{i.password}</p>}
                </button>
                {i.kind !== 'note' && i.username && <IconButton label="Copy username" onClick={() => void copy(i.username, 'Username')}><Copy className="size-4" /></IconButton>}
                {i.password && <IconButton label={revealed === i.id ? 'Hide' : 'Reveal'} onClick={() => setRevealed(revealed === i.id ? null : i.id)}>{revealed === i.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</IconButton>}
                {i.password && <Button size="sm" onClick={() => void copy(i.password, i.kind === 'card' ? 'Card number' : 'Password')}>Copy</Button>}
                <Button size="sm" variant="ghost" onClick={() => setDeleting(i)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ItemDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} item={editing}
        onSave={async (kind, p) => { await writeItem(user.uid, key, editing?.id ?? doc(collection(db, 'users', user.uid, 'vault')).id, kind, p); toast('Saved'); }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete item?" confirmLabel="Delete" body={`“${deleting?.title}” will be permanently deleted.`}
        onConfirm={async () => { if (deleting) { await deleteDoc(doc(db, 'users', user.uid, 'vault', deleting.id)); setDeleting(null); toast('Deleted'); } }} />
    </main>
  );
}

