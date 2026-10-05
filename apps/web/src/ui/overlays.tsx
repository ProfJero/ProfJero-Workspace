import { useState, type ReactNode } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import * as RMenu from '@radix-ui/react-dropdown-menu';
import * as RTabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { dismissToast, useToasts } from '@/lib/toast';
import { Button, Field, Textarea } from './primitives';

// ───────────────────────────── Dialog ─────────────────────────────

/**
 * Modal dialog. On small screens it becomes a full-width bottom sheet so
 * forms remain usable with the on-screen keyboard.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <RDialog.Content
          className={clsx(
            'fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-xl focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-2xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-line',
            { sm: 'sm:w-[420px]', md: 'sm:w-[560px]', lg: 'sm:w-[760px]' }[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RDialog.Title className="text-base font-semibold text-ink">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-ink-2">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Confirmation for destructive actions. Optionally collects a reason (kept in the audit log). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = true,
  requireReason = false,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} loading={pending} disabled={requireReason && reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink-2">
        <div>{body}</div>
        {requireReason && (
          <Field label="Reason" hint="Recorded in the audit log.">
            {(id) => <Textarea id={id} rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
        {error && <InlineError message={error} />}
      </div>
    </Dialog>
  );
}

// ───────────────────────────── Menu ─────────────────────────────

export function Menu({ trigger, items, label }: { trigger: ReactNode; label: string; items: { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode; hidden?: boolean }[] }) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild aria-label={label}>
        {trigger}
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {visible.map((i) => (
            <RMenu.Item
              key={i.label}
              onSelect={i.onSelect}
              className={clsx(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2',
                i.danger ? 'text-critical-ink' : 'text-ink',
              )}
            >
              {i.icon}
              {i.label}
            </RMenu.Item>
          ))}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

// ───────────────────────────── Tabs ─────────────────────────────

export function Tabs({ value, onValueChange, tabs, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: string; count?: number }[]; className?: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Sections">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="relative whitespace-nowrap px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-brand"
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  );
}

// ───────────────────────────── Feedback ─────────────────────────────

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-surface-2 p-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function InlineError({ message, title }: { message: string; title?: string }) {
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical-ink">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <p>{message}</p>
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={clsx('flex gap-2 rounded-lg px-3 py-2 text-sm', tone === 'warning' ? 'bg-warning-soft text-warning-ink' : 'bg-brand-soft text-brand')}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? XCircle : t.kind === 'info' ? Info : CheckCircle2;
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink shadow-lg"
          >
            <Icon className={clsx('mt-0.5 size-4 shrink-0', t.kind === 'error' ? 'text-critical' : t.kind === 'info' ? 'text-brand' : 'text-good')} aria-hidden />
            <p className="flex-1">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
