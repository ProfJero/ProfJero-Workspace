import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

// ───────────────────────────── Button ─────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-sm',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-critical text-white hover:opacity-90 shadow-sm',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink', className)}
      {...rest}
    />
  );
}

// ───────────────────────────── Fields ─────────────────────────────

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted shadow-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60 aria-[invalid=true]:border-critical';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-critical-ink"> *</span>}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-critical-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(control, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={clsx(control, 'py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={clsx(control, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={clsx('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}>
      <input type="checkbox" className="size-4 rounded border-line accent-[var(--brand)]" {...rest} />
      {label}
    </label>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={clsx('rounded-xl border border-line bg-surface shadow-xs', className)}>{children}</As>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ───────────────────────────── Data display ─────────────────────────────

export type Tone = 'neutral' | 'brand' | 'good' | 'warning' | 'critical';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  brand: 'bg-brand-soft text-brand',
  good: 'bg-good-soft text-good-ink',
  warning: 'bg-warning-soft text-warning-ink',
  critical: 'bg-critical-soft text-critical-ink',
};

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = 'brand', label, className }: { value: number; tone?: Tone; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = { neutral: 'bg-line-strong', brand: 'bg-brand', good: 'bg-good', warning: 'bg-warning', critical: 'bg-critical' }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div className={clsx('h-full rounded-full transition-[width]', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'critical' }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-xs">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={clsx('mt-1 break-words text-lg font-semibold leading-tight sm:text-2xl', tone === 'good' && 'text-good-ink', tone === 'critical' && 'text-critical-ink')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}
