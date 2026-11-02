/**
 * Die Rechnungen der Statistik — ohne DOM und ohne Netz, damit sie sich
 * direkt prüfen lassen.
 *
 * Flow ist die Quelle der Wahrheit. Die Regeln sind die aus Flow
 * (src/timer/history.ts, menubar/src/store.ts und views/StatsView.vue im
 * Repo „timer"): eine Sitzung zählt, wenn sie bis zum Ende gelaufen ist, mit
 * ihrer geplanten Länge, an dem Tag, an dem sie endete; jede Sitzung ist ein
 * eigener Block; die vor Flow notierten Stunden kommen dazu; kein Tag zählt
 * mehr als acht Stunden. So zeigen beide Apps für denselben Tag dieselbe Zahl.
 */
import { shiftISODate, startOfWeekISO, todayISO, toISODate } from './week';

export type Span = 'week' | 'month';

/** Mehr zählt an keinem Tag — wie in Flow. */
export const MAX_DAY_MINUTES = 8 * 60;

/** Eine Fokus-Sitzung, wie das Backend sie liefert (GET /focus-session). */
export interface SessionLike {
  todoId: string | null;
  todoTitle: string;
  startedAt: Date;
  endedAt: Date | null;
  elapsedSeconds: number;
  /** Bis zum Ende gelaufen (true) oder vorher gestoppt. */
  completed?: boolean;
  plannedSeconds?: number;
}

/** Ein Block mit Uhrzeiten — für Zeitleisten. */
export interface FocusBlock {
  start: string;
  end: string;
  minutes: number;
}

/**
 * Ein Arbeitsblock wie in Flow: eine Sitzung, oder ein eingelesener Block
 * aus der Zeit vor Flow. Uhrzeiten fehlen, wo nur die Dauer bekannt ist.
 */
export interface WorkBlock {
  start: string | null;
  end: string | null;
  minutes: number;
  source: 'flow' | 'import';
}

/** Datum 'YYYY-MM-DD' → Blöcke des Tages, in der Reihenfolge ihres Eintrags. */
export type History = Readonly<Record<string, readonly WorkBlock[]>>;

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
 * Wie viel eine Sitzung in Flow zählt: nur, wenn sie bis zum Ende gelaufen
 * ist, und dann ihre geplante Länge in ganzen Minuten (Flow: finish() in
 * useFlowTimer). Eine vorher gestoppte Sitzung zählt nicht. null = zählt nicht.
 */
export function flowMinutes(session: SessionLike): number | null {
  if (!session.completed || !session.endedAt) return null;
  const minutes = Math.round((session.plannedSeconds ?? session.elapsedSeconds) / 60);
  return minutes > 0 ? minutes : null;
}

/**
 * Sitzungen → Blöcke je Tag, wie Flow sie einträgt: am Tag des Endes, der
 * Block endet mit der Sitzung und beginnt ihre Länge davor.
 */
export function sessionHistory(sessions: readonly SessionLike[]): History {
  const counted = sessions
    .map((session) => ({ session, minutes: flowMinutes(session) }))
    .filter((entry): entry is { session: SessionLike & { endedAt: Date }; minutes: number } => entry.minutes !== null)
    .sort((a, b) => a.session.endedAt.getTime() - b.session.endedAt.getTime());

  const history: Record<string, WorkBlock[]> = {};
  for (const { session, minutes } of counted) {
    const end = session.endedAt;
    const start = new Date(end.getTime() - minutes * 60_000);
    const day = toISODate(end);
    (history[day] ??= []).push({ start: clock(start), end: clock(end), minutes, source: 'flow' });
  }
  return history;
}

/**
 * Eingelesene Tage dazunehmen, vor die Sitzungen des Tages — wie
 * mergeImport in Flow.
 */
export function mergeImport(history: History, imported: History): History {
  const next: Record<string, readonly WorkBlock[]> = { ...history };
  for (const [date, blocks] of Object.entries(imported)) {
    const existing = next[date] ?? [];
    if (existing.some((block) => block.source === 'import')) continue;
    next[date] = [...blocks.map((block) => ({ ...block, source: 'import' as const })), ...existing];
  }
  return next;
}

