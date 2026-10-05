import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { speechChunks, type CleanPage, type DocumentDoc, type StudySessionDoc } from '@profjero/shared';
import { createDoc, updateDocFields, useTenantDoc } from '@/lib/data';
import { toast } from '@/lib/toast';
import { useTenant } from '@/app/tenant';
import { Button, Card, Field, IconButton, Input, PageHeader, Select, Spinner } from '@/ui/primitives';
import { EmptyState, InlineError, Notice } from '@/ui/overlays';
import { loadDocumentText } from './documents';

interface Cursor { page: number; paragraph: number }

/**
 * Study Companion reader. Text was cleaned at upload (page numbers, running
 * headers, URLs and citations removed; wrapped lines re-joined), and speech is
 * produced sentence by sentence so punctuation creates natural pauses and
 * engines that cut off long utterances never truncate a sentence.
 */
export function ReaderPage() {
  const { id = '' } = useParams();
  const { tenantId, today, can } = useTenant();
  const meta = useTenantDoc<DocumentDoc>(tenantId, 'documents', id);
  const [pages, setPages] = useState<CleanPage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Cursor>({ page: 1, paragraph: 0 });
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 1, to: 1 });
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [listenedMs, setListenedMs] = useState(0);
  const playing = useRef(false);
  const startedAt = useRef<number | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load the processed text once.
  const textPath = meta.data?.textPath;
  useEffect(() => {
    if (!textPath) return;
    let cancelled = false;
    loadDocumentText(textPath)
      .then((p) => {
        if (cancelled) return;
        setPages(p);
        const pos = meta.data?.position ?? { page: 1, paragraph: 0 };
        setCursor({ page: Math.min(pos.page, p.length) || 1, paragraph: pos.paragraph });
        setRange({ from: 1, to: p.length });
      })
      .catch(() => !cancelled && setLoadError('The document text could not be loaded.'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textPath]);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (!voiceURI) setVoiceURI((v.find((x) => x.lang.startsWith('en') && x.localService) ?? v.find((x) => x.lang.startsWith('en')) ?? v[0])?.voiceURI ?? '');
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported, voiceURI]);

  // Persist reading position (debounced) so the user can resume on any device.
  useEffect(() => {
    if (!pages || !can('workspace.write')) return;
    const t = setTimeout(() => updateDocFields<DocumentDoc>(tenantId, 'documents', id, { position: cursor }), 2500);
    return () => clearTimeout(t);
  }, [cursor, pages, tenantId, id, can]);

  const stopClock = () => {
    if (startedAt.current !== null) {
      const elapsed = Date.now() - startedAt.current;
      startedAt.current = null;
      setListenedMs((m) => m + elapsed);
    }
  };

  const stop = useCallback(() => {
    playing.current = false;
    if (supported) window.speechSynthesis.cancel();
    stopClock();
    setState('idle');
  }, [supported]);
  useEffect(() => stop, [stop]);

  const next = (c: Cursor): Cursor | null => {
    if (!pages) return null;
    const page = pages[c.page - 1];
    if (page && c.paragraph + 1 < page.paragraphs.length) return { page: c.page, paragraph: c.paragraph + 1 };
    for (let p = c.page + 1; p <= range.to; p++) if ((pages[p - 1]?.paragraphs.length ?? 0) > 0) return { page: p, paragraph: 0 };
    return null;
  };
  const prev = (c: Cursor): Cursor | null => {
    if (!pages) return null;
    if (c.paragraph > 0) return { page: c.page, paragraph: c.paragraph - 1 };
    for (let p = c.page - 1; p >= range.from; p--) { const n = pages[p - 1]?.paragraphs.length ?? 0; if (n > 0) return { page: p, paragraph: n - 1 }; }
    return null;
  };

  const speakFrom = (c: Cursor) => {
    if (!pages || !supported) return;
    const text = pages[c.page - 1]?.paragraphs[c.paragraph];
    if (text === undefined) { const n = next(c); if (n) speakFrom(n); else stop(); return; }
    setCursor(c);
    const chunks = speechChunks(text);
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = rate;
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      if (i === chunks.length - 1) {
        u.onend = () => {
          if (!playing.current) return;
          const n = next(c);
          if (n) setTimeout(() => playing.current && speakFrom(n), 300); // paragraph pause
          else { stop(); toast('Finished reading the selected pages', 'info'); }
        };
      }
      u.onerror = (ev) => { if (ev.error !== 'interrupted' && ev.error !== 'canceled') stop(); };
      window.speechSynthesis.speak(u);
    });
  };

  const play = () => {
    if (!supported) return;
    if (state === 'paused') { window.speechSynthesis.resume(); startedAt.current = Date.now(); setState('playing'); return; }
    window.speechSynthesis.cancel();
    playing.current = true;
    startedAt.current = Date.now();
    setState('playing');
    const start = cursor.page < range.from || cursor.page > range.to ? { page: range.from, paragraph: 0 } : cursor;
    speakFrom(start);
  };
  const pause = () => { window.speechSynthesis.pause(); stopClock(); setState('paused'); };
  const jump = (c: Cursor | null) => {
    if (!c) return;
    if (state !== 'idle') { window.speechSynthesis.cancel(); playing.current = true; speakFrom(c); } else setCursor(c);
  };

  if (meta.loading) return <Spinner />;
  if (!meta.data) return <EmptyState title="Document not found" action={<Link className="text-brand" to={`/w/${tenantId}/learning`}>Back to learning</Link>} />;
  const page = pages?.[cursor.page - 1];
  const minutes = Math.floor(listenedMs / 60_000);

  return (
    <>
      <Link to={`/w/${tenantId}/learning`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Learning</Link>
      <PageHeader title={meta.data.title} description={`${meta.data.pageCount} pages`} />
      {!supported && <div className="mb-4"><Notice tone="warning">This browser cannot read text aloud. You can still read the cleaned text here.</Notice></div>}
      {loadError && <InlineError message={loadError} />}
      {!pages ? (!loadError && <Spinner label="Loading text" />) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="min-w-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <IconButton label="Previous page" disabled={cursor.page <= 1} onClick={() => jump({ page: cursor.page - 1, paragraph: 0 })}><ChevronLeft className="size-4" /></IconButton>
              <span className="text-sm text-ink-2">Page {cursor.page} of {pages.length}</span>
              <IconButton label="Next page" disabled={cursor.page >= pages.length} onClick={() => jump({ page: cursor.page + 1, paragraph: 0 })}><ChevronRight className="size-4" /></IconButton>
            </div>
            <article className="space-y-3 p-4 text-[15px] leading-relaxed sm:p-6" aria-live="off">
              {page && page.paragraphs.length > 0 ? page.paragraphs.map((p, i) => (
                <p key={i} onClick={() => jump({ page: cursor.page, paragraph: i })}
                  className={clsx('cursor-pointer rounded-md px-2 py-1 transition-colors', i === cursor.paragraph ? 'bg-brand-soft' : 'hover:bg-surface-2')}
                  aria-current={i === cursor.paragraph ? 'true' : undefined}>
                  {p}
                </p>
              )) : <p className="text-sm text-muted">No readable text on this page.</p>}
            </article>
          </Card>
          <div className="space-y-4">
            <Card className="space-y-4 p-4 lg:sticky lg:top-20">
              <div className="flex items-center justify-center gap-2">
                <IconButton label="Previous paragraph" onClick={() => jump(prev(cursor))}><SkipBack className="size-4" /></IconButton>
                {state === 'playing' ? (
                  <Button variant="primary" icon={<Pause className="size-4" />} onClick={pause} disabled={!supported}>Pause</Button>
                ) : (
                  <Button variant="primary" icon={<Play className="size-4" />} onClick={play} disabled={!supported}>{state === 'paused' ? 'Resume' : 'Listen'}</Button>
                )}
                <IconButton label="Stop" onClick={stop} disabled={state === 'idle'}><Square className="size-4" /></IconButton>
                <IconButton label="Next paragraph" onClick={() => jump(next(cursor))}><SkipForward className="size-4" /></IconButton>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From page">{(fid) => <Input id={fid} type="number" min={1} max={range.to} value={range.from} onChange={(e) => { const v = Math.max(1, Math.min(Number(e.target.value) || 1, range.to)); setRange({ ...range, from: v }); }} />}</Field>
                <Field label="To page">{(fid) => <Input id={fid} type="number" min={range.from} max={pages.length} value={range.to} onChange={(e) => { const v = Math.min(pages.length, Math.max(Number(e.target.value) || range.from, range.from)); setRange({ ...range, to: v }); }} />}</Field>
              </div>
              <Field label={`Speed: ${rate.toFixed(2)}×`}>{(fid) => <input id={fid} type="range" min={0.6} max={1.8} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-[var(--brand)]" disabled={state === 'playing'} />}</Field>
              {voices.length > 0 && (
                <Field label="Voice">{(fid) => <Select id={fid} value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)} disabled={state === 'playing'}>{voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</Select>}</Field>
              )}
              {minutes >= 1 && state === 'idle' && can('workspace.write') && (
                <Button className="w-full" onClick={() => {
                  createDoc<StudySessionDoc>(tenantId, 'studySessions', { date: today, minutes: Math.min(1440, minutes), courseId: meta.data!.courseId, documentId: id, topic: meta.data!.title.slice(0, 200), notes: '' });
                  setListenedMs(0);
                  toast(`Logged ${minutes} minutes of study`);
                }}>Log {minutes} min as a study session</Button>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
