/**
 * Ein Monatsblatt für die Datumswahl.
 *
 * Termine gab es bisher nur als vier Angebote (heute, morgen, Wochenende,
 * nächste Woche) und als Ziehen in der Woche. Ein Arzttermin in drei Wochen
 * liess sich nirgends eintragen. Das Blatt rechnet wie die Woche: lokal, Montag
 * zuerst, 'YYYY-MM-DD' als Währung (siehe week.ts).
 */
import { fromISODate, shiftISODate, startOfWeekISO, toISODate } from './week';

export interface CalendarDay {
  iso: string;
  dayNum: number;
  /** Gehört zum angezeigten Monat — die Ränder davor und danach nicht. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

/** Monat als Jahr und Index (0 = Januar), wie Date ihn zählt. */
export interface MonthRef {
  year: number;
  month: number;
}

export function monthOf(iso: string): MonthRef {
  const d = fromISODate(iso);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Einen Monat vor- oder zurückblättern; Jahreswechsel inklusive. */
export function shiftMonth(ref: MonthRef, by: number): MonthRef {
  const d = new Date(ref.year, ref.month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Die Wochen eines Monats, je sieben Tage ab Montag.
 *
 * Immer sechs Reihen, auch wenn der Monat in fünf passt: sonst springt die
 * Höhe des Blatts beim Blättern, und der Knopf für den nächsten Monat
 * rutscht unter dem Finger weg.
 */
export function monthGrid(ref: MonthRef, today: string): CalendarDay[][] {
  const first = toISODate(new Date(ref.year, ref.month, 1));
  const start = startOfWeekISO(first);

  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = shiftISODate(start, w * 7 + d);
      const date = fromISODate(iso);
      week.push({
        iso,
        dayNum: date.getDate(),
        inMonth: date.getMonth() === ref.month,
        isToday: iso === today,
        isPast: iso < today,
        isWeekend: d >= 5,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** „November 2026". */
export function monthLabel(ref: MonthRef): string {
  return new Date(ref.year, ref.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** „Thursday, November 12, 2026" — was die Vorlesesoftware zu einem Tag sagt. */
export function longDateLabel(iso: string): string {
  return fromISODate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Derselbe Tag im Nachbarmonat, für Bild auf/ab. Gibt es ihn dort nicht
 * (31. Januar → Februar), der letzte Tag des Monats statt eines Sprungs in
 * den März.
 */
export function shiftMonthKeepDay(iso: string, by: number): string {
  const d = fromISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + by, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return toISODate(target);
}
