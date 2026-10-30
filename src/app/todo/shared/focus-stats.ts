/**
 * Die Rechnungen der Statistik — ohne DOM und ohne Netz, damit sie sich
 * direkt prüfen lassen.
 *
 * Gebaut wie die Statistik in Flow (menubar/src/views/StatsView.vue und
 * src/timer/history.ts im Flow-Repo): Woche oder Monat, die Summe, der
 * Schnitt je Arbeitstag, Zeitblöcke je Tag, höchstens acht Stunden am Tag,
 * und dieselbe CSV-Stundenliste. So zeigen beide Apps für denselben Tag
 * dieselbe Zahl.
 */
import { shiftISODate, startOfWeekISO, todayISO, toISODate } from './week';

export type Span = 'week' | 'month';

/** Mehr zählt an keinem Tag — wie in Flow. */
export const MAX_DAY_MINUTES = 8 * 60;

/** Lücken bis hierhin gelten als derselbe Block: eine kurze Pause trennt nichts. */
export const BLOCK_GAP_MINUTES = 15;

/** Eine Fokus-Sitzung, wie das Backend sie liefert (GET /focus-session). */
export interface SessionLike {
  todoId: string | null;
  todoTitle: string;
  startedAt: Date;
  endedAt: Date | null;
  elapsedSeconds: number;
}

/** Ein zusammenhängender Block an einem Tag. */
export interface FocusBlock {
  start: string;
  end: string;
  minutes: number;
}

/** Die Tage eines Zeitraums als 'YYYY-MM-DD'. `offset` 0 = der laufende. */
export function periodDays(span: Span, offset: number, today = todayISO()): string[] {
  if (span === 'week') {
    const monday = shiftISODate(startOfWeekISO(today), offset * 7);
    return Array.from({ length: 7 }, (_, i) => shiftISODate(monday, i));
  }
  const [y, m] = today.split('-').map(Number);
  const first = new Date(y, m - 1 + offset, 1);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1)),
  );
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Sitzungen → Blöcke je Tag. Nahe beieinander liegende Sitzungen werden ein
 * Block („09:00–11:10" statt vier Einzelzeiten); gezählt wird die reine
 * Laufzeit, nicht die Spanne mit den Pausen darin.
 */
export function blocksByDay(sessions: readonly SessionLike[], gap = BLOCK_GAP_MINUTES): Map<string, FocusBlock[]> {
  const sorted = sessions
    .filter((s) => s.elapsedSeconds >= 60)
    .map((s) => ({ ...s, end: s.endedAt ?? new Date(s.startedAt.getTime() + s.elapsedSeconds * 1000) }))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const out = new Map<string, FocusBlock[]>();
  let last: { day: string; block: FocusBlock; endsAt: number } | null = null;
  for (const s of sorted) {
    const day = toISODate(s.startedAt);
    const minutes = Math.round(s.elapsedSeconds / 60);
    if (last && last.day === day && s.startedAt.getTime() - last.endsAt <= gap * 60_000) {
      last.block.minutes += minutes;
      if (s.end.getTime() > last.endsAt) {
        last.block.end = clock(s.end);
        last.endsAt = s.end.getTime();
      }
      continue;
    }
    const block: FocusBlock = { start: clock(s.startedAt), end: clock(s.end), minutes };
    const list = out.get(day) ?? [];
    list.push(block);
    out.set(day, list);
    last = { day, block, endsAt: s.end.getTime() };
  }
  return out;
}

/** Minuten je Tag, gedeckelt auf acht Stunden. */
export function capped(minutes: number): number {
  return Math.min(MAX_DAY_MINUTES, Math.max(0, Math.round(minutes)));
}

/** Erledigte Todos je Tag (nach ihrem Erledigt-Zeitpunkt, lokal). */
export function doneByDay(todos: readonly { completed: boolean; completedAt: Date | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of todos) {
    if (!t.completed || !t.completedAt) continue;
    const day = toISODate(t.completedAt);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

export interface TimeShare {
  morning: number;
  afternoon: number;
  evening: number;
}

/** Wann am Tag erledigt wird: vor 12, 12 bis 17, ab 17 Uhr — für die Tage des Zeitraums. */
export function doneByTimeOfDay(
  todos: readonly { completed: boolean; completedAt: Date | null }[],
  days: readonly string[],
): TimeShare {
  const inRange = new Set(days);
  const share: TimeShare = { morning: 0, afternoon: 0, evening: 0 };
  for (const t of todos) {
    if (!t.completed || !t.completedAt || !inRange.has(toISODate(t.completedAt))) continue;
    const hour = t.completedAt.getHours();
    if (hour < 12) share.morning++;
    else if (hour < 17) share.afternoon++;
    else share.evening++;
  }
  return share;
}

/** Die längste Reihe von Tagen in Folge mit etwas Erledigtem. */
export function bestStreak(done: ReadonlyMap<string, number>): number {
  const days = [...done.keys()].filter((d) => (done.get(d) ?? 0) > 0).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous !== null && shiftISODate(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/** Fokus je Todo in einem Zeitraum, die meiste zuerst. */
export function focusPerTodo(
  sessions: readonly SessionLike[],
  days: readonly string[],
): { todoId: string | null; title: string; minutes: number }[] {
  const inRange = new Set(days);
  const totals = new Map<string, { todoId: string | null; title: string; minutes: number }>();
  for (const s of sessions) {
    if (!inRange.has(toISODate(s.startedAt))) continue;
    const key = s.todoId ?? `title:${s.todoTitle}`;
    const entry = totals.get(key) ?? { todoId: s.todoId, title: s.todoTitle, minutes: 0 };
    entry.minutes += s.elapsedSeconds / 60;
    totals.set(key, entry);
  }
  return [...totals.values()]
    .map((e) => ({ ...e, minutes: Math.round(e.minutes) }))
    .filter((e) => e.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/** 440 → „7h 20m", 45 → „45m", 0 → „0m". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** 440 → „7:20" — wie in einer Stundenliste. */
export function formatHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(Math.round(minutes) % 60).padStart(2, '0')}`;
}

/**
 * Die Tage als CSV, aufgebaut wie die Stundenliste in Flow: Tag, je Block
 * Uhrzeit und Stunden, dann die Summe, auch dezimal. Semikolon und
 * Dezimalkomma, damit Excel und Numbers es auf Deutsch lesen.
 */
export function toCSV(days: ReadonlyArray<{ date: string; blocks: readonly FocusBlock[]; minutes: number }>): string {
  const worked = days.filter((day) => day.minutes > 0);
  const columns = Math.max(1, ...worked.map((day) => day.blocks.length));
  const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  const header = ['Day'];
  for (let i = 0; i < columns; i++) header.push(`${ordinal[i] ?? `${i + 1}.`} Session`, 'Hours');
  header.push('Total', 'Total (h)');

  const rows = worked.map((day) => {
    const [y, m, d] = day.date.split('-');
    const cells = [`${d}.${m}.${y}`];
    for (let i = 0; i < columns; i++) {
      const block = day.blocks[i];
      cells.push(block ? `${block.start}-${block.end}` : '', block ? formatHours(block.minutes) : '');
    }
    cells.push(formatHours(day.minutes), (day.minutes / 60).toFixed(2).replace('.', ','));
    return cells;
  });

  const sum = worked.reduce((all, day) => all + day.minutes, 0);
  const footer = ['Total', ...Array<string>(columns * 2).fill(''), formatHours(sum), (sum / 60).toFixed(2).replace('.', ',')];
  return [header, ...rows, footer].map((cells) => cells.join(';')).join('\r\n') + '\r\n';
}
