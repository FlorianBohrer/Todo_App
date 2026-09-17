/**
 * Datums-Helfer für die Wochenansicht. Bewusst mit lokalem Datum gerechnet
 * (nicht toISOString → das verschiebt bei Zeitzonen den Tag). Labels sind
 * englisch, passend zur restlichen (englischen) UI.
 */
export interface WeekDay {
  iso: string;        // 'YYYY-MM-DD' (lokal)
  date: Date;
  weekdayShort: string;
  dayNum: number;
  isToday: boolean;
  isWeekend: boolean;
  /** Liegt vor heute — trägt die „überfällig"-Kennzeichnung. */
  isPast: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Lokales Datum als 'YYYY-MM-DD'. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/**
 * 'YYYY-MM-DD' → lokales Date (Mitternacht).
 *
 * Bewusst nicht `new Date(iso)`: das liest reine Datums-Strings als UTC und
 * verschiebt den Tag in jeder Zeitzone westlich von Greenwich um eins.
 */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Heute als 'YYYY-MM-DD' (lokal). */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Ein ISO-Datum um n Tage verschieben. Rechnet über Date, also DST-fest. */
export function shiftISODate(iso: string, days: number): string {
  return toISODate(addDays(fromISODate(iso), days));
}

/**
 * Kalenderwoche nach ISO-8601: Woche 1 ist die mit dem ersten Donnerstag des
 * Jahres. Deshalb der Sprung auf den Donnerstag — er entscheidet, zu welchem
 * Jahr eine Woche über den Jahreswechsel hinweg gehört.
 */
export function isoWeekNumber(d: Date): number {
  const thursday = (x: Date) => {
    const c = new Date(x.getFullYear(), x.getMonth(), x.getDate());
    c.setDate(c.getDate() + 3 - ((c.getDay() + 6) % 7));
    return c;
  };
  const current = thursday(d);
  const first = thursday(new Date(current.getFullYear(), 0, 4));
  const DAY = 86_400_000;
  // Runden statt Abschneiden: über eine Zeitumstellung hinweg fehlt sonst 1 h.
  return 1 + Math.round((current.getTime() - first.getTime()) / (7 * DAY));
}

/** Montag der Woche, in der d liegt (Mo–So). */
function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mondayOffset = (c.getDay() + 6) % 7; // So=0 → 6, Mo=1 → 0 …
  c.setDate(c.getDate() - mondayOffset);
  return c;
}

/** Die 7 Tage der Woche mit Versatz (0 = aktuelle Woche). */
export function buildWeek(offset: number): WeekDay[] {
  const today = new Date();
  const todayIso = toISODate(today);
  const start = addDays(startOfWeek(today), offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const iso = toISODate(date);
    return {
      iso,
      date,
      weekdayShort: WEEKDAYS[i],
      dayNum: date.getDate(),
      isToday: iso === todayIso,
      isWeekend: i >= 5,
      // Zeichenketten-Vergleich reicht: 'YYYY-MM-DD' sortiert wie das Datum.
      isPast: iso < todayIso,
    };
  });
}

/** Lesbarer Bereich, z.B. "Jul 20 – 26" oder "Jun 30 – Jul 6". */
export function weekRangeLabel(days: WeekDay[]): string {
  const start = days[0].date;
  const end = days[6].date;
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : String(d.getDate());
  const sameMonth = start.getMonth() === end.getMonth();
  return `${fmt(start, true)} – ${fmt(end, !sameMonth)}`;
}
