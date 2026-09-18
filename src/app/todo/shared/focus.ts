/**
 * Priorisierung nach dem, was dazu erforscht ist.
 *
 * Die Befunde, auf denen das hier steht — und wie belastbar sie sind:
 *
 * 1. Mere-Urgency-Effekt (Zhu, Yang & Hsee 2018, Journal of Consumer
 *    Research). Menschen greifen zur dringenden Aufgabe statt zur wichtigen,
 *    selbst wenn die wichtige messbar mehr einbringt und beide in dieselbe
 *    Zeit passen. Konsequenz hier: Dringlichkeit ordnet innerhalb einer
 *    Wichtigkeitsstufe, sie hebt aber nie eine Stufe auf. Genau das ist der
 *    Fehler, den der Effekt beschreibt — die Rangfolge macht ihn unmöglich.
 *
 * 2. Umsetzungsabsichten (Gollwitzer & Sheeran 2006, Metaanalyse über 94
 *    Studien, d = .65). Wer festlegt, WANN etwas passiert, tut es deutlich
 *    häufiger als wer es sich bloß vornimmt. Konsequenz: ein Must-have ohne
 *    Tag ist die auffälligste Lücke, die eine Todo-App zeigen kann.
 *
 * 3. Planungsfehlschluss (Kahneman & Tversky 1979; Buehler, Griffin & Ross
 *    1994). Wir unterschätzen systematisch, wie viel in einen Tag passt. Das
 *    wirksame Gegenmittel ist die Außensicht: nicht schätzen, sondern die
 *    eigene Vergangenheit ansehen. Konsequenz: der Tagesplan wird gegen das
 *    gehalten, was an vergangenen Tagen wirklich fertig wurde — keine
 *    ausgedachte Obergrenze.
 *
 * 4. Zeigarnik / Masicampo & Baumeister (2011). Unerledigtes drängt sich ins
 *    Denken, bis ein PLAN dafür existiert — erledigen muss man es dafür nicht.
 *    Konsequenz: einen Tag zu vergeben ist selbst schon der Gewinn.
 *
 * Nicht dabei: die Eisenhower-Matrix. Sie ist Managementfolklore ohne
 * Primärforschung; die brauchbare Hälfte davon — wichtig ist nicht dringend —
 * steckt als Punkt 1 ohnehin drin.
 */
import { Todo } from '../model/todo.model';
import { priorityBadge } from './title-priority';
import { shiftISODate, todayISO } from './week';

export type Importance = 'must' | 'normal' | 'could';
export type Urgency = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

/**
 * Der Abstand zwischen zwei Wichtigkeitsstufen (3) ist größer als die gesamte
 * Spanne der Dringlichkeit (0 … 2.5). Damit kann kein noch so dringendes
 * Could-have ein Must-have überholen — siehe Punkt 1 oben.
 */
const IMPORTANCE_WEIGHT: Record<Importance, number> = { must: 6, normal: 3, could: 0 };

const URGENCY_WEIGHT: Record<Urgency, number> = {
  overdue: 2.5,
  today: 2,
  tomorrow: 1.5,
  week: 1,
  later: 0.5,
  none: 0,
};

/** Ab wie vielen vergangenen Plantagen eine Aussage über den eigenen Schnitt trägt. */
const MIN_HISTORY_DAYS = 3;

export function importanceOf(title: string): Importance {
  return priorityBadge(title) ?? 'normal';
}

export function urgencyOf(scheduledDate: string | null, today = todayISO()): Urgency {
  if (scheduledDate === null) return 'none';
  if (scheduledDate < today) return 'overdue';
  if (scheduledDate === today) return 'today';
  if (scheduledDate === shiftISODate(today, 1)) return 'tomorrow';
  return scheduledDate <= shiftISODate(today, 7) ? 'week' : 'later';
}

export function focusScore(todo: Todo, today = todayISO()): number {
  return (
    IMPORTANCE_WEIGHT[importanceOf(todo.title)] +
    URGENCY_WEIGHT[urgencyOf(todo.scheduledDate, today)]
  );
}

/**
 * Offene Todos in der Reihenfolge, in der sie Aufmerksamkeit verdienen.
 * Stabil: bei gleichem Wert bleibt die vom Nutzer gesetzte Reihenfolge stehen.
 */
export function rankForFocus(todos: readonly Todo[], today = todayISO()): Todo[] {
  return todos
    .filter((t) => !t.completed)
    .map((todo, index) => ({ todo, index, score: focusScore(todo, today) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.todo);
}

/** Ein Satz, der sagt, warum dieses Todo oben steht. */
export function focusReason(todo: Todo, today = todayISO()): string {
  const parts: string[] = [];

  const importance = importanceOf(todo.title);
  if (importance === 'must') parts.push('Must-have');
  if (importance === 'could') parts.push('Could-have');

  switch (urgencyOf(todo.scheduledDate, today)) {
    case 'overdue':  parts.push('past its day'); break;
    case 'today':    parts.push('planned for today'); break;
    case 'tomorrow': parts.push('planned for tomorrow'); break;
    case 'week':     parts.push('planned this week'); break;
    case 'later':    parts.push('planned later'); break;
    case 'none':     parts.push('no day yet'); break;
  }

  return parts.join(' · ');
}

/**
 * Must-haves ohne Tag — die Lücke aus Punkt 2. Wichtig genug, um es sich
 * vorzunehmen, aber ohne das Wann, das aus dem Vorsatz eine Handlung macht.
 */
export function unplannedImportant(todos: readonly Todo[]): Todo[] {
  return todos.filter(
    (t) => !t.completed && t.scheduledDate === null && importanceOf(t.title) === 'must',
  );
}

/**
 * Wie viel an einem geplanten Tag üblicherweise fertig wurde — Median über die
 * vergangenen Tage, an denen überhaupt etwas geplant war.
 *
 * Näherung, und das mit Absicht: gespeichert ist nur, DASS ein Todo erledigt
 * ist, nicht wann. Für die Frage „wie viel schaffe ich an einem Tag, den ich
 * verplant habe" trägt das trotzdem, und es ist die eigene Vergangenheit statt
 * einer erfundenen Zahl. Zu wenig Historie → null statt einer Behauptung.
 */
export function pastThroughput(todos: readonly Todo[], today = todayISO()): number | null {
  const doneByDay = new Map<string, number>();

  for (const todo of todos) {
    const day = todo.scheduledDate;
    if (day === null || day >= today) continue;
    doneByDay.set(day, (doneByDay.get(day) ?? 0) + (todo.completed ? 1 : 0));
  }

  if (doneByDay.size < MIN_HISTORY_DAYS) return null;

  const counts = [...doneByDay.values()].sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  return counts.length % 2 === 1
    ? counts[middle]
    : Math.round((counts[middle - 1] + counts[middle]) / 2);
}

export interface DailyLoad {
  /** Noch offene Todos für heute. */
  open: number;
  done: number;
  /** Median erledigter Todos an vergangenen Plantagen; null = zu wenig Historie. */
  typical: number | null;
  /** Der Plan liegt über dem, was sonst fertig wird. Ein Hinweis, kein Verbot. */
  overCommitted: boolean;
}

export function dailyLoad(todos: readonly Todo[], today = todayISO()): DailyLoad {
  const forToday = todos.filter((t) => t.scheduledDate === today);
  const done = forToday.filter((t) => t.completed).length;
  const open = forToday.length - done;
  const typical = pastThroughput(todos, today);

  return {
    open,
    done,
    typical,
    overCommitted: typical !== null && forToday.length > typical,
  };
}
