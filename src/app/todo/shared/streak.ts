/**
 * Die Flamme oben links: an wie vielen Tagen in Folge etwas erledigt wurde.
 *
 * Gezählt wird bis heute — oder bis gestern, solange heute noch nichts
 * abgehakt ist. Sonst stünde jeden Morgen eine Null da, obwohl die Reihe erst
 * reisst, wenn der Tag vorbei ist. `today` sagt, ob der heutige schon zählt:
 * die Flamme brennt dann voll, vorher gedämpft.
 */
import { shiftISODate, todayISO, toISODate } from './week';

export interface Streak {
  days: number;
  /** true, wenn heute schon etwas erledigt wurde. */
  today: boolean;
}

export function completionStreak(
  todos: readonly { completed: boolean; completedAt: Date | null }[],
  today = todayISO(),
): Streak {
  const done = new Set<string>();
  for (const todo of todos) {
    if (todo.completed && todo.completedAt) done.add(toISODate(todo.completedAt));
  }

  const doneToday = done.has(today);
  let day = doneToday ? today : shiftISODate(today, -1);
  let days = 0;
  while (done.has(day)) {
    days++;
    day = shiftISODate(day, -1);
  }
  return { days, today: doneToday };
}
