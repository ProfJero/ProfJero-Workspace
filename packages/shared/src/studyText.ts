/**
 * Turns raw text extracted from documents (one string per page) into clean,
 * speakable paragraphs, and splits them into chunks suitable for speech
 * synthesis. Pure and deterministic so it can run in the browser now and in a
 * server-side document pipeline later.
 */

export interface CleanPage {
  page: number; // 1-based
  paragraphs: string[];
}

const PAGE_NUMBER_LINE = [
  /^\s*\d{1,4}\s*$/, // "12"
  /^\s*[-–—]\s*\d{1,4}\s*[-–—]\s*$/, // "- 12 -"
  /^\s*page\s+\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i, // "Page 3", "Page 3 of 10"
  /^\s*\d{1,4}\s*(of|\/)\s*\d{1,4}\s*$/i, // "3 / 10"
  /^\s*[ivxlcdm]{1,7}\s*$/i, // roman numerals
];

const normalizeLine = (l: string) => l.replace(/\s+/g, ' ').trim();
/** Lines are compared with digits masked so "Chapter 2 · 14" and "Chapter 2 · 15" count as the same running header. */
const signature = (l: string) => normalizeLine(l).toLowerCase().replace(/\d+/g, '#');

/**
 * Header/footer lines: the first or last content line of a page (after page
 * numbers are removed), at most 80 characters, recurring — digit-insensitive —
 * on at least half of the pages (minimum 3).
 */
function detectRunningLines(pages: string[][]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const raw of pages) {
    const lines = raw.filter((l) => !PAGE_NUMBER_LINE.some((re) => re.test(l.trim())));
    const edge = new Set(
      [lines[0], lines[lines.length - 1]]
        .filter((l): l is string => !!l && normalizeLine(l).length <= 80)
        .map(signature),
    );
    for (const s of edge) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length / 2));
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([s]) => s));
}

export interface CleanOptions {
  removeUrls?: boolean;
  removeEmails?: boolean;
  removeCitations?: boolean; // "[12]", "(Smith, 2020)"
}

export function cleanDocumentText(rawPages: string[], options: CleanOptions = {}): CleanPage[] {
  const { removeUrls = true, removeEmails = true, removeCitations = true } = options;
  const pages = rawPages.map((p) =>
    p
      .replace(/\r\n?/g, '\n')
      .replace(/­/g, '') // soft hyphens
      .replace(/[​-‍﻿]/g, '')
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd()),
  );
  const running = detectRunningLines(pages.map((ls) => ls.filter((l) => l.trim() !== '')));

  return pages.map((lines, i) => {
    const kept: string[] = [];
    const content = lines.map((l) => l.trim()).filter((l) => l !== '' && !PAGE_NUMBER_LINE.some((re) => re.test(l)));
    const firstLine = content[0];
    const lastLine = content[content.length - 1];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        kept.push('');
        continue;
      }
      if (PAGE_NUMBER_LINE.some((re) => re.test(trimmed))) continue;
      if ((trimmed === firstLine || trimmed === lastLine) && running.has(signature(trimmed))) continue;
      kept.push(trimmed);
    }

    // Re-join wrapped lines into paragraphs. A blank line, or a line ending in
    // terminal punctuation followed by a capitalised/bulleted line, ends a paragraph.
    const paragraphs: string[] = [];
    let current = '';
    const flush = () => {
      const p = current.trim();
      if (p) paragraphs.push(p);
      current = '';
    };
    for (let k = 0; k < kept.length; k++) {
      const line = kept[k]!;
      if (line === '') {
        flush();
        continue;
      }
      const isBullet = /^([•\-*▪◦]|\d{1,2}[.)])\s+/.test(line);
      if (isBullet) flush();
      if (current === '') current = line;
      else if (/[A-Za-z]-$/.test(current)) current = current.slice(0, -1) + line; // de-hyphenate "infor-\nmation"
      else current += ' ' + line;
      const next = kept[k + 1];
      if (next && /[.!?:]["')\]]?$/.test(line) && /^[A-Z"'(•\-*▪◦\d]/.test(next) && line.length < 60) flush();
    }
    flush();

    const cleaned = paragraphs
      .map((p) => {
        let t = p;
        if (removeUrls) t = t.replace(/\b(https?:\/\/|www\.)\S+/gi, '');
        if (removeEmails) t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '');
        if (removeCitations) t = t.replace(/\[\d+(?:[,–-]\s*\d+)*\]/g, '').replace(/\(([A-Z][A-Za-z-]+(?: et al\.)?),? \d{4}[a-z]?\)/g, '');
        return t.replace(/^([•\-*▪◦])\s+/, '').replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      })
      .filter((p) => /[A-Za-z]/.test(p));
    return { page: i + 1, paragraphs: cleaned };
  });
}

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'fig', 'no', 'vol', 'p', 'pp', 'cf', 'approx', 'dept', 'univ']);

/** Sentence split that respects common abbreviations, initials and decimals. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let end = i + 1;
    while (end < text.length && /["')\]]/.test(text[end]!)) end++;
    if (end < text.length && text[end] !== ' ') continue; // decimals "3.14", "e.g."
    if (ch === '.') {
      const wordMatch = /([A-Za-z.]+)$/.exec(text.slice(start, i));
      const word = wordMatch?.[1]?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) continue;
    }
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Chunks for speech synthesis: whole sentences grouped up to `maxChars`.
 * Very long sentences are split at clause boundaries (; : ,) so engines that
 * truncate long utterances never cut words mid-way.
 */
export function speechChunks(paragraph: string, maxChars = 220): string[] {
  const pieces: string[] = [];
  for (const sentence of splitSentences(paragraph)) {
    if (sentence.length <= maxChars) {
      pieces.push(sentence);
      continue;
    }
    let buf = '';
    for (const clause of sentence.split(/(?<=[;:,])\s+/)) {
      if (buf && (buf + ' ' + clause).length > maxChars) {
        pieces.push(buf);
        buf = clause;
      } else buf = buf ? `${buf} ${clause}` : clause;
      while (buf.length > maxChars) {
        const cut = buf.lastIndexOf(' ', maxChars);
        const at = cut > 0 ? cut : maxChars;
        pieces.push(buf.slice(0, at));
        buf = buf.slice(at).trim();
      }
    }
    if (buf) pieces.push(buf);
  }
  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && (cur + ' ' + p).length > maxChars) {
      chunks.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function estimateReadingMinutes(wordCount: number, wordsPerMinute = 160): number {
  return Math.max(1, Math.round(wordCount / wordsPerMinute));
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
