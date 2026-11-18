import { ActiveFocus, elapsedNow, formatClock, formatFocus } from './focus-session.service';

describe('formatFocus', () => {
  it('stays short enough for a row', () => {
    expect(formatFocus(25 * 60)).toBe('25m');
    expect(formatFocus(80 * 60)).toBe('1h 20m');
    expect(formatFocus(120 * 60)).toBe('2h');
    expect(formatFocus(89)).toBe('1m');
  });
});

describe('formatClock', () => {
  it('reads like a stopwatch', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(610)).toBe('10:10');
    expect(formatClock(3730)).toBe('1:02:10');
    expect(formatClock(36_000)).toBe('10:00:00');
  });
});

describe('elapsedNow', () => {
  const base: ActiveFocus = {
    id: 's1', todoId: 't1', title: 'Film', paused: false, endsAt: null,
    remainingSeconds: 0, elapsedSeconds: 600, runningFrom: 1_000_000, tracked: true, startedAt: 0,
  };

  it('counts on from when it started running', () => {
    expect(elapsedNow(base, 1_000_000 + 754_000)).toBe(754);
  });

  it('stands still while paused', () => {
    expect(elapsedNow({ ...base, paused: true, runningFrom: null }, 9_999_999)).toBe(600);
  });

  it('never goes below what the server reported', () => {
    expect(elapsedNow(base, 1_000_000)).toBe(600);
  });
});
