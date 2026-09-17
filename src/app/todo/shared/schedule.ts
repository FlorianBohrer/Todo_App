/**
 * Termine vergeben, ohne einen Kalender zu öffnen.
 *
 * Ein Todo trägt ein `scheduledDate`, aber bisher konnte man es nur in der
 * Wochenansicht per Ziehen setzen. Die Liste kannte den Termin nicht einmal.
 * Hier stehen die paar Angebote, die man in einer Todo-App tatsächlich
 * braucht — und die Beschriftung, die ein Datum lesbar macht.
 */
import { fromISODate, shiftISODate, todayISO } from './week';

export interface ScheduleOption {
  key: string;
  label: string;
  /** 'YYYY-MM-DD' */
  iso: string;
}

/** Montag = 0 … Sonntag = 6. */
function weekdayIndex(iso: string): number {
  return (fromISODate(iso).getDay() + 6) % 7;
}

/**
 * Heute, morgen, Wochenende, nächste Woche.
 *
 * Fällt ein Angebot auf denselben Tag wie ein vorheriges — am Samstag ist das
 * Wochenende eben heute —, fliegt es raus: zwei Knöpfe mit gleicher Wirkung
 * sind schlimmer als ein Knopf weniger.
 */
export function scheduleOptions(today = todayISO()): ScheduleOption[] {
  const dow = weekdayIndex(today);
  const toSaturday = dow <= 4 ? 5 - dow : 0; // am Wochenende: heute
  const toMonday = 7 - dow;

  const all: ScheduleOption[] = [
    { key: 'today', label: 'Today', iso: today },
    { key: 'tomorrow', label: 'Tomorrow', iso: shiftISODate(today, 1) },
    { key: 'weekend', label: 'Weekend', iso: shiftISODate(today, toSaturday) },
    { key: 'next-week', label: 'Next week', iso: shiftISODate(today, toMonday) },
  ];

  const seen = new Set<string>();
  return all.filter((option) => {
    if (seen.has(option.iso)) return false;
    seen.add(option.iso);
    return true;
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Kurze Beschriftung für einen Termin: nah dran in Worten, weiter weg als
 * Datum. „Thu" sagt mehr als „2026-09-24", solange der Donnerstag noch kommt.
 */
export function scheduleLabel(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today';
  if (iso === shiftISODate(today, 1)) return 'Tomorrow';
  if (iso === shiftISODate(today, -1)) return 'Yesterday';

  // Innerhalb der nächsten Woche reicht der Wochentag.
  for (let i = 2; i <= 6; i++) {
    if (iso === shiftISODate(today, i)) return WEEKDAYS[weekdayIndex(iso)];
  }

  return fromISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Termin liegt vor heute und ist damit verstrichen. */
export function isOverdueDate(iso: string | null, today = todayISO()): boolean {
  return iso !== null && iso < today;
}
