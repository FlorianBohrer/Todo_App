/**
 * Der Wochenrückblick: was letzte Woche fertig wurde, nach Ordnern.
 *
 * Kein Punktestand — eine Liste. Rückblick wirkt stärker als Punkte, weil er
 * zeigt, was man geleistet hat, statt es in eine Zahl zu übersetzen; und weil
 * er nichts belohnt, lässt er sich auch nicht ausnutzen. Eine Woche, in der
 * wenig fertig wurde, soll hier wenig zeigen und sonst nichts sagen.
 *
 * Diese Auskunft hängt vollständig an completedAt. Ohne Erledigungszeiten
 * gibt es sie nicht — und dann sagt die App das, statt über scheduledDate zu
 * rechnen und eine Zahl über den GEPLANTEN Tag als „geschafft" auszugeben.
 */
import { Todo } from '../model/todo.model';
import { shiftISODate, startOfWeekISO, toISODate, todayISO } from './week';

export interface ReviewGroup {
  /** Primärer Ordner der Aufgabe. null = ohne Ordner. */
  labelId: string | null;
  count: number;
}

export interface WeeklyReview {
  /** Montag der betrachteten Woche, 'YYYY-MM-DD'. */
  from: string;
  /** Sonntag derselben Woche. */
  to: string;
  total: number;
  /** Nach Anzahl absteigend; „ohne Ordner" steht immer am Ende. */
  groups: ReviewGroup[];
  /**
   * Seit wann überhaupt Erledigungszeiten vorliegen — aber nur, wenn das
   * NACH dem Wochenbeginn war.
   *
   * Die Spalte kam irgendwann dazu, und alles, was davor abgehakt wurde,
   * trägt keinen Zeitpunkt. Eine Woche, die zur Hälfte davor liegt, zeigt
   * deshalb zu wenig — das gehört dazugesagt, sonst liest sich eine
   * unvollständige Zahl wie eine vollständige. null heißt: die Woche ist
   * vollständig erfasst.
   */
  incompleteSince: string | null;
}

/** Der Tag, als ISO-Datum, an dem dieses Todo erledigt wurde. */
function completionDay(todo: Todo): string | null {
  return todo.completedAt ? toISODate(todo.completedAt) : null;
}

/**
 * Die Woche vor der laufenden. null, wenn es gar keine Erledigungszeiten gibt.
 *
 * Bewusst die vergangene KALENDERwoche und nicht „die letzten sieben Tage":
 * ein Rückblick braucht eine Grenze, die nicht jeden Tag woanders liegt,
 * sonst vergleicht man ihn nie mit dem vorherigen.
 */
export function weeklyReview(todos: readonly Todo[], today = todayISO()): WeeklyReview | null {
  const anyCompletionTime = todos.some((todo) => !!todo.completedAt);
  if (!anyCompletionTime) return null;

  const from = shiftISODate(startOfWeekISO(today), -7);
  const to = shiftISODate(from, 6);

  const counts = new Map<string | null, number>();
  let total = 0;

  for (const todo of todos) {
    const day = completionDay(todo);
    if (day === null || day < from || day > to) continue;

    const labelId = todo.labelIds[0] ?? null;
    counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
    total++;
  }

  const groups = [...counts.entries()]
    .map(([labelId, count]) => ({ labelId, count }))
    .sort((a, b) => {
      // „Ohne Ordner" ist keine Gruppe, die um einen Platz konkurriert.
      if (a.labelId === null) return 1;
      if (b.labelId === null) return -1;
      return b.count - a.count;
    });

  const earliest = todos
    .map(completionDay)
    .filter((day): day is string => day !== null)
    .sort()[0];

  return {
    from,
    to,
    total,
    groups,
    incompleteSince: earliest !== undefined && earliest > from ? earliest : null,
  };
}

/**
 * Erledigt je Tag, über die vorliegenden Erledigungszeiten.
 *
 * Das ist die exakte Fassung dessen, was pastThroughput() bisher schätzen
 * musste: dort wurde über den GEPLANTEN Tag gezählt, weil kein anderer bekannt
 * war. Bei allem, was verschoben wurde, ist das die falsche Spalte.
 */
export function doneByCompletionDay(todos: readonly Todo[]): Map<string, number> {
  const byDay = new Map<string, number>();

  for (const todo of todos) {
    const day = completionDay(todo);
    if (day === null) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return byDay;
}
