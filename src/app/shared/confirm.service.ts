import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Eine zweite, mildere Wahl neben dem Bestätigen — nur mit `choose`.
   * „Mit allen Schritten löschen" oder „nur die Aufgabe, Schritte behalten".
   */
  altLabel?: string;
  /** Der Knopf, der gefragt hat: der Dialog wächst aus ihm heraus. */
  from?: Element | null;
}

export interface OpenConfirm extends ConfirmRequest {
  id: number;
  /** Abstand des Auslösers zur Bildschirmmitte, beim Öffnen gemessen. */
  origin: { x: number; y: number };
}

/**
 * Eine Rückfrage, bevor etwas Endgültiges passiert.
 *
 * Eine für die ganze App, gezeigt von ConfirmDialog in der Wurzel: so steht
 * der Dialog über allem, auch über Menüs, aus denen heraus gefragt wird, und
 * jede Stelle fragt mit einer Zeile statt mit eigenem Markup.
 *
 * Fragt eine zweite Stelle, während die erste noch offen ist, gilt die erste
 * als abgelehnt — zwei Fragen übereinander beantwortet niemand richtig.
 */
/** Was gewählt wurde: bestätigt, die zweite Wahl, oder abgebrochen. */
export type ConfirmAnswer = 'confirm' | 'alt' | 'cancel';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private seq = 0;
  private resolve: ((answer: ConfirmAnswer) => void) | null = null;

  readonly current = signal<OpenConfirm | null>(null);

  /** Ja oder nein. */
  ask(request: ConfirmRequest): Promise<boolean> {
    return this.open({ ...request, altLabel: undefined }).then((answer) => answer === 'confirm');
  }

  /** Drei Wege: bestätigen, die zweite Wahl (`altLabel`) oder abbrechen. */
  choose(request: ConfirmRequest & { altLabel: string }): Promise<ConfirmAnswer> {
    return this.open(request);
  }

  answer(answer: boolean | ConfirmAnswer): void {
    this.settle(answer === true ? 'confirm' : answer === false ? 'cancel' : answer);
  }

  private open(request: ConfirmRequest): Promise<ConfirmAnswer> {
    this.settle('cancel');
    const origin = originOf(request.from);
    return new Promise<ConfirmAnswer>((resolve) => {
      this.resolve = resolve;
      this.current.set({ ...request, from: null, id: ++this.seq, origin });
    });
  }

  private settle(answer: ConfirmAnswer): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.current.set(null);
    resolve?.(answer);
  }
}

function originOf(el: Element | null | undefined): { x: number; y: number } {
  const rect = el?.getBoundingClientRect();
  if (!rect || rect.width === 0) return { x: 0, y: 0 };
  return {
    x: Math.round(rect.left + rect.width / 2 - window.innerWidth / 2),
    y: Math.round(rect.top + rect.height / 2 - window.innerHeight / 2),
  };
}
