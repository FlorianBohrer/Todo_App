import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Optionale Aktion, z.B. "Rückgängig" beim Löschen. */
  actionLabel?: string;
  action?: () => void;
}

interface ToastOptions {
  type?: ToastType;
  actionLabel?: string;
  action?: () => void;
  durationMs?: number;
}

/**
 * Kleine, app-weite Benachrichtigungen. Vorher liefen alle Fehler still in
 * die Konsole — der Nutzer hat nie erfahren, dass etwas nicht gespeichert wurde.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly timeouts = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  show(message: string, options: ToastOptions = {}): number {
    const id = ++this.nextId;
    this.toasts.update((list) => [
      ...list,
      {
        id,
        message,
        type: options.type ?? 'info',
        actionLabel: options.actionLabel,
        action: options.action,
      },
    ]);

    this.timeouts.set(
      id,
      setTimeout(() => this.dismiss(id), options.durationMs ?? 4000),
    );
    return id;
  }

  success(message: string): number {
    return this.show(message, { type: 'success' });
  }

  error(message: string): number {
    return this.show(message, { type: 'error', durationMs: 6000 });
  }

  dismiss(id: number) {
    const timeout = this.timeouts.get(id);
    if (timeout !== undefined) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Aktion ausführen (z.B. Undo) und den Toast schließen. */
  runAction(toast: Toast) {
    toast.action?.();
    this.dismiss(toast.id);
  }
}
