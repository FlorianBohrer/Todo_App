/**
 * Was heute war und was gerade läuft — die Rechnungen hinter Home.
 *
 * Bewusst ohne Angular: der Tag, die erledigten Aufgaben und die Zeitleiste
 * sind reine Funktionen über Todos und Fokus-Sitzungen und lassen sich so
 * ohne Komponente prüfen.
 */
import type { Todo } from '../model/todo.model';
import type { FocusSessionRecord } from '../services/focus-session.service';
import { fromISODate, toISODate } from './week';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Liegt der Zeitpunkt auf diesem lokalen Kalendertag? */
export function onLocalDay(date: Date | null, iso: string): boolean {
  return date !== null && toISODate(date) === iso;
}

/**
 * An diesem Tag erledigt, das Jüngste zuerst.
 *
 * Gezählt wird, WANN etwas fertig wurde, nicht für wann es geplant war: was
 * man heute von gestern nachholt, hat man heute geschafft. Erledigtes ohne
 * Zeitpunkt (aus der Zeit, bevor der Server ihn festhielt) bleibt draussen —
 * von ihm weiss niemand, ob es heute war.
 */
export function doneOn(todos: readonly Todo[], iso: string): Todo[] {
  return todos
    .filter((t) => t.completed && onLocalDay(t.completedAt, iso))
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());
}

/** Für diesen Tag geplant und noch offen, in der Reihenfolge der Liste. */
export function openOn(todos: readonly Todo[], iso: string): Todo[] {
  return todos.filter((t) => !t.completed && t.scheduledDate === iso);
}

/** Ein Eintrag der Zeitleiste: ein Fokusblock aus Flow oder eine Erledigung. */
export interface DayBlock {
  id: string;
  kind: 'focus' | 'done';
  todoId: string | null;
  title: string;
  start: Date;
  /** Bei einer Erledigung derselbe Zeitpunkt wie start. */
  end: Date;
  /** Der Block läuft gerade; sein Ende ist „jetzt". */
  running: boolean;
}

/**
 * Die Fokusblöcke, die in diesen Tag fallen, auf ihn zugeschnitten.
 *
 * Ein Block über Mitternacht zählt mit dem Teil, der heute liegt. Ein
 * laufender reicht bis jetzt.
 */
export function focusBlocksOn(
  sessions: readonly FocusSessionRecord[],
  iso: string,
  now: Date,
): DayBlock[] {
  const dayStart = fromISODate(iso).getTime();
  const dayEnd = dayStart + DAY_MS;

  return sessions
    .filter((s) => s.startedAt.getTime() < dayEnd && (s.endedAt ?? now).getTime() > dayStart)
    .map((s) => ({
      id: s.id,
      kind: 'focus' as const,
      todoId: s.todoId,
      title: s.todoTitle,
      start: new Date(Math.max(s.startedAt.getTime(), dayStart)),
      end: new Date(Math.min((s.endedAt ?? now).getTime(), dayEnd)),
      running: s.endedAt === null,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Die Erledigungen eines Tages als Punkte auf der Zeitleiste. */
export function doneBlocks(done: readonly Todo[]): DayBlock[] {
  return done.map((t) => ({
    id: `done-${t.id}`,
    kind: 'done' as const,
    todoId: t.id,
    title: t.title,
    start: t.completedAt!,
    end: t.completedAt!,
    running: false,
  }));
}

/**
 * Sekunden Fokus je Aufgabe an diesem Tag — reine Laufzeit ohne Pausen, so
 * wie Flow sie zählt. Gezählt wird ein Block an dem Tag, an dem er endet
 * (der laufende heute), wie in der Statistik.
 */
export function focusSecondsOn(
  sessions: readonly FocusSessionRecord[],
  iso: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    if (s.todoId === null) continue;
    const counts = s.endedAt === null ? true : onLocalDay(s.endedAt, iso);
    if (!counts) continue;
    totals.set(s.todoId, (totals.get(s.todoId) ?? 0) + s.elapsedSeconds);
  }
  return totals;
}

/** Alle Fokussekunden des Tages, über alle Aufgaben. */
export function totalFocusOn(sessions: readonly FocusSessionRecord[], iso: string): number {
  return sessions
    .filter((s) => (s.endedAt === null ? true : onLocalDay(s.endedAt, iso)))
    .reduce((sum, s) => sum + s.elapsedSeconds, 0);
}

/** Ein Eintrag mit seinem Platz auf der Zeitleiste. */
export interface PlacedBlock extends DayBlock {
  /** Abstand von oben, in Pixeln. */
  top: number;
  height: number;
  /** Spalte innerhalb einer Gruppe, die sich überschneidet (0 = links). */
  lane: number;
  /** Wie viele Spalten diese Gruppe hat. */
  lanes: number;
}

export interface DayRange {
  startHour: number;
  endHour: number;
}

/**
 * Welche Stunden die Zeitleiste zeigt: ab 6 Uhr bis Mitternacht, früher,
 * wenn der Tag früher anfing.
 */
export function dayRange(blocks: readonly DayBlock[], iso: string, earliest = 6): DayRange {
  const dayStart = fromISODate(iso).getTime();
  let startHour = earliest;
  for (const block of blocks) {
    const hour = Math.floor((block.start.getTime() - dayStart) / HOUR_MS);
    startHour = Math.max(0, Math.min(startHour, hour));
  }
  return { startHour, endHour: 24 };
}

/** Pixel von oben für einen Zeitpunkt. */
export function offsetFor(
  date: Date,
  iso: string,
  range: DayRange,
  pxPerHour: number,
): number {
  const dayStart = fromISODate(iso).getTime();
  return ((date.getTime() - dayStart) / HOUR_MS - range.startHour) * pxPerHour;
}

/**
 * Legt die Einträge auf die Zeitleiste.
 *
 * Jeder bekommt mindestens `minHeight` Pixel, sonst wäre ein Block von drei
 * Minuten oder eine Erledigung nicht lesbar. Was sich dabei überschneidet,
 * teilt sich die Breite: innerhalb einer Gruppe einander überlappender
 * Einträge rückt jeder in die erste Spalte, die zu seiner Zeit frei ist —
 * wie Termine im Kalender.
 */
export function layoutDay(
  blocks: readonly DayBlock[],
  iso: string,
  range: DayRange,
  pxPerHour: number,
  minHeight: number,
): PlacedBlock[] {
  const sized = blocks
    .map((block) => {
      const start = offsetFor(block.start, iso, range, pxPerHour);
      const end = offsetFor(block.end, iso, range, pxPerHour);
      const height = Math.max(minHeight, end - start);
      // Ein laufender Block endet an der Jetzt-Linie. Ist er noch zu kurz
      // für seine Mindesthöhe, wächst er nach oben statt über „jetzt"
      // hinaus — sonst liefe die Linie mitten durch seinen Titel.
      const top = block.running ? Math.min(start, end - height) : start;
      return { ...block, top, height, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const placed: PlacedBlock[] = [];
  let group: PlacedBlock[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const block of sized) {
    if (block.top >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= block.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = block.top + block.height;
    block.lane = lane;
    group.push(block);
    groupEnd = Math.max(groupEnd, block.top + block.height);
  }
  closeGroup();

  return placed;
}

/** „13:19" — 24 Stunden, wie eine Uhr. */
export function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
