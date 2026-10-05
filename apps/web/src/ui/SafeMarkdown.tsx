import type { ReactNode } from 'react';

/**
 * Renders a small, safe subset of Markdown as React elements:
 * # headings, - bullets, - [ ] / - [x] checklists, 1. numbered lists,
 * **bold**, *italic*, `code`, and http(s) links.
 *
 * It never uses innerHTML: all text is rendered as text nodes, so stored
 * content cannot inject markup or scripts. Links are restricted to http(s).
 */
export function SafeMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={blocks.length} className={list.ordered ? 'ml-5 list-decimal space-y-1' : 'ml-5 list-disc space-y-1'}>{list.items}</Tag>);
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const check = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      const cls = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
      blocks.push(<p key={i} className={`${cls} mt-3`} role="heading" aria-level={level + 1}>{inline(heading[2]!)}</p>);
    } else if (check) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; }
      const done = check[1]!.toLowerCase() === 'x';
      list.items.push(<li key={i} className="list-none -ml-5 flex gap-2"><input type="checkbox" checked={done} readOnly aria-label={done ? 'Done' : 'Not done'} className="mt-1" /><span className={done ? 'text-muted line-through' : ''}>{inline(check[2]!)}</span></li>);
    } else if (bullet) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; }
      list.items.push(<li key={i}>{inline(bullet[1]!)}</li>);
    } else if (numbered) {
      if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; }
      list.items.push(<li key={i}>{inline(numbered[1]!)}</li>);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(<p key={i}>{inline(line)}</p>);
    }
  });
  flush();
  return <div className={className ?? 'space-y-2 text-sm leading-relaxed text-ink'}>{blocks}</div>;
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s<>()]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="rounded bg-surface-2 px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline break-all">{part}</a>;
    }
    return part;
  });
}
