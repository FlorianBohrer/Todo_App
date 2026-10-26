import {
  longDateLabel,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shiftMonthKeepDay,
} from './calendar';

describe('calendar', () => {
  it('starts the grid on the Monday on or before the 1st', () => {
    // 1 November 2026 is a Sunday.
    const grid = monthGrid({ year: 2026, month: 10 }, '2026-11-12');
    expect(grid[0][0].iso).toBe('2026-10-26');
    expect(grid[0][6].iso).toBe('2026-11-01');
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][6].inMonth).toBe(true);
  });

  it('always has six weeks of seven days', () => {
    // February 2027 starts on a Monday and fits in four rows.
    const grid = monthGrid({ year: 2027, month: 1 }, '2027-02-10');
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0].iso).toBe('2027-02-01');
  });

  it('marks today, the past and weekends', () => {
    const days = monthGrid({ year: 2026, month: 10 }, '2026-11-12').flat();
    const day = (iso: string) => days.find((d) => d.iso === iso)!;
    expect(day('2026-11-12').isToday).toBe(true);
    expect(day('2026-11-11').isPast).toBe(true);
    expect(day('2026-11-12').isPast).toBe(false);
    expect(day('2026-11-14').isWeekend).toBe(true);
    expect(day('2026-11-13').isWeekend).toBe(false);
  });

  it('pages across the year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthOf('2026-03-31')).toEqual({ year: 2026, month: 2 });
  });

  it('keeps the day of month when paging, clamped to the month end', () => {
    expect(shiftMonthKeepDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonthKeepDay('2026-03-15', -1)).toBe('2026-02-15');
    expect(shiftMonthKeepDay('2026-12-10', 1)).toBe('2027-01-10');
  });

  it('labels months and days in words', () => {
    expect(monthLabel({ year: 2026, month: 10 })).toBe('November 2026');
    expect(longDateLabel('2026-11-12')).toBe('Thursday, November 12, 2026');
  });
});
