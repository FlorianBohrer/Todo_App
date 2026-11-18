import type { Todo } from '../model/todo.model';
import { searchableTitle, trackCandidates } from './tracking';

const TODAY = '2026-11-18';

function todo(id: string, title: string, extra: Partial<Todo> = {}): Todo {
  return {
    id,
    title,
    completed: false,
    isFavorite: false,
    labelIds: [],
    createdAt: new Date(2026, 10, 1),
    scheduledDate: null,
    archivedAt: null,
    completedAt: null,
    seriesId: null,
    repeat: null,
    planId: null,
    ...extra,
  };
}

const ids = (sections: ReturnType<typeof trackCandidates>) =>
  sections.map((s) => [s.label, s.items.map((t) => t.id)]);

describe('searchableTitle', () => {
  it('reads the title without prefix and stars', () => {
    expect(searchableTitle('/must **Steuer** Belege')).toBe('steuer belege');
  });
});

describe('trackCandidates', () => {
  const todos = [
    todo('a', 'Write report', { scheduledDate: TODAY }),
    todo('b', '/must Call the bank', { scheduledDate: TODAY }),
    todo('c', 'Old thing', { scheduledDate: '2026-11-10' }),
    todo('d', 'Someday idea'),
    todo('e', 'Finished', { scheduledDate: TODAY, completed: true, completedAt: new Date() }),
    todo('f', 'Review pull request'),
  ];

  it('offers what is due first, the most important on top, then what was tracked lately', () => {
    expect(ids(trackCandidates(todos, { query: '', today: TODAY, recentIds: ['f', 'a', 'e'] }))).toEqual([
      ['Today', ['b', 'c', 'a']],
      ['Recently tracked', ['f']],
    ]);
  });

  it('falls back to the first open tasks when nothing is due or recent', () => {
    const plain = [todo('x', 'One'), todo('y', 'Two')];
    expect(ids(trackCandidates(plain, { query: '', today: TODAY, recentIds: [] }))).toEqual([
      ['Open tasks', ['x', 'y']],
    ]);
  });

  it('finds open tasks by every word, in any order, due ones first', () => {
    const more = [...todos, todo('g', 'Report numbers', { scheduledDate: '2026-11-25' })];
    expect(ids(trackCandidates(more, { query: 'REPORT', today: TODAY, recentIds: [] }))).toEqual([
      ['Matching tasks', ['a', 'g']],
    ]);
    expect(ids(trackCandidates(more, { query: 'bank call', today: TODAY, recentIds: [] }))).toEqual([
      ['Matching tasks', ['b']],
    ]);
  });

  it('never offers a finished task', () => {
    expect(trackCandidates(todos, { query: 'finished', today: TODAY, recentIds: [] })).toEqual([]);
  });
});
