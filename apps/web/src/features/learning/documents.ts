import { doc, collection } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  cleanDocumentText,
  wordCount,
  type CleanPage,
  type DocumentDoc,
} from '@profjero/shared';
import { db, storage } from '@/lib/firebase';
import { createDocWithId, updateDocFields } from '@/lib/data';

type ContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];
const EXTENSIONS: Record<ContentType, 'pdf' | 'txt' | 'docx'> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** Validates type by extension AND magic bytes (a renamed executable is rejected), and size. */
export async function validateUpload(file: File): Promise<{ ok: true; contentType: ContentType } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: 'The file is empty.' };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: `Files must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller.` };
  const ext = file.name.toLowerCase().split('.').pop();
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04; // PK..
  if (ext === 'pdf' && isPdf) return { ok: true, contentType: 'application/pdf' };
  if (ext === 'docx' && isZip) return { ok: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (ext === 'txt' && !isPdf && !isZip && !head.slice(0, 4).some((b) => b === 0)) return { ok: true, contentType: 'text/plain' };
  return { ok: false, error: 'Only PDF, Word (.docx) and plain-text files are supported.' };
}

// ───────────────────────────── Extraction ─────────────────────────────

async function extractPdf(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(text);
  }
  return pages;
}

/** Minimal ZIP reader: finds word/document.xml via the central directory and inflates it. */
async function extractDocx(data: ArrayBuffer): Promise<string[]> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .docx file');
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === 'word/document.xml') {
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const raw = bytes.subarray(start, start + compSize);
      const xmlBytes = method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paragraphs = [...xml.getElementsByTagNameNS(W, 'p')].map((para) => [...para.getElementsByTagNameNS(W, 't')].map((t) => t.textContent ?? '').join(''));
      // Word has no fixed pages; group ~40 paragraphs per "page" for navigation.
      const pages: string[] = [];
      for (let i = 0; i < paragraphs.length; i += 40) pages.push(paragraphs.slice(i, i + 40).join('\n\n'));
      return pages.length ? pages : [''];
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('This .docx has no document body');
}

async function extractText(file: Blob, contentType: ContentType): Promise<string[]> {
  const data = await file.arrayBuffer();
  if (contentType === 'application/pdf') return extractPdf(data);
  if (contentType === 'text/plain') {
    // Plain text: split on form feeds if present, otherwise ~3000-character pages at paragraph boundaries.
    const text = new TextDecoder().decode(data);
    if (text.includes('\f')) return text.split('\f');
    const paras = text.split(/\n\s*\n/);
    const pages: string[] = [];
    let cur = '';
    for (const para of paras) {
      if (cur.length + para.length > 3000 && cur) { pages.push(cur); cur = ''; }
      cur += (cur ? '\n\n' : '') + para;
    }
    if (cur) pages.push(cur);
    return pages;
  }
  return extractDocx(data);
}

// ───────────────────────────── Upload pipeline ─────────────────────────────

/**
 * 1. upload the original under tenants/{t}/documents/{id}/source.{ext}
 * 2. create the metadata document (rules verify the path belongs to it)
 * 3. extract + clean text in the browser and store text.json next to it
 * The original file name is kept only as metadata; storage names are fixed.
 */
export async function uploadDocument(tenantId: string, file: File, contentType: ContentType, title: string, courseId: string | null, onStage: (s: string) => void): Promise<string> {
  const id = doc(collection(db, 'tenants', tenantId, 'documents')).id;
  const base = `tenants/${tenantId}/documents/${id}`;
  const storagePath = `${base}/source.${EXTENSIONS[contentType]}`;
  onStage('Uploading');
  await uploadBytes(ref(storage, storagePath), file, { contentType });
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'document';
  createDocWithId<DocumentDoc>(tenantId, 'documents', id, {
    title, fileName: safeName, contentType, sizeBytes: file.size, storagePath, textPath: null, pageCount: 0, wordCount: 0,
    status: 'uploaded', courseId, position: { page: 1, paragraph: 0 },
  });
  try {
    onStage('Reading the document');
    const raw = await extractText(file, contentType);
    const pages = cleanDocumentText(raw);
    onStage('Saving text');
    const json = new Blob([JSON.stringify(pages)], { type: 'application/json' });
    await uploadBytes(ref(storage, `${base}/text.json`), json, { contentType: 'application/json' });
    updateDocFields<DocumentDoc>(tenantId, 'documents', id, {
      status: 'processed', textPath: `${base}/text.json`, pageCount: pages.length,
      wordCount: pages.reduce((a, p) => a + p.paragraphs.reduce((b, para) => b + wordCount(para), 0), 0),
    });
  } catch {
    updateDocFields<DocumentDoc>(tenantId, 'documents', id, { status: 'failed' });
  }
  return id;
}

export async function loadDocumentText(textPath: string): Promise<CleanPage[]> {
  const bytes = await getBytes(ref(storage, textPath), 50 * 1024 * 1024);
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Corrupt text file');
  return parsed.map((p, i) => ({
    page: typeof p?.page === 'number' ? p.page : i + 1,
    paragraphs: Array.isArray(p?.paragraphs) ? p.paragraphs.filter((x: unknown): x is string => typeof x === 'string') : [],
  }));
}
