import {
  bestStreak,
  capDay,
  describeBlocks,
  doneByDay,
  doneByTimeOfDay,
  focusPerTodo,
  formatHours,
  formatMinutes,
  periodDays,
  toCSV,
  heatmapWeeks,
  flowHistory,
  flowMinutes,
  heatLevel,
  mergeImport,
  minutesOn,
  periodTrend,
  sessionHistory,
  timelineSpans,
  type WorkBlock,
} from './focus-stats';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
/** Eine bis zum Ende gelaufene Sitzung, wie Flow sie auf den Server schreibt. */
const session = (todoId: string | null, start: Date, minutes: number, title = 'Bericht', completed = true) => ({
  todoId,
  todoTitle: title,
  startedAt: start,
  endedAt: new Date(start.getTime() + minutes * 60_000),
  elapsedSeconds: minutes * 60,
  plannedSeconds: minutes * 60,
  completed,
});
const flow = (start: string, end: string, minutes: number): WorkBlock => ({ start, end, minutes, source: 'flow' });
const imported = (start: string | null, end: string | null, minutes: number): WorkBlock => ({ start, end, minutes, source: 'import' });

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

  it('counts only sessions that ran to the end, with their planned length, like Flow', () => {
    expect(flowMinutes(session('a', at(28, 9), 25))).toBe(25);
    // Vorher gestoppt: zählt in Flow nicht, auch wenn Zeit verging.
    expect(flowMinutes(session('a', at(28, 9), 12, 'Bericht', false))).toBeNull();
    // Gezählt wird die geplante Länge, nicht die gemessene.
    expect(flowMinutes({ ...session('a', at(28, 9), 25), elapsedSeconds: 1490 })).toBe(25);
  });

  it('makes every session its own block, on the day it ended', () => {
    const history = sessionHistory([
      session('b', at(28, 14), 50),
      session('a', at(28, 9), 25),
      session('a', at(28, 9, 30), 25),
      session('a', at(28, 23, 50), 25),
      session('c', at(28, 16), 10, 'Mails', false),
    ]);
    expect(history['2026-10-28']).toEqual([flow('09:00', '09:25', 25), flow('09:30', '09:55', 25), flow('14:00', '14:50', 50)]);
    // Über Mitternacht: zählt am Tag des Endes.
    expect(history['2026-10-29']).toEqual([flow('23:50', '00:15', 25)]);
  });

  it('puts imported hours before the sessions of a day, once', () => {
    const merged = mergeImport({ '2026-10-12': [flow('19:00', '19:25', 25)] }, { '2026-10-12': [imported('09:10', '12:30', 200)] });
    expect(merged['2026-10-12']).toEqual([imported('09:10', '12:30', 200), flow('19:00', '19:25', 25)]);
    expect(mergeImport(merged, { '2026-10-12': [imported(null, null, 60)] })).toEqual(merged);
  });

  it('caps a day at eight hours from the back, like Flow', () => {
    const day = capDay([imported('09:00', '13:00', 240), imported('14:00', '18:00', 240), flow('19:00', '19:50', 50)]);
    expect(minutesOn(day)).toBe(480);
    expect(day).toHaveLength(2);
    const cut = capDay([imported('09:00', '13:00', 240), flow('14:00', '18:30', 270)]);
    expect(cut[1]).toEqual(flow('14:00', '18:00', 240));
    const history = flowHistory([session('a', at(20, 19), 50)], { '2026-10-20': [imported('09:00', '13:00', 240), imported('14:00', '18:00', 240)] });
    expect(minutesOn(history['2026-10-20'])).toBe(480);
  });

  it('describes a day like Flow', () => {
    expect(describeBlocks([flow('09:00', '09:25', 25), flow('14:00', '14:50', 50)])).toBe('09:00–09:25 · 14:00–14:50');
    expect(describeBlocks([imported(null, null, 120), imported(null, null, 60)])).toBe('2 blocks');
  });

  it('shows a trend only for finished periods, like Flow', () => {
    expect(periodTrend(600, 400, 0)).toBeNull();
    expect(periodTrend(600, 400, -1)).toBe(50);
    expect(periodTrend(600, 0, -1)).toBeNull();
    expect(periodTrend(0, 400, -1)).toBeNull();
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

  it('sums focus per todo within the period, most first, counted like Flow', () => {
    const out = focusPerTodo(
      [
        session('a', at(28, 9), 25),
        session('b', at(28, 10), 50, 'Mails'),
        session('a', at(29, 9), 30),
        session('a', at(1, 9), 99),
        session('a', at(29, 11), 40, 'Bericht', false),
      ],
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
      { date: '2026-10-28', blocks: [flow('09:00', '09:50', 50), flow('14:00', '14:50', 50)] },
      { date: '2026-10-29', blocks: [] },
      { date: '2026-10-30', blocks: [imported(null, null, 120)] },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Day;First Session;Hours;Second Session;Hours;Total;Total (h)',
      '28.10.2026;09:00-09:50;0:50;14:00-14:50;0:50;1:40;1,67',
      '30.10.2026;;2:00;;;2:00;2,00',
      'Total;;;;;3:40;3,67',
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
