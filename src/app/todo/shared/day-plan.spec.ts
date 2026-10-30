import { Todo } from '../model/todo.model';
import { dayPlan, openPerDay, weekDaysOf } from './day-plan';

const todo = (title: string, scheduledDate: string | null, completed = false): Todo =>
  ({
    id: title,
    title,
    completed,
    isFavorite: false,
    labelIds: [],
    createdAt: new Date(2026, 9, 1),
    scheduledDate,
    archivedAt: null,
    completedAt: null,
    seriesId: null,
    repeat: null,
    planId: null,
  }) as unknown as Todo;

describe('dayPlan', () => {
  const todos = [
    todo('/morning /15m Wasser', '2026-10-30'),
    todo('/evening Lesen', '2026-10-30'),
    todo('Mails', '2026-10-30', true),
    todo('/must Bericht', '2026-10-30'),
    todo('Alt', '2026-10-27'),
    todo('/section Später', '2026-10-30'),
    todo('Morgen', '2026-10-31'),
  ];

  it('sorts the day into times of day, overdue first on today', () => {
    const plan = dayPlan(todos, '2026-10-30', '2026-10-30');
    expect(plan.slots.morning.map((t) => t.id)).toEqual(['/morning /15m Wasser']);
    expect(plan.slots.evening.map((t) => t.id)).toEqual(['/evening Lesen']);
    expect(plan.slots.anytime.map((t) => t.id)).toEqual(['/must Bericht', 'Mails']);
    expect(plan.slots.overdue.map((t) => t.id)).toEqual(['Alt']);
  });

  it('counts done and the minutes still planned', () => {
    const plan = dayPlan(todos, '2026-10-30', '2026-10-30');
    expect(plan.done).toBe(1);
    expect(plan.total).toBe(4);
    expect(plan.minutesLeft).toBe(15);
  });

  it('shows overdue only on today', () => {
    expect(dayPlan(todos, '2026-10-31', '2026-10-30').slots.overdue).toEqual([]);
  });

  it('knows the week and the open todos per day', () => {
    expect(weekDaysOf('2026-10-30')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    expect(openPerDay(todos).get('2026-10-30')).toBe(3);
  });
});
