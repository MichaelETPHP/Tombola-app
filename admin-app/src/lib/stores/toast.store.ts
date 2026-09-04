import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<ToastItem[]>([]);

  function add(type: ToastType, message: string, title?: string, duration = 4000) {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { id, type, message, title, duration };

    update((items) => [...items, item]);

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }

    return id;
  }

  function dismiss(id: string) {
    update((items) => items.filter((item) => item.id !== id));
  }

  function clear() {
    update(() => []);
  }

  return {
    subscribe,
    success: (message: string, title?: string, duration?: number) => add('success', message, title, duration),
    error: (message: string, title?: string, duration?: number) => add('error', message, title, duration),
    info: (message: string, title?: string, duration?: number) => add('info', message, title, duration),
    warning: (message: string, title?: string, duration?: number) => add('warning', message, title, duration),
    dismiss,
    clear,
  };
}

export const toast = createToastStore();
