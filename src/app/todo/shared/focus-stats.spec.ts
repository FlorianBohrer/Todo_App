import {
  bestStreak,
  blocksByDay,
  capped,
  doneByDay,
  doneByTimeOfDay,
  focusPerTodo,
  formatHours,
  formatMinutes,
  periodDays,
  toCSV,
  heatmapWeeks,
  heatLevel,
  paceChange,
  timelineSpans,
} from './focus-stats';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const session = (todoId: string | null, start: Date, minutes: number, title = 'Bericht') => ({
  todoId,
  todoTitle: title,
  startedAt: start,
  endedAt: new Date(start.getTime() + minutes * 60_000),
  elapsedSeconds: minutes * 60,
});

describe('focus stats', () => {
  it('lists the days of a week and a month', () => {
    expect(periodDays('week', 0, '2026-10-30')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    expect(periodDays('week', -1, '2026-10-30')[0]).toBe('2026-10-19');
    const month = periodDays('month', 0, '2026-10-30');
    expect(month).toHaveLength(31);
    expect(month[0]).toBe('2026-10-01');
    expect(periodDays('month', -1, '2026-10-30')).toHaveLength(30);
  });

  it('joins sessions close together into one block, counting only the running time', () => {
    const blocks = blocksByDay([
      session('a', at(28, 9), 25),
      session('a', at(28, 9, 30), 25),
      session('b', at(28, 14), 50),
      session('b', at(29, 8), 0.5),
    ]);
    expect(blocks.get('2026-10-28')).toEqual([
      { start: '09:00', end: '09:55', minutes: 50 },
      { start: '14:00', end: '14:50', minutes: 50 },
    ]);
    expect(blocks.has('2026-10-29')).toBe(false);
  });

  it('caps a day at eight hours, like Flow', () => {
    expect(capped(530)).toBe(480);
    expect(capped(42.4)).toBe(42);
  });

  it('counts done todos per day, by time of day, and the best streak', () => {
    const todos = [
      { completed: true, completedAt: at(26, 9) },
      { completed: true, completedAt: at(27, 13) },
      { completed: true, completedAt: at(28, 20) },
      { completed: true, completedAt: at(28, 21) },
      { completed: true, completedAt: at(30, 10) },
      { completed: false, completedAt: null },
    ];
    const done = doneByDay(todos);
    expect(done.get('2026-10-28')).toBe(2);
    expect(bestStreak(done)).toBe(3);
    expect(doneByTimeOfDay(todos, ['2026-10-27', '2026-10-28'])).toEqual({ morning: 0, afternoon: 1, evening: 2 });
  });

  it('sums focus per todo within the period, most first', () => {
    const out = focusPerTodo(
      [session('a', at(28, 9), 25), session('b', at(28, 10), 50, 'Mails'), session('a', at(29, 9), 30), session('a', at(1, 9), 99)],
      ['2026-10-28', '2026-10-29'],
    );
    expect(out).toEqual([
      { todoId: 'a', title: 'Bericht', minutes: 55 },
      { todoId: 'b', title: 'Mails', minutes: 50 },
    ]);
  });

  it('formats like the todo app and like a timesheet', () => {
    expect(formatMinutes(440)).toBe('7h 20m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatHours(440)).toBe('7:20');
  });

  it('writes the same CSV timesheet as Flow', () => {
    const csv = toCSV([
      { date: '2026-10-28', blocks: [{ start: '09:00', end: '09:55', minutes: 50 }, { start: '14:00', end: '14:50', minutes: 50 }], minutes: 100 },
      { date: '2026-10-29', blocks: [], minutes: 0 },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Day;First Session;Hours;Second Session;Hours;Total;Total (h)',
      '28.10.2026;09:00-09:55;0:50;14:00-14:50;0:50;1:40;1,67',
      'Total;;;;;1:40;1,67',
      '',
    ]);
  });
});

describe('heatmapWeeks', () => {
  it('ends with the running week and starts on Mondays', () => {
    const weeks = heatmapWeeks(13, '2026-11-04');
    expect(weeks.length).toBe(13);
    expect(weeks[12].days[0]).toBe('2026-11-02');
    expect(weeks[0].days[0]).toBe('2026-08-10');
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
  });

  it('names a month above the week it begins in', () => {
    const weeks = heatmapWeeks(13, '2026-11-04');
    expect(weeks[0].month).toBe('2026-08');
    const labelled = weeks.filter((w) => w.month).map((w) => w.month);
    expect(labelled).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
  });
});

describe('heatLevel', () => {
  it('steps from nothing to a full day', () => {
    expect([0, 20, 90, 200, 400].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('paceChange', () => {
  it('compares the same number of days', () => {
    // Bis Mittwoch 300 gegen 200 Minuten — der Rest der Vorwoche zählt nicht.
    expect(paceChange([100, 100, 100, 0, 0, 0, 0], [100, 50, 50, 400, 400, 0, 0], 2)).toBe(50);
  });

  it('says nothing without a base', () => {
    expect(paceChange([60, 0], [0, 0], 1)).toBeNull();
    expect(paceChange([0, 0], [60, 0], 1)).toBeNull();
  });
});

describe('timelineSpans', () => {
  it('places blocks between six and midnight', () => {
    const { start, spans } = timelineSpans([{ start: '15:00', end: '18:00', minutes: 180 }]);
    expect(start).toBe(360);
    expect(spans[0].left).toBeCloseTo(50);
    expect(spans[0].width).toBeCloseTo((180 / 1080) * 100);
  });

  it('starts earlier when a block does', () => {
    const { start } = timelineSpans([{ start: '04:40', end: '05:30', minutes: 50 }]);
    expect(start).toBe(240);
  });
});
