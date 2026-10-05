import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { orderBy, where } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { BookOpen, FileText, GraduationCap, MoreHorizontal, Plus, Upload } from 'lucide-react';
import {
  COURSE_STATUSES,
  addDays,
  courseProgress,
  estimateReadingMinutes,
  formatIsoDate,
  isIsoDate,
  startOfWeek,
  studyStreak,
  type CourseDoc,
  type DocumentDoc,
  type StudySessionDoc,
} from '@profjero/shared';
import { storage } from '@/lib/firebase';
import { createDoc, deleteDocument, updateDocFields, useTenantCollection, type WithMeta } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, PageHeader, ProgressBar, Select, Spinner, StatTile, Textarea, type Tone } from '@/ui/primitives';
import { ConfirmDialog, Dialog, EmptyState, InlineError, Menu, Tabs } from '@/ui/overlays';
import { useCourses, useGoals, type Course } from '../workspace/hooks';
import { uploadDocument, validateUpload } from './documents';

const STATUS: Record<CourseDoc['status'], { label: string; tone: Tone }> = {
  planned: { label: 'Planned', tone: 'neutral' }, in_progress: { label: 'In progress', tone: 'brand' }, paused: { label: 'Paused', tone: 'warning' }, completed: { label: 'Completed', tone: 'good' },
};
export type StudyDocument = WithMeta<DocumentDoc>;
export const useDocuments = () => useTenantCollection<DocumentDoc>(useTenant().tenantId, 'documents', ['all'], [orderBy('createdAt', 'desc')]);

// ───────────────────────────── Courses ─────────────────────────────

