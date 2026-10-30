/**
 * Ein Tag, nach Tageszeit sortiert — die Daten der Tagesansicht.
 *
 * Jederzeit (ohne Tageszeit), Morgen, Nachmittag, Abend, und am heutigen
 * Tag davor das Überfällige. Innerhalb eines Fachs steht Offenes vor
 * Erledigtem, und Wichtiges vor dem Rest — die Reihenfolge der Liste gilt
 * sonst weiter.
 */
import { Todo } from '../model/todo.model';
import { TimeOfDay, durationOf, timeOfDay, titlePriority } from './title-priority';
import { isSection } from './section';
import { shiftISODate, startOfWeekISO } from './week';

export type DaySlot = 'overdue' | 'anytime' | TimeOfDay;

export interface DayPlan {
  slots: Record<DaySlot, Todo[]>;
  done: number;
  total: number;
  /** Geplante Minuten, was noch offen ist. */
  minutesLeft: number;
}

export const DAY_SLOTS: readonly DaySlot[] = ['overdue', 'anytime', 'morning', 'afternoon', 'evening'];

export function dayPlan(todos: readonly Todo[], iso: string, today: string): DayPlan {
  const slots: Record<DaySlot, Todo[]> = { overdue: [], anytime: [], morning: [], afternoon: [], evening: [] };
  let done = 0;
  let total = 0;
  let minutesLeft = 0;

  for (const todo of todos) {
    if (todo.archivedAt || isSection(todo.title) || todo.scheduledDate === null) continue;
    if (todo.scheduledDate === iso) {
      slots[timeOfDay(todo.title) ?? 'anytime'].push(todo);
      total++;
      if (todo.completed) done++;
      else minutesLeft += durationOf(todo.title) ?? 0;
    } else if (iso === today && todo.scheduledDate < today && !todo.completed) {
      slots.overdue.push(todo);
    }
  }

  const rank = (t: Todo) => Number(t.completed) * 10 + titlePriority(t.title);
  for (const slot of DAY_SLOTS) slots[slot] = slots[slot].map((t, i) => [t, i] as const)
    .sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j)
    .map(([t]) => t);

  return { slots, done, total, minutesLeft };
}

/** Die sieben Tage (Mo–So) der Woche, in der `iso` liegt. */
export function weekDaysOf(iso: string): string[] {
  const monday = startOfWeekISO(iso);
  return Array.from({ length: 7 }, (_, i) => shiftISODate(monday, i));
}

/** Wie viele offene Aufgaben je Tag geplant sind — für die Punkte der Wochenleiste. */
export function openPerDay(todos: readonly Todo[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const todo of todos) {
    if (todo.completed || todo.archivedAt || todo.scheduledDate === null || isSection(todo.title)) continue;
    count.set(todo.scheduledDate, (count.get(todo.scheduledDate) ?? 0) + 1);
  }
  return count;
}
