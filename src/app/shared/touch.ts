import { DestroyRef, Signal, inject, signal } from '@angular/core';

/**
 * Ein Geraet, das nur Touch hat — Telefon, Tablet ohne Maus.
 *
 * Gefragt wird nach dem Eingabegeraet, nicht nach der Fensterbreite: ein
 * schmales Browserfenster am Rechner hat eine Maus und soll alles koennen,
 * ein Laptop mit Touchscreen ebenso. Folgt Wechseln (Tablet, an das eine
 * Maus angesteckt wird). Braucht einen Injektionskontext.
 */
export function touchOnly(): Signal<boolean> {
  const query =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: none) and (pointer: coarse)')
      : null;
  const value = signal(query?.matches ?? false);

  if (query) {
    const update = () => value.set(query.matches);
    query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
  }

  return value.asReadonly();
}
