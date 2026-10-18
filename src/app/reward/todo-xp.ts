/**
 * Was ein erledigtes Todo wert ist.
 *
 * Der XP-Stand wird nirgends gespeichert. Er ist die Summe über alle
 * erledigten Todos — Liste plus Archiv —, jedes Mal neu gerechnet. Daraus
 * folgt fast alles, was man von einem Punktestand erwartet, ohne eine Zeile
 * Code dafür:
 *
 * - Er ist auf jedem Gerät derselbe, weil er aus den Daten des Servers kommt.
 *   (localStorage ist kein Datenspeicher — siehe README.)
 * - Abhaken und zurücknehmen bringt nichts: zurückgenommen ist nicht erledigt.
 * - Archivieren kostet nichts: das Archiv zählt mit.
 * - Eine gelöschte Aufgabe nimmt ihre XP mit. Wer aufräumen will, ohne zu
 *   verlieren, archiviert.
 */
import { Todo } from '../todo/model/todo.model';
import { Importance, importanceOf } from '../todo/shared/focus';
import { taskLevel } from '../todo/shared/title-priority';
import { toISODate } from '../todo/shared/week';
import { isGolden } from './level';

/**
 * Grundwert nach MoSCoW.
 *
 * Unbewertet und Could-have gleich: läge Could darunter, lohnte es sich, gar
 * nicht erst zu bewerten. Won't-haves bekommen etwas — wer etwas bewusst
 * Ausgeschlossenes trotzdem erledigt, hat trotzdem gearbeitet.
 */
export const BASE_XP: Record<Importance, number> = {
  must: 30,
  should: 20,
  normal: 10,
  could: 10,
  wont: 5,
};

/** Ein Schritt einer größeren Aufgabe. Die Hauptaufgabe trägt den eigentlichen Wert. */
export const SUBTASK_XP = 5;

/**
 * Für „an oder vor dem geplanten Tag erledigt".
 *
 * Die Belohnung für den Teil, der laut focus.ts am meisten bewirkt: einen Tag
 * festzulegen und ihn zu halten.
 */
export const ON_TIME_BONUS = 5;

export interface TodoReward {
  base: number;
  onTime: boolean;
  golden: boolean;
  total: number;
}

export function rewardFor(todo: Todo): TodoReward {
  const base = taskLevel(todo.title) === 'sub' ? SUBTASK_XP : BASE_XP[importanceOf(todo.title)];

  // 'YYYY-MM-DD' sortiert wie das Datum, der Vergleich als Zeichenkette reicht.
  // Ohne Erledigungszeit (vor der Migration abgehakt) kein Bonus: die App
  // weiß dann nicht, ob es pünktlich war, und behauptet es auch nicht.
  const onTime =
    todo.scheduledDate !== null &&
    todo.completedAt !== null &&
    toISODate(todo.completedAt) <= todo.scheduledDate;

  const golden = isGolden(todo.id);
  const total = (base + (onTime ? ON_TIME_BONUS : 0)) * (golden ? 2 : 1);

  return { base, onTime, golden, total };
}

export function totalXp(todos: readonly Todo[]): number {
  let sum = 0;
  for (const todo of todos) {
    if (todo.completed) sum += rewardFor(todo).total;
  }
  return sum;
}
