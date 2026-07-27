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
    return {
      iso: toISODate(date),
      date,
      weekdayShort: WEEKDAYS[i],
      dayNum: date.getDate(),
      isToday: toISODate(date) === todayIso,
      isWeekend: i >= 5,
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
