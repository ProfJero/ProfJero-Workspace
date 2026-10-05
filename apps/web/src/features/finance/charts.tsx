import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, type CurrencyCode } from '@profjero/shared';

/**
 * Charts follow the data-viz reference spec: bars ≤ 24px with a 4px rounded
 * data-end and square baseline, 2px surface gap between touching bars,
 * hairline recessive grid, a legend for ≥ 2 series, text in ink tokens (never
 * series colours), per-group hover/focus tooltip, and a table view so no value
 * is only reachable by hovering.
 */

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Rect with 4px rounded top corners and a square bottom (anchored to the baseline). */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

export interface Series {
  name: string;
  /** CSS colour, e.g. var(--series-1) */
  color: string;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export function GroupedBarChart({
  title,
  groups,
  series,
  currency,
}: {
  title: string;
  groups: { label: string; values: number[] }[];
  series: Series[];
  currency: CurrencyCode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const height = 220;
  const pad = { top: 12, right: 8, bottom: 24, left: 56 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...groups.flatMap((g) => g.values)));
  const band = groups.length ? plotW / groups.length : 0;
  const gap = 2;
  const barW = Math.max(2, Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const fmt = (v: number) => formatMoney(Math.round(v), currency, { compact: true });
  const labelEvery = Math.ceil(groups.length / Math.max(1, Math.floor(plotW / 48)));

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend series={series} />
        <button className="text-xs font-medium text-brand hover:underline" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-3 font-medium">Period</th>{series.map((s) => <th key={s.name} className="py-1 pr-3 text-right font-medium">{s.name}</th>)}</tr></thead>
            <tbody className="tabular">
              {groups.map((g) => <tr key={g.label} className="border-t border-line"><td className="py-1.5 pr-3">{g.label}</td>{g.values.map((v, i) => <td key={i} className="py-1.5 pr-3 text-right">{formatMoney(v, currency)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative">
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={title} className="block overflow-visible">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} strokeWidth={1} />
                  <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-[var(--ink-muted)] text-[11px]">{fmt(t)}</text>
                </g>
              ))}
              {groups.map((g, gi) => {
                const x0 = pad.left + gi * band + (band - groupW) / 2;
                return (
                  <g
                    key={g.label}
                    tabIndex={0}
                    role="button"
                    aria-label={`${g.label}: ${series.map((s, i) => `${s.name} ${formatMoney(g.values[i] ?? 0, currency)}`).join(', ')}`}
                    onPointerEnter={() => setActive(gi)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(gi)}
                    onBlur={() => setActive(null)}
                    className="outline-none"
                  >
                    {/* Hit target: the whole band, larger than the marks. */}
                    <rect x={pad.left + gi * band} y={pad.top} width={band} height={plotH} fill={active === gi ? 'var(--surface-2)' : 'transparent'} />
                    {g.values.map((v, si) => (
                      <path key={si} d={barPath(x0 + si * (barW + gap), y(v), barW, pad.top + plotH - y(v))} fill={series[si]!.color} opacity={active === null || active === gi ? 1 : 0.55} />
                    ))}
                    {gi % labelEvery === 0 && (
                      <text x={pad.left + gi * band + band / 2} y={height - 6} textAnchor="middle" className="fill-[var(--ink-muted)] text-[11px]">{g.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {active !== null && groups[active] && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(0, pad.left + active * band + band / 2 - 72), Math.max(0, width - 160)) }}
            >
              <p className="mb-1 text-muted">{groups[active]!.label}</p>
              {series.map((s, i) => (
                <p key={s.name} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="tabular font-semibold text-ink">{formatMoney(groups[active]!.values[i] ?? 0, currency)}</span>
                  <span className="text-ink-2">{s.name}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars for a ranked breakdown (single series: no legend). Values are labeled at the bar tip. */
export function RankedBars({ rows, currency, color = 'var(--series-1)', max: maxRows = 8 }: { rows: { label: string; valueMinor: number; share: number | null }[]; currency: CurrencyCode; color?: string; max?: number }) {
  const shown = rows.filter((r) => r.valueMinor > 0).slice(0, maxRows);
  const rest = rows.filter((r) => r.valueMinor > 0).slice(maxRows);
  const all = rest.length ? [...shown, { label: `Other (${rest.length})`, valueMinor: rest.reduce((a, r) => a + r.valueMinor, 0), share: null }] : shown;
  const peak = Math.max(1, ...all.map((r) => r.valueMinor));
  if (all.length === 0) return <p className="py-4 text-center text-sm text-muted">No spending in this period.</p>;
  return (
    <ul className="space-y-2.5">
      {all.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
          <span className="truncate text-ink-2" title={r.label}>{r.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(1, (r.valueMinor / peak) * 70)}%`, background: color }} aria-hidden />
            <span className="tabular whitespace-nowrap text-xs text-ink">
              {formatMoney(r.valueMinor, currency)}
              {r.share !== null && <span className="text-muted"> · {Math.round(r.share)}%</span>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? 'var(--good)' : score >= 50 ? 'var(--warning)' : 'var(--critical)';
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg viewBox="0 0 88 88" className={clsx('size-24 -rotate-90')}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{score}</span>
        <span className="text-[10px] text-muted">of 100</span>
      </span>
    </div>
  );
}
