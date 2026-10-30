import { Todo } from '../model/todo.model';
import { suggestTasks } from './suggestions';

const todo = (title: string, extra: Partial<Todo> = {}): Todo => ({
  id: title + Math.random(),
  title,
  completed: false,
  isFavorite: false,
  labelIds: [],
  createdAt: new Date(2026, 9, 1),
  scheduledDate: null,
  archivedAt: null,
  completedAt: null,
  seriesId: null,
  repeat: null,
  ...extra,
} as Todo);

const doneOn = (title: string, day: number) =>
  todo(title, { completed: true, completedAt: new Date(2026, 9, day, 10) });

describe('suggestTasks', () => {
  it('suggests what was done twice lately and is not open', () => {
    const todos = [doneOn('/30m Wäsche waschen', 10), doneOn('Wäsche waschen', 20), doneOn('Einmalig', 21)];
    const out = suggestTasks(todos, { today: '2026-10-30', limit: 10 });
    expect(out[0]).toEqual({ text: 'Wäsche waschen', minutes: 30, reason: 'again' });
    expect(out.some((s) => s.text === 'Einmalig')).toBe(false);
  });

  it('does not suggest it again while it is open', () => {
    const todos = [doneOn('Wäsche waschen', 10), doneOn('Wäsche waschen', 20), todo('Wäsche waschen')];
    expect(suggestTasks(todos, { today: '2026-10-30', limit: 20 }).some((s) => s.reason === 'again')).toBe(false);
  });

  it('writes ideas in the language of the list and skips what is already there', () => {
    const out = suggestTasks([todo('Wasser trinken'), todo('Zahnarzt anrufen')], { today: '2026-10-30', limit: 20 });
    expect(out.every((s) => s.reason === 'idea')).toBe(true);
    expect(out.some((s) => s.text === 'Die Woche planen')).toBe(true);
    expect(out.some((s) => /Wasser|Zahnarzt/.test(s.text))).toBe(false);
  });

  it('leans towards work when the list is mostly work', () => {
    const out = suggestTasks([todo('Fix the API bug'), todo('Write the report'), todo('Reply to the email')], {
      today: '2026-10-30',
      limit: 2,
    });
    expect(out.map((s) => s.text)).not.toContain('Water the houseplants');
  });

  it('shows the next ones on refresh', () => {
    const a = suggestTasks([], { seed: 0, limit: 4, today: '2026-10-30' });
    const b = suggestTasks([], { seed: 1, limit: 4, today: '2026-10-30' });
    expect(a).toHaveLength(4);
    expect(a.map((s) => s.text)).not.toEqual(b.map((s) => s.text));
  });
});
