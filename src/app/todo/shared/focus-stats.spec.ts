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
