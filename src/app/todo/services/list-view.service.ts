import { Injectable, signal } from '@angular/core';

/** Wie die Liste geordnet ist: von Hand, nach Termin, Priorität oder Tageszeit. */
export type Grouping = 'manual' | 'date' | 'priority' | 'time';

/** Reihenfolge innerhalb einer Gruppe. „manual" ist die gezogene. */
export type SortOrder = 'manual' | 'date' | 'name' | 'duration';

const GROUPINGS: readonly Grouping[] = ['manual', 'date', 'priority', 'time'];
const SORTS: readonly SortOrder[] = ['manual', 'date', 'name', 'duration'];

function read<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privater Modus: dann gilt die Wahl eben nur bis zum Neuladen.
  }
}

const isGrouping = (v: unknown): v is Grouping => GROUPINGS.includes(v as Grouping);
const isSort = (v: unknown): v is SortOrder => SORTS.includes(v as SortOrder);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * Wie die Liste aussieht — geteilt zwischen dem Kopf (Menü „…" und „+") und
 * der Liste selbst, die beide verschiedene Komponenten sind.
 *
 * Gemerkt pro Gerät: wer auf dem Telefon nach Tageszeit gruppiert, will am
 * Rechner vielleicht seine eigene Reihenfolge.
 */
@Injectable({ providedIn: 'root' })
export class ListViewService {
  readonly grouping = signal<Grouping>(
    // Ältere Fassung schrieb den Wert ohne JSON — beides lesen.
    read('todos.grouping', legacyGrouping(), isGrouping),
  );
  readonly sort = signal<SortOrder>(read('todos.sort', 'manual', isSort));
  readonly showIcons = signal<boolean>(read('todos.icons', true, isBool));
  readonly showSuggestions = signal<boolean>(read('todos.suggestions', true, isBool));

  /** Zählt hoch, wenn oben „+" gedrückt wird — das Eingabefeld hört darauf. */
  readonly addRequest = signal(0);

  setGrouping(value: Grouping): void {
    this.grouping.set(value);
    write('todos.grouping', value);
  }

  setSort(value: SortOrder): void {
    this.sort.set(value);
    write('todos.sort', value);
  }

  setShowIcons(value: boolean): void {
    this.showIcons.set(value);
    write('todos.icons', value);
  }

  setShowSuggestions(value: boolean): void {
    this.showSuggestions.set(value);
    write('todos.suggestions', value);
  }

  requestAdd(): void {
    this.addRequest.update((n) => n + 1);
  }
}

function legacyGrouping(): Grouping {
  try {
    const raw = localStorage.getItem('todos.grouping');
    return isGrouping(raw) ? raw : 'manual';
  } catch {
    return 'manual';
  }
}
