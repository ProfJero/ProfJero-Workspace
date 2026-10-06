import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((fn) => fn());

export function toast(message: string, kind: Toast['kind'] = 'success') {
  const t = { id: nextId++, kind, message };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismissToast(t.id), kind === 'error' ? 7000 : 4000);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => toasts,
  );
}
