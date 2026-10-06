import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ArrowLeft, NotebookPen, Pin, Plus } from 'lucide-react';
import { emptyLinks, formatIsoDate, type NoteDoc } from '@profjero/shared';
import { createDoc, deleteDocument, updateDocFields } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { useUser } from '@/app/auth';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/ui/primitives';
import { ConfirmDialog, EmptyState, InlineError } from '@/ui/overlays';
import { SafeMarkdown } from '@/ui/SafeMarkdown';
import { useClients, useCourses, useGoals, useNotes, useProjects, type Note } from '../workspace/hooks';

const CATEGORIES: { value: NoteDoc['category']; label: string }[] = [
  { value: 'general', label: 'General' }, { value: 'meeting', label: 'Meeting' }, { value: 'idea', label: 'Idea' },
  { value: 'research', label: 'Research' }, { value: 'study', label: 'Study' }, { value: 'work', label: 'Work' }, { value: 'personal', label: 'Personal' },
];

type Draft = Omit<NoteDoc, 'tags' | 'meeting'> & { tags: string; attendees: string; agenda: string; actionItems: string; meetingDate: string };

function toDraft(n: Partial<NoteDoc>): Draft {
  return {
    title: n.title ?? '', body: n.body ?? '', category: n.category ?? 'general', pinned: n.pinned ?? false, links: n.links ?? emptyLinks,
    tags: (n.tags ?? []).join(', '), attendees: (n.meeting?.attendees ?? []).join(', '), agenda: n.meeting?.agenda ?? '',
    actionItems: (n.meeting?.actionItems ?? []).join('\n'), meetingDate: n.meeting?.date ?? '',
  };
}

function fromDraft(d: Draft): NoteDoc {
  const list = (s: string, sep: string | RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);
  return {
    title: d.title.trim() || 'Untitled', body: d.body, category: d.category, pinned: d.pinned, links: d.links,
    tags: [...new Set(list(d.tags, ','))].slice(0, 20).map((t) => t.slice(0, 40)),
    meeting: d.category === 'meeting'
      ? { date: d.meetingDate || null, attendees: list(d.attendees, ',').slice(0, 50).map((a) => a.slice(0, 80)), agenda: d.agenda, actionItems: list(d.actionItems, '\n').slice(0, 50).map((a) => a.slice(0, 300)) }
      : null,
  };
}