/** 'HH:MM' plus Minuten, am selben Tag. */
function addMinutes(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = Math.min(24 * 60 - 1, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Ein Tag über dem Höchstwert wird gekürzt — von hinten: was zuletzt kam,
 * fällt weg, der Block an der Grenze endet früher (capDay in Flow).
 */
export function capDay(blocks: readonly WorkBlock[], max = MAX_DAY_MINUTES): WorkBlock[] {
  let left = max;
  const kept: WorkBlock[] = [];
  for (const block of blocks) {
    if (left <= 0) break;
    if (block.minutes <= left) {
      kept.push(block);
      left -= block.minutes;
      continue;
    }
    const end = block.start ? addMinutes(block.start, left) : block.end;
    kept.push({ ...block, minutes: left, end });
    left = 0;
  }
  return kept;
}

/** Jeden Tag über dem Höchstwert kürzen; die anderen bleiben, wie sie sind. */
export function capHistory(history: History, max = MAX_DAY_MINUTES): History {
  const next: Record<string, readonly WorkBlock[]> = {};
  for (const [date, blocks] of Object.entries(history)) {
    next[date] = blocks.reduce((sum, block) => sum + block.minutes, 0) > max ? capDay(blocks, max) : blocks;
  }
  return next;
}

/** Die Geschichte, die Flow zeigt: Sitzungen und eingelesene Stunden, gedeckelt. */
export function flowHistory(sessions: readonly SessionLike[], imported: History): History {
  return capHistory(mergeImport(sessionHistory(sessions), imported));
}

export function minutesOn(blocks: readonly WorkBlock[] | undefined): number {
  return (blocks ?? []).reduce((sum, block) => sum + block.minutes, 0);
}

/** Nur die Blöcke mit Uhrzeit — die anderen haben auf einer Zeitleiste keinen Ort. */
export function timedBlocks(blocks: readonly WorkBlock[]): FocusBlock[] {
  return blocks
    .filter((block): block is WorkBlock & { start: string; end: string } => block.start !== null && block.end !== null)
    .map(({ start, end, minutes }) => ({ start, end, minutes }));
}

/** „09:00–13:00 · 14:00–18:00" — oder „2 blocks", wenn Uhrzeiten fehlen (wie Flow). */
export function describeBlocks(blocks: readonly WorkBlock[]): string {
  const timed = blocks.filter((block) => block.start && block.end).map((block) => `${block.start}–${block.end}`);
  if (timed.length > 0 && timed.length === blocks.length) return timed.join(' · ');
  if (blocks.length === 0) return 'Focus sessions';
  return `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`;
}

/**
 * Gegen den Zeitraum davor, wie in Flow: nur für abgeschlossene Zeiträume —
 * eine halbe Woche gegen eine ganze sagt nichts. null, wenn es nichts zu
 * vergleichen gibt.
 */
export function periodTrend(total: number, previous: number, offset: number): number | null {
  if (offset === 0 || total === 0 || previous === 0) return null;
  return Math.round(((total - previous) / previous) * 100);
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

/** Fokus je Todo in einem Zeitraum, die meiste zuerst — gezählt wie in Flow. */
export function focusPerTodo(
  sessions: readonly SessionLike[],
  days: readonly string[],
): { todoId: string | null; title: string; minutes: number }[] {
  const inRange = new Set(days);
  const totals = new Map<string, { todoId: string | null; title: string; minutes: number }>();
  for (const s of sessions) {
    const minutes = flowMinutes(s);
    if (minutes === null || !inRange.has(toISODate(s.endedAt!))) continue;
    const key = s.todoId ?? `title:${s.todoTitle}`;
    const entry = totals.get(key) ?? { todoId: s.todoId, title: s.todoTitle, minutes: 0 };
    entry.minutes += minutes;
    totals.set(key, entry);
  }
  return [...totals.values()].filter((e) => e.minutes > 0).sort((a, b) => b.minutes - a.minutes);
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
 * Die Tage als CSV, dieselbe Stundenliste wie aus Flow (toCSV in Flow): Tag,
 * je Block Uhrzeit und Stunden, dann die Summe, auch dezimal. Semikolon und
 * Dezimalkomma, damit Excel und Numbers es auf Deutsch lesen.
 */
export function toCSV(days: ReadonlyArray<{ date: string; blocks: readonly WorkBlock[] }>): string {
  const worked = days.filter((day) => day.blocks.length > 0);
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
      cells.push(block?.start && block.end ? `${block.start}-${block.end}` : '', block ? formatHours(block.minutes) : '');
    }
    const total = minutesOn(day.blocks);
    cells.push(formatHours(total), (total / 60).toFixed(2).replace('.', ','));
    return cells;
  });

  const sum = worked.reduce((all, day) => all + minutesOn(day.blocks), 0);
  const footer = ['Total', ...Array<string>(columns * 2).fill(''), formatHours(sum), (sum / 60).toFixed(2).replace('.', ',')];
  return [header, ...rows, footer].map((cells) => cells.join(';')).join('\r\n') + '\r\n';
}

// ---- Für die Ansicht: Heatmap und Zeitleiste ----

/** Eine Woche der Heatmap: Montag bis Sonntag, dazu der Monat, wenn er hier beginnt. */
export interface HeatWeek {
  days: string[];
  month: string | null;
}

/**
 * Die letzten `weeks` Wochen bis einschliesslich der laufenden, als Spalten
 * Montag bis Sonntag — wie ein Kalender, der quer liegt. Der Monatsname
 * steht über der Woche mit dem Ersten, und über der ersten Spalte.
 */
export function heatmapWeeks(weeks = 13, today = todayISO()): HeatWeek[] {
  const firstMonday = shiftISODate(startOfWeekISO(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => shiftISODate(firstMonday, w * 7 + i));
    const first = days.find((d) => d.endsWith('-01'));
    return { days, month: first ? first.slice(0, 7) : w === 0 ? days[0].slice(0, 7) : null };
  });
}

/** Fokus eines Tages als Stufe 0 bis 4 — für die Heatmap, eine Farbe von hell nach kräftig. */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 150) return 2;
  if (minutes < 270) return 3;
  return 4;
}

/** Ein Block auf der Zeitleiste eines Tages, in Prozent der Leiste. */
export interface TimelineSpan {
  left: number;
  width: number;
  label: string;
}

/**
 * Blöcke → Lage auf einer Leiste von `from` bis 24 Uhr (in Minuten). Was
 * vor `from` beginnt, schiebt den Anfang der Leiste nach vorn, auf die volle
 * Stunde — damit nichts abgeschnitten wird.
 */
export function timelineSpans(blocks: readonly FocusBlock[], from = 6 * 60): { start: number; spans: TimelineSpan[] } {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const earliest = Math.min(from, ...blocks.map((b) => toMin(b.start)));
  const start = Math.floor(earliest / 60) * 60;
  const range = 24 * 60 - start;
  const spans = blocks.map((b) => {
    const s = toMin(b.start);
    let e = toMin(b.end);
    if (e <= s) e = 24 * 60; // über Mitternacht: bis zum Ende der Leiste
    return {
      left: ((s - start) / range) * 100,
      width: Math.max(0.8, ((e - s) / range) * 100),
      label: `${b.start}–${b.end}`,
    };
  });
  return { start, spans };
}
