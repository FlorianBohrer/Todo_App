/**
 * Rhythmus statt Serie.
 *
 * Eine Kette hat nur dort Bedeutung, wo es wirklich eine gibt: bei
 * wiederkehrenden Aufgaben. „Sport, alle 2 Tage" ist eine Gewohnheit, und
 * eine Gewohnheit hat eine Trefferquote. „Alles, was du je angehakt hast"
 * hat keine — eine app-weite Tagesserie belohnt das Öffnen der App, nicht die
 * Arbeit, und bestraft Krankheit und Urlaub. Deshalb steht hier bewusst keine.
 *
 * Gemessen wird je Reihe: die letzten acht FÄLLIGEN Termine, und wie viele
 * davon getroffen wurden. Eine Lücke ist dabei kein Verlust von etwas
 * Aufgebautem, sondern ein Punkt, der grau bleibt.
 *
 * Was „fällig" und „getroffen" heißt, ist schwieriger, als es aussieht, weil
 * die Zeilen nicht die Termine sind:
 *
 * Der Server legt die nächste Ausgabe erst beim ABHAKEN an, und bei Regeln
 * „am Plan" schiebt er sie dabei über alle verpassten Termine hinweg in die
 * Zukunft. Wer Sport am 28. ausfallen lässt und erst am 30. abhakt, bekommt
 * als Nächstes den 2. — den 30. gibt es als Zeile nie. Würde man nur Zeilen
 * zählen, sähe eine Woche mit einem verspäteten und einem übersprungenen
 * Termin aus wie eine makellose. Deshalb:
 *
 * - GETROFFEN heißt: an oder vor dem Termin erledigt. Zu spät ist ein grauer
 *   Punkt, kein Fehler.
 * - ÜBERSPRUNGENE Termine werden aus der Regel zurückgerechnet und zählen als
 *   verpasst. Nur bei Regeln „am Plan": bei „ab Erledigung" gibt es keinen
 *   festen Kalender, den man überspringen könnte.
 */
import { RepeatRule, RepeatUnit, Todo } from '../model/todo.model';
import { toISODate, todayISO } from './week';

/** Wie viele Termine zurück die Quote reicht. */
export const RHYTHM_WINDOW = 8;

/**
 * Ab wie vielen fälligen Terminen eine Quote etwas aussagt.
 *
 * Bei einem einzigen Termin gibt es keine Quote, sondern ein Ereignis — und
 * „0 von 1" an einer Aufgabe, die man gerade erst angelegt hat, ist kein
 * Befund, sondern eine Ohrfeige.
 */
export const RHYTHM_MIN = 2;

/**
 * Der Schlüssel der Reihe, zu der diese Ausgabe gehört.
 *
 * `seriesId ?? id`: die erste Ausgabe einer Reihe trägt selbst nichts ein,
 * ihr Schlüssel IST ihre id; jede folgende erbt sie (siehe createOccurrence
 * im Backend). Dadurch braucht keine bestehende Zeile einen Wert, und die
 * Reihe hat trotzdem von Anfang an einen gemeinsamen Schlüssel.
 */
export function seriesKey(todo: Todo): string {
  return todo.seriesId ?? todo.id;
}

/** Alle Ausgaben, nach Reihe gebündelt. */
export function groupBySeries(todos: readonly Todo[]): Map<string, Todo[]> {
  const series = new Map<string, Todo[]>();

  for (const todo of todos) {
    const key = seriesKey(todo);
    const group = series.get(key);
    if (group) group.push(todo);
    else series.set(key, [todo]);
  }

  return series;
}

// ---- Datumsrechnung — dieselbe wie im Backend (src/todo/recurrence.ts) ----
//
// Absichtlich eine Abschrift und keine Annäherung: würde hier anders
// gerechnet als dort, wo die nächste Ausgabe entsteht, zählte der Client
// Termine als übersprungen, die der Server nie übersprungen hat.