function NoteEditor({ note, initial, onClose }: { note: Note | null; initial: Partial<NoteDoc>; onClose: () => void }) {
  const { tenantId, can } = useTenant();
  const uid = useUser().uid;
  const projects = useProjects().data ?? [];
  const goals = useGoals().data ?? [];
  const clients = useClients().data ?? [];
  const courses = useCourses().data ?? [];
  const [draft, setDraft] = useState<Draft>(toDraft(note ?? initial));
  const [editing, setEditing] = useState(!note);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(toDraft(note ?? initial));
    setEditing(!note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);
  const canWrite = can('workspace.write');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLink = (k: keyof NoteDoc['links'], v: string) => setDraft((d) => ({ ...d, links: { ...d.links, [k]: v || null } }));

  const save = () => {
    try {
      const doc = fromDraft(draft);
      if (note) updateDocFields(tenantId, 'notes', note.id, doc);
      else createDoc(tenantId, 'notes', doc);
      setError(null);
      toast('Note saved');
      if (note) setEditing(false);
      else onClose();
    } catch {
      setError('Some fields are too long. Shorten the title, tags or meeting details.');
    }
  };

  if (!editing && note) {
    return (
      <article className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{note.title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge>{CATEGORIES.find((c) => c.value === note.category)?.label}</Badge>
              {note.tags.map((t) => <Badge key={t} tone="brand">#{t}</Badge>)}
            </div>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
              {(can('workspace.deleteAny') || note.createdBy === uid) && <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>Delete</Button>}
            </div>
          )}
        </div>
        {note.meeting && (
          <div className="mb-4 space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
            {note.meeting.date && <p><span className="text-muted">Date:</span> {formatIsoDate(note.meeting.date, 'long')}</p>}
            {note.meeting.attendees.length > 0 && <p><span className="text-muted">Attendees:</span> {note.meeting.attendees.join(', ')}</p>}
            {note.meeting.agenda && <div><p className="text-muted">Agenda</p><SafeMarkdown text={note.meeting.agenda} /></div>}
            {note.meeting.actionItems.length > 0 && <div><p className="text-muted">Action items</p><ul className="ml-5 list-disc">{note.meeting.actionItems.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
          </div>
        )}
        {note.body ? <SafeMarkdown text={note.body} /> : <p className="text-sm text-muted">This note is empty.</p>}
        <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete note?" body={<>“{note.title}” will be permanently deleted.</>} confirmLabel="Delete"
          onConfirm={() => { deleteDocument(tenantId, 'notes', note.id); setDeleting(false); onClose(); toast('Note deleted'); }} />
      </article>
    );
  }

  return (
    <form className="space-y-4 p-4 sm:p-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {error && <InlineError message={error} />}
      <Field label="Title">{(id) => <Input id={id} autoFocus value={draft.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">{(id) => <Select id={id} value={draft.category} onChange={(e) => set('category', e.target.value as NoteDoc['category'])}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>}</Field>
        <Field label="Tags" hint="Separate with commas.">{(id, d) => <Input id={id} aria-describedby={d} value={draft.tags} onChange={(e) => set('tags', e.target.value)} />}</Field>
      </div>
      {draft.category === 'meeting' && (
        <div className="grid gap-4 rounded-lg border border-line p-3 sm:grid-cols-2">
          <Field label="Meeting date">{(id) => <Input id={id} type="date" value={draft.meetingDate} onChange={(e) => set('meetingDate', e.target.value)} />}</Field>
          <Field label="Attendees" hint="Separate with commas.">{(id, d) => <Input id={id} aria-describedby={d} value={draft.attendees} onChange={(e) => set('attendees', e.target.value)} />}</Field>
          <Field label="Agenda" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={draft.agenda} onChange={(e) => set('agenda', e.target.value)} />}</Field>
          <Field label="Action items" hint="One per line." className="sm:col-span-2">{(id, d) => <Textarea id={id} rows={3} aria-describedby={d} value={draft.actionItems} onChange={(e) => set('actionItems', e.target.value)} />}</Field>
        </div>
      )}
      <Field label="Content" hint="Supports # headings, - lists, - [ ] checklists, **bold** and links.">
        {(id, d) => <Textarea id={id} rows={14} aria-describedby={d} value={draft.body} maxLength={100_000} onChange={(e) => set('body', e.target.value)} className="font-mono text-[13px]" />}
      </Field>
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">Linked to</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Project">{(id) => <Select id={id} value={draft.links.projectId ?? ''} onChange={(e) => setLink('projectId', e.target.value)}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          <Field label="Goal">{(id) => <Select id={id} value={draft.links.goalId ?? ''} onChange={(e) => setLink('goalId', e.target.value)}><option value="">None</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select>}</Field>
          {can('clients.read') && <Field label="Client">{(id) => <Select id={id} value={draft.links.clientId ?? ''} onChange={(e) => setLink('clientId', e.target.value)}><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
          <Field label="Course">{(id) => <Select id={id} value={draft.links.courseId ?? ''} onChange={(e) => setLink('courseId', e.target.value)}><option value="">None</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>}</Field>
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => (note ? setEditing(false) : onClose())}>Cancel</Button>
        <Button type="submit" variant="primary">Save note</Button>
      </div>
    </form>
  );
}

export function NotesPage() {
  const { tenantId, can } = useTenant();
  const notes = useNotes();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const openId = params.get('open');
  const isNew = params.get('new') === '1';
  const initial: Partial<NoteDoc> = { links: { ...emptyLinks, projectId: params.get('projectId'), clientId: params.get('clientId'), courseId: params.get('courseId'), goalId: params.get('goalId'), taskId: null } };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (notes.data ?? [])
      .filter((n) => !category || n.category === category)
      .filter((n) => !term || n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term) || n.tags.some((t) => t.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [notes.data, q, category]);
  const selected = openId ? (notes.data ?? []).find((n) => n.id === openId) ?? null : null;
  const showPane = isNew || !!selected;
  const close = () => setParams({}, { replace: true });

  return (
    <>
      <PageHeader title="Notes" description="Meeting notes, ideas and research — linked to the work they belong to."
        actions={can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>New note</Button>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <Card className={clsx('min-w-0', showPane && 'hidden lg:block')}>
          <div className="space-y-2 border-b border-line p-3">
            <Input placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          {notes.loading ? <Spinner /> : notes.error ? <div className="p-3"><InlineError message={notes.error} /></div> : list.length === 0 ? (
            <EmptyState icon={<NotebookPen className="size-5" />} title="No notes found" />
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
              {list.map((n) => (
                <li key={n.id}>
                  <button onClick={() => setParams({ open: n.id })} className={clsx('w-full px-4 py-3 text-left hover:bg-surface-2', n.id === openId && 'bg-brand-soft')}>
                    <div className="flex items-center gap-1.5">
                      {n.pinned && <Pin className="size-3.5 text-brand" aria-label="Pinned" />}
                      <p className="truncate text-sm font-medium">{n.title}</p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body.slice(0, 160) || 'Empty note'}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className={clsx('min-w-0', !showPane && 'hidden lg:block')}>
          {showPane ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <button onClick={close} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink lg:invisible"><ArrowLeft className="size-4" /> All notes</button>
                {selected && can('workspace.write') && (
                  <Button size="sm" variant="ghost" icon={<Pin className="size-4" />} onClick={() => updateDocFields<NoteDoc>(tenantId, 'notes', selected.id, { pinned: !selected.pinned })}>
                    {selected.pinned ? 'Unpin' : 'Pin'}
                  </Button>
                )}
              </div>
              <NoteEditor note={selected} initial={initial} onClose={close} />
            </>
          ) : (
            <EmptyState icon={<NotebookPen className="size-5" />} title="Select a note" body="Or create a new one." />
          )}
        </Card>
      </div>
    </>
  );
}
