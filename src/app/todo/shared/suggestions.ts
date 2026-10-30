/**
 * „Suggested tasks — based on your list".
 *
 * Ohne Modell, ohne Server: zwei Quellen, die beide aus der eigenen Liste
 * kommen.
 *
 *  1. Wieder fällig — was man in den letzten Wochen mehrmals erledigt hat und
 *     gerade nicht offen ist. Wäsche, Einkaufen, Pflanzen: Dinge, die
 *     wiederkommen, auch wenn niemand eine Wiederholung eingestellt hat.
 *  2. Ideen — ein kleiner Katalog alltäglicher Aufgaben, sortiert nach dem,
 *     was in der Liste schon überwiegt (Arbeit oder Zuhause), und ohne das,
 *     was schon dasteht. „Wasser trinken" wird nicht vorgeschlagen, wenn
 *     „Drink water" offen ist: verglichen wird auch am Bild (task-icon.ts).
 *
 * Die Sprache folgt der Liste. Wer deutsch schreibt, bekommt deutsche
 * Vorschläge.
 */
import { Todo } from '../model/todo.model';
import { durationOf, stripPriorityPrefix } from './title-priority';
import { guessEmoji } from './task-icon';
import { shiftISODate, todayISO, toISODate } from './week';

export interface Suggestion {
  /** So wird es angelegt — mit Dauer-Präfix, wenn eine bekannt ist. */
  text: string;
  minutes: number | null;
  /** Woher der Vorschlag kommt — für die Zeile darunter. */
  reason: 'again' | 'idea';
}

type Mood = 'work' | 'home' | 'any';

interface Idea {
  de: string;
  en: string;
  minutes: number;
  mood: Mood;
}

const IDEAS: readonly Idea[] = [
  { de: 'Die Woche planen', en: 'Plan the week ahead', minutes: 15, mood: 'any' },
  { de: 'Offene E-Mails beantworten', en: 'Reply to outstanding emails', minutes: 20, mood: 'work' },
  { de: 'Zahnarzt-Kontrolle buchen', en: 'Book a dental check-up', minutes: 15, mood: 'home' },
  { de: 'Zimmerpflanzen gießen', en: 'Water the houseplants', minutes: 10, mood: 'home' },
  { de: 'Ein Glas Wasser trinken', en: 'Drink a glass of water', minutes: 5, mood: 'any' },
  { de: 'Schreibtisch aufräumen', en: 'Tidy up the desk', minutes: 10, mood: 'work' },
  { de: 'Wochenrückblick schreiben', en: 'Write a weekly review', minutes: 20, mood: 'work' },
  { de: 'Kurzer Spaziergang', en: 'Take a short walk', minutes: 15, mood: 'any' },
  { de: 'Wäsche waschen', en: 'Do the laundry', minutes: 30, mood: 'home' },
  { de: 'Einkaufsliste schreiben', en: 'Write the shopping list', minutes: 10, mood: 'home' },
  { de: 'Rechnungen prüfen', en: 'Check the bills', minutes: 15, mood: 'home' },
  { de: 'Termine für morgen ansehen', en: "Look over tomorrow's meetings", minutes: 5, mood: 'work' },
  { de: 'Eine Stunde Deep Work', en: 'An hour of deep work', minutes: 60, mood: 'work' },
  { de: '10 Minuten lesen', en: 'Read for 10 minutes', minutes: 10, mood: 'any' },
];

/** Bilder, an denen man Arbeit und Zuhause unterscheidet. */
const WORK = new Set(['📧', '📞', '🗓️', '📊', '📝', '💻', '🧠', '🎯']);
const HOME = new Set(['🛒', '🧺', '🧹', '🍽️', '🪴', '💧', '🐶', '🐱', '🏠', '💰', '🦷', '🩺']);

const GERMAN = /[äöüß]|\b(und|der|die|das|mit|für|fuer|nicht|anrufen|machen|schreiben|kaufen|noch)\b/i;

/** Nur der Text, klein und ohne Präfixe — zum Vergleichen. */
function plain(title: string): string {
  return stripPriorityPrefix(title).split('\n')[0].trim().toLowerCase();
}

/** Wie viele Tage zurück „in letzter Zeit" reicht. */
const RECENT_DAYS = 60;

export function suggestTasks(
  todos: readonly Todo[],
  options: { seed?: number; limit?: number; today?: string } = {},
): Suggestion[] {
  const { seed = 0, limit = 4, today = todayISO() } = options;
  const open = todos.filter((t) => !t.completed && !t.archivedAt);
  const openTexts = new Set(open.map((t) => plain(t.title)));
  const openEmojis = new Set(open.map((t) => guessEmoji(plain(t.title))).filter((e) => e !== null));

  // 1) Wieder fällig: mindestens zweimal erledigt, zuletzt in den letzten
  //    Wochen, nicht offen und nicht als Wiederholung ohnehin unterwegs.
  const since = shiftISODate(today, -RECENT_DAYS);
  const done = new Map<string, { title: string; count: number; last: string }>();
  for (const todo of todos) {
    if (!todo.completed || !todo.completedAt || todo.repeat) continue;
    const day = toISODate(todo.completedAt);
    if (day < since) continue;
    const key = plain(todo.title);
    if (!key || openTexts.has(key)) continue;
    const seen = done.get(key);
    if (seen) {
      seen.count++;
      if (day > seen.last) seen.last = day;
    } else {
      done.set(key, { title: todo.title, count: 1, last: day });
    }
  }
  const again: Suggestion[] = [...done.values()]
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .map((d) => ({
      text: stripPriorityPrefix(d.title).split('\n')[0].trim(),
      minutes: durationOf(d.title),
      reason: 'again' as const,
    }));

  // 2) Ideen, passend zu dem, was überwiegt.
  const emojis = todos.map((t) => guessEmoji(plain(t.title)));
  const work = emojis.filter((e) => e !== null && WORK.has(e)).length;
  const home = emojis.filter((e) => e !== null && HOME.has(e)).length;
  const mood: Mood = work > home ? 'work' : home > work ? 'home' : 'any';
  const german = todos.some((t) => GERMAN.test(plain(t.title)));
  const rank = (idea: Idea) => (idea.mood === mood ? 0 : idea.mood === 'any' ? 1 : 2);

  const ideas: Suggestion[] = [...IDEAS]
    .sort((a, b) => rank(a) - rank(b))
    .map((idea) => ({ idea, text: german ? idea.de : idea.en }))
    .filter(({ idea, text }) => {
      if (openTexts.has(text.toLowerCase())) return false;
      const emoji = guessEmoji(idea.en) ?? guessEmoji(idea.de);
      return emoji === null || !openEmojis.has(emoji);
    })
    .map(({ idea, text }) => ({ text, minutes: idea.minutes, reason: 'idea' as const }));

  // Ohne Doppel, dann im Kreis weiter: „Neu laden" zeigt die nächsten.
  const seen = new Set<string>();
  const all = [...again, ...ideas].filter((s) => {
    const key = s.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (all.length <= limit) return all;
  const start = (seed * limit) % all.length;
  return Array.from({ length: limit }, (_, i) => all[(start + i) % all.length]);
}
