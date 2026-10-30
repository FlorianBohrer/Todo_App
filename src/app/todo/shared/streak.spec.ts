import { completionStreak } from './streak';

const done = (y: number, m: number, d: number) => ({ completed: true, completedAt: new Date(y, m - 1, d, 12) });

describe('completionStreak', () => {
  it('counts the days in a row up to today', () => {
    const todos = [done(2026, 10, 30), done(2026, 10, 29), done(2026, 10, 29), done(2026, 10, 28), done(2026, 10, 26)];
    expect(completionStreak(todos, '2026-10-30')).toEqual({ days: 3, today: true });
  });

  it('keeps yesterday’s streak alive until today is over', () => {
    expect(completionStreak([done(2026, 10, 29), done(2026, 10, 28)], '2026-10-30')).toEqual({ days: 2, today: false });
  });

  it('is zero after a missed day, and ignores open todos', () => {
    expect(completionStreak([done(2026, 10, 27)], '2026-10-30').days).toBe(0);
    expect(completionStreak([{ completed: false, completedAt: null }], '2026-10-30').days).toBe(0);
  });
});
