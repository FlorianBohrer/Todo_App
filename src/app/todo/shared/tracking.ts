// Zeiterfassung ohne Angular: die Zahl, an der eine offene Erfassung zu
// erkennen ist, und welche Aufgaben zur Wahl stehen. Statistik, Dienst und
// Leiste teilen sie, ohne dass die reinen Rechnungen den HTTP-Dienst mitladen.

import type { Todo } from '../model/todo.model';
import { rankForFocus } from './focus';
import { stripPriorityPrefix } from './title-priority';
import { plainText } from './rich-title';

/**
 * Die geplante Länge, an der eine offene Zeiterfassung zu erkennen ist.
 *
 * Das Backend kennt nur Blöcke mit Länge (höchstens 24 Stunden). Wer auf der
 * Webseite „ich arbeite jetzt daran" sagt, plant aber keine Länge — die Uhr
 * läuft, bis man stoppt. Solche Sitzungen tragen deshalb die Höchstlänge;
 * Flow selbst plant nie einen Block von 24 Stunden.
 */
export const OPEN_ENDED_SECONDS = 86_400;

// ---- Welche Aufgabe erfasst wird ----


/** Ein Abschnitt der Auswahl: „Today", „Recently tracked" … */
export interface PickSection {
  label: string;
  items: Todo[];
}

/** Wie viele Einträge ein Abschnitt ohne Suche höchstens zeigt. */
const SECTION_LIMIT = 8;
const RECENT_LIMIT = 5;
const SEARCH_LIMIT = 30;

/** Der Titel so, wie man ihn liest und eintippt: ohne Präfix, ohne Sternchen. */
export function searchableTitle(title: string): string {
  return plainText(stripPriorityPrefix(title)).toLowerCase();
}

/**
 * Was zur Wahl steht, wenn man eine Aufgabe zum Erfassen sucht.
 *
 * Ohne Suche: zuerst, was heute dran ist (auch Liegengebliebenes), nach
 * derselben Rangfolge wie „Next up" — die oberste ist fast immer die, an der
 * man arbeiten will. Darunter, woran man zuletzt gearbeitet hat: wer nach
 * einer Pause weitermacht, sucht genau die. Gibt es beides nicht, die ersten
 * offenen Aufgaben der Liste.
 *
 * Mit Suche: jede offene Aufgabe, in deren Titel alle Wörter vorkommen, in
 * beliebiger Reihenfolge — Heutiges zuerst.
 */
export function trackCandidates(
  todos: readonly Todo[],
  options: { query: string; today: string; recentIds: readonly string[] },
): PickSection[] {
  const open = todos.filter((t) => !t.completed);
  const isDue = (t: Todo) => t.scheduledDate !== null && t.scheduledDate <= options.today;
  const tokens = options.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length > 0) {
    const hits = open.filter((t) => {
      const text = searchableTitle(t.title);
      return tokens.every((token) => text.includes(token));
    });
    const ordered = [...hits.filter(isDue), ...hits.filter((t) => !isDue(t))].slice(0, SEARCH_LIMIT);
    return ordered.length > 0 ? [{ label: 'Matching tasks', items: ordered }] : [];
  }

  const due = rankForFocus(open.filter(isDue), options.today).slice(0, SECTION_LIMIT);
  const shown = new Set(due.map((t) => t.id));
  const byId = new Map(open.map((t) => [t.id, t]));
  const recent: Todo[] = [];
  for (const id of options.recentIds) {
    const todo = byId.get(id);
    if (!todo || shown.has(id)) continue;
    shown.add(id);
    recent.push(todo);
    if (recent.length === RECENT_LIMIT) break;
  }

  const sections: PickSection[] = [];
  if (due.length > 0) sections.push({ label: 'Today', items: due });
  if (recent.length > 0) sections.push({ label: 'Recently tracked', items: recent });
  if (sections.length === 0 && open.length > 0) {
    sections.push({ label: 'Open tasks', items: open.slice(0, SECTION_LIMIT) });
  }
  return sections;
}
