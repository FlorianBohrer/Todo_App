import { computed, effect, Injectable, signal } from '@angular/core';

import {
  Binding,
  DEFAULT_BINDINGS,
  ShortcutAction,
  findConflict,
  matches,
  mergeBindings,
  sameBinding,
} from './shortcuts';

const STORAGE_KEY = 'shortcuts.bindings';

function stored(): Record<ShortcutAction, Binding> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return mergeBindings(raw ? JSON.parse(raw) : null);
  } catch {
    // Privater Modus, blockierte Site-Daten oder kaputtes JSON: dann eben die
    // Vorgaben. Ohne Kürzel zu sein wäre schlimmer als ohne eigene.
    return { ...DEFAULT_BINDINGS };
  }
}

/**
 * Die Tastenkürzel der App, änderbar und gespeichert.
 *
 * Eine Stelle, an der alle stehen. Vorher lag jedes als Zeichenvergleich in dem
 * Handler, der es ausführt: nicht anzeigbar, nicht änderbar, und zwei gleiche
 * an verschiedenen Enden der App wären niemandem aufgefallen.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutService {
  private readonly bindings = signal<Record<ShortcutAction, Binding>>(stored());

  readonly all = this.bindings.asReadonly();

  /** true, sobald irgendetwas von der Vorgabe abweicht — für „Reset all". */
  readonly isCustomised = computed(() =>
    (Object.keys(DEFAULT_BINDINGS) as ShortcutAction[]).some(
      (action) => !sameBinding(this.bindings()[action], DEFAULT_BINDINGS[action]),
    ),
  );

  constructor() {
    effect(() => {
      const value = this.bindings();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* Speichern ist ein Komfort, kein Muss. */
      }
    });
  }

  binding(action: ShortcutAction): Binding {
    return this.bindings()[action];
  }

  /**
   * Welche Handlung dieser Tastendruck auslöst. null, wenn keine.
   *
   * Eine einzige Stelle, an der ein Ereignis auf eine Handlung trifft. Die
   * Aufrufer fragen nach der Handlung, nicht nach der Taste — deshalb muss
   * keiner von ihnen etwas ändern, wenn der Nutzer umbelegt.
   */
  match(event: KeyboardEvent): ShortcutAction | null {
    const all = this.bindings();
    for (const action of Object.keys(all) as ShortcutAction[]) {
      if (matches(all[action], event)) return action;
    }
    return null;
  }

  /**
   * Ein Kürzel neu belegen.
   *
   * Gibt die Handlung zurück, der es bisher gehörte, falls es eine gab — dann
   * wurde NICHTS geändert. Zwei Handlungen auf derselben Taste sind keine
   * Einstellung, sondern ein Ratespiel darüber, welche zuerst im Code steht.
   */
  set(action: ShortcutAction, binding: Binding): ShortcutAction | null {
    const conflict = findConflict(this.bindings(), action, binding);
    if (conflict) return conflict;

    this.bindings.update((all) => ({ ...all, [action]: binding }));
    return null;
  }

  reset(action: ShortcutAction) {
    this.bindings.update((all) => ({
      ...all,
      [action]: DEFAULT_BINDINGS[action],
    }));
  }

  resetAll() {
    this.bindings.set({ ...DEFAULT_BINDINGS });
  }
}
