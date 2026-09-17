import {
  buildWeek,
  fromISODate,
  isoWeekNumber,
  shiftISODate,
  toISODate,
  weekRangeLabel,
} from './week';

describe('toISODate / fromISODate', () => {
  it('formats a local date without shifting the day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips through the ISO string', () => {
    const iso = '2026-03-09';
    expect(toISODate(fromISODate(iso))).toBe(iso);
  });

  it('reads the ISO string as a local date, not as UTC', () => {
    // `new Date('2026-03-09')` waere Mitternacht UTC — westlich von Greenwich
    // also noch der 8. Der Parser hier muss den 9. liefern, egal wo man sitzt.
    const d = fromISODate('2026-03-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(9);
  });
});

describe('shiftISODate', () => {
  it('moves a day forward and back', () => {
    expect(shiftISODate('2026-03-09', 1)).toBe('2026-03-10');
    expect(shiftISODate('2026-03-09', -1)).toBe('2026-03-08');
  });

  it('crosses month and year boundaries', () => {
    expect(shiftISODate('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftISODate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftISODate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('knows about leap years', () => {
    expect(shiftISODate('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('isoWeekNumber', () => {
  it('counts from the week holding the first Thursday', () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);   // Do, 1. Jan 2026
    expect(isoWeekNumber(new Date(2026, 8, 17))).toBe(38);
  });

  it('puts an early January day in the last week of the old year', () => {
    // Fr, 1. Jan 2027 gehoert noch zur 53. Woche von 2026.
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
  });

  it('puts a late December day in week 1 of the next year', () => {
    // Mo, 29. Dez 2025 startet die Woche mit dem 1. Januar.
    expect(isoWeekNumber(new Date(2025, 11, 29))).toBe(1);
  });
});

describe('buildWeek', () => {
  it('returns seven days starting on Monday', () => {
    const days = buildWeek(0);
    expect(days.length).toBe(7);
    expect(days[0].weekdayShort).toBe('Mon');
    expect(days[6].weekdayShort).toBe('Sun');
    expect(days[0].date.getDay()).toBe(1);
  });

  it('marks exactly one day as today in the current week, none in others', () => {
    expect(buildWeek(0).filter((d) => d.isToday).length).toBe(1);
    expect(buildWeek(1).some((d) => d.isToday)).toBe(false);
    expect(buildWeek(-1).some((d) => d.isToday)).toBe(false);
  });

  it('marks the weekend and never marks today as past', () => {
    const days = buildWeek(0);
    expect(days[5].isWeekend).toBe(true);
    expect(days[6].isWeekend).toBe(true);
    expect(days.slice(0, 5).some((d) => d.isWeekend)).toBe(false);
    expect(days.find((d) => d.isToday)!.isPast).toBe(false);
  });

  it('treats a whole earlier week as past and a later one as not', () => {
    expect(buildWeek(-1).every((d) => d.isPast)).toBe(true);
    expect(buildWeek(1).some((d) => d.isPast)).toBe(false);
  });

  it('steps a full week per offset', () => {
    const base = buildWeek(0)[0].iso;
    expect(buildWeek(1)[0].iso).toBe(shiftISODate(base, 7));
    expect(buildWeek(-2)[0].iso).toBe(shiftISODate(base, -14));
  });
});

describe('weekRangeLabel', () => {
  it('names the month once inside a single month', () => {
    // Mo, 20. Jul 2026 – So, 26. Jul 2026
    const days = buildWeek(0).map((d, i) => ({ ...d, date: new Date(2026, 6, 20 + i) }));
    expect(weekRangeLabel(days)).toBe('Jul 20 – 26');
  });

  it('names both months across a month boundary', () => {
    const days = buildWeek(0).map((d, i) => ({ ...d, date: new Date(2026, 5, 29 + i) }));
    expect(weekRangeLabel(days)).toBe('Jun 29 – Jul 5');
  });
});
