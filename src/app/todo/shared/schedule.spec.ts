import { isOverdueDate, scheduleLabel, scheduleOptions } from './schedule';
import { shiftISODate } from './week';

// Feste Bezugstage, damit die Tests nicht davon abhaengen, wann sie laufen.
const MONDAY = '2026-09-14';
const FRIDAY = '2026-09-18';
const SATURDAY = '2026-09-19';
const SUNDAY = '2026-09-20';

describe('scheduleOptions', () => {
  it('offers today, tomorrow, the weekend and next week', () => {
    const options = scheduleOptions(MONDAY);
    expect(options.map((o) => o.key)).toEqual(['today', 'tomorrow', 'weekend', 'next-week']);
    expect(options[0].iso).toBe(MONDAY);
    expect(options[1].iso).toBe('2026-09-15');
    expect(options[2].iso).toBe(SATURDAY);
    expect(options[3].iso).toBe('2026-09-21'); // der Montag darauf
  });

  it('points "weekend" at the coming Saturday', () => {
    const thursday = '2026-09-17';
    expect(scheduleOptions(thursday).find((o) => o.key === 'weekend')!.iso).toBe(SATURDAY);
  });

  it('leaves the weekend out on Friday — tomorrow already is Saturday', () => {
    const options = scheduleOptions(FRIDAY);
    expect(options.map((o) => o.key)).toEqual(['today', 'tomorrow', 'next-week']);
    expect(options.find((o) => o.key === 'tomorrow')!.iso).toBe(SATURDAY);
  });

  it('drops an option that would repeat a day already offered', () => {
    // Samstag: „Wochenende" waere heute — ein zweiter Knopf mit gleicher Wirkung.
    const saturday = scheduleOptions(SATURDAY);
    expect(saturday.map((o) => o.key)).toEqual(['today', 'tomorrow', 'next-week']);

    // Sonntag: „Wochenende" waere heute, „naechste Woche" ist morgen.
    const sunday = scheduleOptions(SUNDAY);
    expect(sunday.map((o) => o.key)).toEqual(['today', 'tomorrow']);
  });

  it('never offers the same day twice', () => {
    for (let i = 0; i < 7; i++) {
      const isos = scheduleOptions(shiftISODate(MONDAY, i)).map((o) => o.iso);
      expect(new Set(isos).size).toBe(isos.length);
    }
  });
});

describe('scheduleLabel', () => {
  it('uses words for the days right around today', () => {
    expect(scheduleLabel(MONDAY, MONDAY)).toBe('Today');
    expect(scheduleLabel('2026-09-15', MONDAY)).toBe('Tomorrow');
    expect(scheduleLabel('2026-09-13', MONDAY)).toBe('Yesterday');
  });

  it('uses the weekday for the rest of the coming week', () => {
    expect(scheduleLabel('2026-09-16', MONDAY)).toBe('Wed');
    expect(scheduleLabel('2026-09-20', MONDAY)).toBe('Sun');
  });

  it('falls back to a date once the weekday stops being unambiguous', () => {
    expect(scheduleLabel('2026-09-21', MONDAY)).toBe('Sep 21');
    expect(scheduleLabel('2026-12-24', MONDAY)).toBe('Dec 24');
    expect(scheduleLabel('2026-09-07', MONDAY)).toBe('Sep 7');
  });
});

describe('isOverdueDate', () => {
  it('is true only for a day that is already gone', () => {
    expect(isOverdueDate('2026-09-13', MONDAY)).toBe(true);
    expect(isOverdueDate(MONDAY, MONDAY)).toBe(false);
    expect(isOverdueDate('2026-09-15', MONDAY)).toBe(false);
  });

  it('treats an unscheduled todo as not overdue', () => {
    expect(isOverdueDate(null, MONDAY)).toBe(false);
  });
});