function format(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ein Termin um n Einheiten weiter. Monate über Jahr und Monat, auf den
 * letzten Tag des Zielmonats begrenzt (31. Januar → 28. Februar); Tage und
 * Wochen über UTC, damit keine Zeitumstellung dazwischenfunkt.
 */
export function addInterval(iso: string, every: number, unit: RepeatUnit): string {
  const [year, month, day] = iso.split('-').map(Number);

  if (unit === 'month') {
    const total = year * 12 + (month - 1) + every;
    const nextYear = Math.floor(total / 12);
    const nextMonth = (total % 12) + 1;
    return format(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
  }

  const days = unit === 'week' ? every * 7 : every;
  const next = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  return format(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/**
 * Wie viele Termine nach `due` laut Regel fällig gewesen wären, bevor
 * `until` kam — höchstens so viele, wie die Quote überhaupt zeigt.
 *
 * Die Deckelung ist keine Näherung: übersprungene Termine sind alle
 * verpasst, also alle gleich. Eine tägliche Aufgabe mit einem Termin von vor
 * drei Jahren hätte tausend davon, und von den letzten acht Punkten wären
 * es so oder so acht. Mehr zu zählen änderte am Bild nichts — und so läuft
 * die Schleife höchstens neunmal, egal wie alt der Termin ist.
 */
function skippedCount(due: string, until: string, rule: RepeatRule): number {
  if (rule.from !== 'due') return 0;

  let count = 0;
  let next = addInterval(due, rule.every, rule.unit);

  while (next < until && count < RHYTHM_WINDOW) {
    count++;
    next = addInterval(next, rule.every, rule.unit);
  }

  return count;
}

/**
 * Wurde diese Ausgabe getroffen — an oder vor ihrem Termin erledigt?
 *
 * Ohne Erledigungszeit (Zeilen aus der Zeit vor der Spalte) bleibt nur, DASS
 * sie erledigt ist. Das zählt als getroffen: es ist das Beste, was bekannt
 * ist, und ein Punkt, der grau wird, weil die App früher nicht
 * mitgeschrieben hat, wäre eine Unterstellung.
 */
function wasHit(todo: Todo): boolean {
  if (!todo.completed) return false;
  if (!todo.completedAt) return true;
  return toISODate(todo.completedAt) <= todo.scheduledDate!;
}

export interface Rhythm {
  /** Ein Eintrag je fälligem Termin, ältester zuerst. true = getroffen. */
  marks: boolean[];
  hit: number;
  of: number;
}

/**
 * Die Trefferquote einer Reihe. null, wenn es nichts zu zeigen gibt.
 *
 * Was als FÄLLIG zählt:
 * - Termine vor heute, ob erledigt oder nicht. Der Tag ist vorbei.
 * - Der heutige Termin nur, wenn er schon erledigt ist. Um neun Uhr morgens
 *   einen Punkt grau zu färben, weil der Tag noch läuft, wäre eine
 *   Behauptung über die Zukunft.
 * - Übersprungene Termine (siehe oben), ebenfalls nur bis gestern.
 * - Künftige Termine nie.
 *
 * Ausgaben ohne Termin bleiben draußen: ohne Datum gibt es keine Fälligkeit.
 */
export function rhythmOf(occurrences: readonly Todo[], today = todayISO()): Rhythm | null {
  const rows = occurrences
    .filter((todo) => todo.scheduledDate !== null)
    // 'YYYY-MM-DD' sortiert wie das Datum.
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!));

  const marks: boolean[] = [];

  rows.forEach((row, index) => {
    const due = row.scheduledDate!;
    if (due > today) return;

    const isLast = index === rows.length - 1;
    const counts = due < today || row.completed;
    if (counts) marks.push(wasHit(row));

    // Was zwischen dieser Ausgabe und der nächsten laut Regel fällig gewesen
    // wäre. Nach der letzten nur, solange sie offen ist: ist sie erledigt,
    // gibt es eine nächste, die hier bloß nicht geladen ist — dahinter
    // Lücken zu erfinden, hieße, sie dem Nutzer anzurechnen.
    if (!row.repeat) return;
    const next = isLast ? (row.completed ? null : today) : rows[index + 1].scheduledDate!;
    if (next === null) return;

    // Und nie über gestern hinaus. Liegt die nächste Ausgabe in der Zukunft,
    // wären sonst heute und alles danach „übersprungen" — Tage, die noch gar
    // nicht vorbei sind.
    const until = next < today ? next : today;

    const skipped = skippedCount(due, until, row.repeat);
    for (let i = 0; i < skipped; i++) marks.push(false);
  });

  const recent = marks.slice(-RHYTHM_WINDOW);
  if (recent.length < RHYTHM_MIN) return null;

  return {
    marks: recent,
    hit: recent.filter(Boolean).length,
    of: recent.length,
  };
}

/**
 * Die Trefferquote je OFFENER Ausgabe mit Wiederholung.
 *
 * Nur offene: die Quote gehört der Reihe, und die Reihe hat genau eine Zeile,
 * an der man handelt — die nächste. An jeder erledigten Ausgabe darunter
 * dieselben acht Punkte zu wiederholen, sagte nichts Neues und machte aus der
 * Liste ein Muster.
 *
 * Der Schlüssel ist die TODO-id, damit die Liste ihre Zeile direkt findet.
 */
export function rhythmByTodo(todos: readonly Todo[], today = todayISO()): Map<string, Rhythm> {
  const byTodo = new Map<string, Rhythm>();

  for (const [, occurrences] of groupBySeries(todos)) {
    if (!occurrences.some((todo) => todo.repeat && !todo.completed)) continue;

    const rhythm = rhythmOf(occurrences, today);
    if (!rhythm) continue;

    for (const todo of occurrences) {
      if (todo.repeat && !todo.completed) byTodo.set(todo.id, rhythm);
    }
  }

  return byTodo;
}