function CourseDialog({ open, onOpenChange, course }: { open: boolean; onOpenChange: (o: boolean) => void; course: Course | null }) {
  const { tenantId } = useTenant();
  const goals = useGoals().data ?? [];
  const schema = z.object({
    title: z.string().trim().min(1, 'Name the course').max(200), provider: z.string().max(120),
    url: z.string().trim().refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'Use a full http(s) link'),
    status: z.enum(COURSE_STATUSES), level: z.enum(['beginner', 'intermediate', 'advanced']),
    totalUnits: z.coerce.number().int().min(0).max(10_000), completedUnits: z.coerce.number().int().min(0).max(10_000),
    goalId: z.string(), targetDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Invalid date'), notes: z.string().max(5000),
  }).refine((v) => v.completedUnits <= v.totalUnits || v.totalUnits === 0, { path: ['completedUnits'], message: 'More than the total' });
  const defaults = (c: Course | null) => ({
    title: c?.title ?? '', provider: c?.provider ?? '', url: c?.url ?? '', status: c?.status ?? 'in_progress', level: c?.level ?? 'beginner',
    totalUnits: c?.totalUnits ?? 0, completedUnits: c?.completedUnits ?? 0, goalId: c?.goalId ?? '', targetDate: c?.targetDate ?? '', notes: c?.notes ?? '',
  });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: defaults(course) });
  useEffect(() => {
    if (open) f.reset(defaults(course));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course?.id]);
  const e = f.formState.errors;
  const submit = f.handleSubmit((v) => {
    const d: CourseDoc = { ...v, goalId: v.goalId || null, targetDate: v.targetDate || null };
    if (course) updateDocFields(tenantId, 'courses', course.id, d);
    else createDoc(tenantId, 'courses', d);
    toast(course ? 'Course updated' : 'Course added');
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={course ? 'Edit course' : 'New course'} size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void submit()}>Save</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <Field label="Course" required error={e.title?.message} className="sm:col-span-2">{(id) => <Input id={id} autoFocus invalid={!!e.title} {...f.register('title')} />}</Field>
        <Field label="Provider">{(id) => <Input id={id} placeholder="e.g. Coursera, KNUST" {...f.register('provider')} />}</Field>
        <Field label="Link" error={e.url?.message}>{(id) => <Input id={id} type="url" invalid={!!e.url} {...f.register('url')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...f.register('status')}>{COURSE_STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</Select>}</Field>
        <Field label="Level">{(id) => <Select id={id} {...f.register('level')}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>}</Field>
        <Field label="Total units" hint="Modules, chapters or lessons.">{(id, d) => <Input id={id} type="number" min={0} aria-describedby={d} {...f.register('totalUnits')} />}</Field>
        <Field label="Completed units" error={e.completedUnits?.message}>{(id) => <Input id={id} type="number" min={0} {...f.register('completedUnits')} />}</Field>
        <Field label="Goal">{(id) => <Select id={id} {...f.register('goalId')}><option value="">None</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select>}</Field>
        <Field label="Finish by">{(id) => <Input id={id} type="date" {...f.register('targetDate')} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} {...f.register('notes')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function Courses() {
  const { tenantId, can } = useTenant();
  const courses = useCourses();
  const [editing, setEditing] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);
  const list = (courses.data ?? []).sort((a, b) => COURSE_STATUSES.indexOf(a.status) - COURSE_STATUSES.indexOf(b.status));
  return (
    <>
      <div className="mb-4 flex justify-end">{can('workspace.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New course</Button>}</div>
      {courses.loading ? <Spinner /> : list.length === 0 ? <Card><EmptyState icon={<GraduationCap className="size-5" />} title="No courses yet" body="Track courses, certifications and self-study plans." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => {
            const pct = courseProgress(c);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="font-semibold">{c.title}</h3><p className="text-xs text-muted">{[c.provider, c.level].filter(Boolean).join(' · ')}</p></div>
                  <div className="flex items-center gap-1">
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                    {can('workspace.write') && <Menu label={`Actions for ${c.title}`} trigger={<IconButton label={`Actions for ${c.title}`}><MoreHorizontal className="size-4" /></IconButton>} items={[
                      { label: 'Edit', onSelect: () => setEditing(c) },
                      { label: 'Delete', danger: true, onSelect: () => { deleteDocument(tenantId, 'courses', c.id); toast('Course deleted'); } },
                    ]} />}
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-xs text-ink-2"><span>{c.totalUnits ? `${c.completedUnits} of ${c.totalUnits} units` : 'No units set'}</span><span className="tabular">{pct}%</span></div>
                <ProgressBar className="mt-1" value={pct} tone={c.status === 'completed' ? 'good' : 'brand'} label={`${c.title} progress`} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {can('workspace.write') && c.status !== 'completed' && c.totalUnits > 0 && c.completedUnits < c.totalUnits && (
                    <Button size="sm" onClick={() => updateDocFields<CourseDoc>(tenantId, 'courses', c.id, { completedUnits: c.completedUnits + 1, status: c.completedUnits + 1 >= c.totalUnits ? 'completed' : 'in_progress' })}>+1 unit done</Button>
                  )}
                  {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center text-sm text-brand hover:underline">Open course</a>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <CourseDialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} course={editing} />
    </>
  );
}

// ───────────────────────────── Sessions ─────────────────────────────

function Sessions() {
  const { tenantId, today, can } = useTenant();
  const courses = useCourses().data ?? [];
  const docs = useDocuments().data ?? [];
  const since = addDays(today, -89);
  const sessions = useTenantCollection<StudySessionDoc>(tenantId, 'studySessions', ['since', since], [where('date', '>=', since), orderBy('date', 'desc')]);
  const list = sessions.data ?? [];
  const week = list.filter((s) => s.date >= startOfWeek(today)).reduce((a, s) => a + s.minutes, 0);
  const month = list.filter((s) => s.date >= addDays(today, -29)).reduce((a, s) => a + s.minutes, 0);
  const schema = z.object({ date: z.string().refine(isIsoDate, 'Choose a date'), minutes: z.coerce.number().int().min(1, 'At least 1 minute').max(1440), courseId: z.string(), topic: z.string().max(200), notes: z.string().max(5000) });
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { date: today, minutes: 30, courseId: '', topic: '', notes: '' } });
  const e = f.formState.errors;
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <StatTile label="This week" value={fmt(week)} />
          <StatTile label="Last 30 days" value={fmt(month)} />
          <StatTile label="Streak" value={`${studyStreak(list.map((s) => s.date), today)} days`} />
        </div>
        {can('workspace.write') && (
          <Card>
            <CardHeader title="Log a study session" />
            <form noValidate className="space-y-3 p-4" onSubmit={f.handleSubmit((v) => {
              createDoc<StudySessionDoc>(tenantId, 'studySessions', { ...v, courseId: v.courseId || null, documentId: null });
              toast('Session logged');
              f.reset({ date: today, minutes: 30, courseId: v.courseId, topic: '', notes: '' });
            })}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" error={e.date?.message}>{(id) => <Input id={id} type="date" {...f.register('date')} />}</Field>
                <Field label="Minutes" error={e.minutes?.message}>{(id) => <Input id={id} type="number" min={1} max={1440} {...f.register('minutes')} />}</Field>
              </div>
              <Field label="Course">{(id) => <Select id={id} {...f.register('courseId')}><option value="">None</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>}</Field>
              <Field label="Topic">{(id) => <Input id={id} {...f.register('topic')} />}</Field>
              <Field label="Notes">{(id) => <Textarea id={id} rows={2} {...f.register('notes')} />}</Field>
              <Button type="submit" variant="primary" className="w-full">Log session</Button>
            </form>
          </Card>
        )}
      </div>
      <Card className="lg:col-span-2">
        <CardHeader title="Recent sessions" description="Last 90 days." />
        {list.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No study sessions logged.</p> : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium">{s.topic || courses.find((c) => c.id === s.courseId)?.title || docs.find((d) => d.id === s.documentId)?.title || 'Study'}</p>
                  <p className="text-xs text-muted">{formatIsoDate(s.date)}{s.courseId ? ` · ${courses.find((c) => c.id === s.courseId)?.title ?? ''}` : ''}</p>
                  {s.notes && <p className="mt-1 whitespace-pre-wrap text-ink-2">{s.notes}</p>}
                </div>
                <span className="tabular whitespace-nowrap text-ink-2">{s.minutes} min</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────── Documents ─────────────────────────────

function Documents() {
  const { tenantId, can } = useTenant();
  const docs = useDocuments();
  const courses = useCourses().data ?? [];
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('');
  const [deleting, setDeleting] = useState<StudyDocument | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const v = await validateUpload(file);
    if (!v.ok) { setError(v.error); return; }
    try {
      await uploadDocument(tenantId, file, v.contentType, file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Document', courseId || null, setStage);
      toast('Document ready');
    } catch {
      setError('The upload failed. Check your connection and try again.');
    } finally {
      setStage(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      {can('workspace.write') && (
        <Card className="mb-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-medium">Add study material</p>
              <p className="text-xs text-muted">PDF, Word (.docx) or text, up to 25 MB. Text is extracted on your device; files stay private to this workspace.</p>
            </div>
            <Select aria-label="Link to course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="sm:w-56"><option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
            <input ref={input} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Choose a file" />
            <Button variant="primary" icon={<Upload className="size-4" />} loading={!!stage} onClick={() => input.current?.click()}>{stage ?? 'Upload'}</Button>
          </div>
          {error && <div className="mt-3"><InlineError message={error} /></div>}
        </Card>
      )}
      <Card>
        {docs.loading ? <Spinner /> : (docs.data ?? []).length === 0 ? <EmptyState icon={<FileText className="size-5" />} title="No documents yet" body="Upload lecture notes or a textbook chapter and listen to it, page by page." /> : (
          <ul className="divide-y divide-line">
            {(docs.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  {d.status === 'processed' ? <Link to={`/w/${tenantId}/learning/documents/${d.id}`} className="block truncate text-sm font-medium hover:underline">{d.title}</Link> : <p className="truncate text-sm font-medium">{d.title}</p>}
                  <p className="text-xs text-muted">
                    {d.status === 'processed' ? `${d.pageCount} pages · about ${estimateReadingMinutes(d.wordCount)} min listening · at page ${d.position.page}` : d.status === 'failed' ? 'Text could not be extracted (scanned PDFs need OCR)' : 'Processing…'}
                  </p>
                </div>
                {d.status === 'processed' && <Link to={`/w/${tenantId}/learning/documents/${d.id}`}><Button size="sm" icon={<BookOpen className="size-4" />}>Read</Button></Link>}
                {can('workspace.write') && <Menu label={`Actions for ${d.title}`} trigger={<IconButton label={`Actions for ${d.title}`}><MoreHorizontal className="size-4" /></IconButton>} items={[{ label: 'Delete', danger: true, onSelect: () => setDeleting(d) }]} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete document?" confirmLabel="Delete" body="The file and its extracted text are permanently deleted."
        onConfirm={async () => {
          if (!deleting) return;
          await Promise.allSettled([deleteObject(ref(storage, deleting.storagePath)), deleting.textPath ? deleteObject(ref(storage, deleting.textPath)) : Promise.resolve()]);
          deleteDocument(tenantId, 'documents', deleting.id);
          setDeleting(null);
          toast('Document deleted');
        }} />
    </>
  );
}

export function LearningPage() {
  const [tab, setTab] = useState('documents');
  return (
    <>
      <PageHeader title="Learning" description="Courses, study time and the Study Companion for your reading material." />
      <Tabs className="mb-4" value={tab} onValueChange={setTab} tabs={[{ value: 'documents', label: 'Study Companion' }, { value: 'courses', label: 'Courses' }, { value: 'sessions', label: 'Study sessions' }]} />
      {tab === 'documents' ? <Documents /> : tab === 'courses' ? <Courses /> : <Sessions />}
    </>
  );
}
