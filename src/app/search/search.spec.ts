import type { Plan } from '../plan/plan.model';
import type { Todo } from '../todo/model/todo.model';
import type { Label } from '../todo/services/label.service';
import {
  blockTexts,
  highlight,
  isEmptyQuery,
  normalize,
  parseQuery,
  plainText,
  score,
  searchFolders,
  searchPlans,
  searchTodos,
  snippet,
} from './search';

let counter = 0;
function todo(title: string, partial: Partial<Todo> = {}): Todo {
  return {
    id: `t${++counter}`,
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
    planId: null,
    ...partial,
  };
}

function plan(title: string, content: Plan['content'] = []): Plan {
  return {
    id: `p${++counter}`,
    title,
    categoryId: null,
    content,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}

function label(name: string): Label {
  return {
    id: `l${++counter}`,
    name,
    color: 'teal',
    icon: 'tag',
    favoritePosition: null,
    isFavorite: false,
    collection: null,
  };
}

describe('normalize and score', () => {
  it('ignores case and accents', () => {
    expect(normalize('Über Café')).toBe('uber cafe');
    expect(score('Über den Pass', ['uber'])).not.toBeNull();
  });

  it('needs every term, in any order', () => {
    expect(score('Call the bank', ['bank', 'call'])).not.toBeNull();
    expect(score('Call the bank', ['bank', 'mail'])).toBeNull();
  });

  it('ranks the start over a word start over the middle', () => {
    expect(score('train to Bozen', ['train'])).toBeGreaterThan(score('book the train', ['train'])!);
    expect(score('book the train', ['train'])).toBeGreaterThan(score('retrain', ['train'])!);
  });
});

describe('parseQuery', () => {
  it('turns a leading prefix into a filter', () => {
    expect(parseQuery('/must ship')).toEqual({ token: 'must', terms: ['ship'] });
    expect(parseQuery('  Ship   IT ')).toEqual({ token: null, terms: ['ship', 'it'] });
    expect(isEmptyQuery(parseQuery('   '))).toBe(true);
    expect(isEmptyQuery(parseQuery('/sub '))).toBe(false);
  });
});

describe('searchTodos', () => {
  it('searches the text, never the hidden prefix', () => {
    const items = [todo('/must Ship it'), todo('Read about the must-have rule')];
    expect(searchTodos(items, parseQuery('must')).map((h) => h.title)).toEqual([
      'Read about the must-have rule',
    ]);
  });

  it('filters by prefix', () => {
    const items = [todo('/must Ship it'), todo('/should Ship docs'), todo('/sub Ship step')];
    expect(searchTodos(items, parseQuery('/must ship')).map((h) => h.title)).toEqual(['Ship it']);
    expect(searchTodos(items, parseQuery('/sub ')).map((h) => h.tokens)).toEqual([['sub']]);
  });

  it('shows both symbols of a must-have step and finds it by either', () => {
    const items = [todo('/must /sub Renew the passport'), todo('/should Pack')];
    expect(searchTodos(items, parseQuery('/sub ')).map((h) => [h.tokens, h.title])).toEqual([
      [['must', 'sub'], 'Renew the passport'],
    ]);
    expect(searchTodos(items, parseQuery('/must pass')).map((h) => h.title)).toEqual(['Renew the passport']);
  });

  it('finds done and archived todos too, but lists open ones first', () => {
    const archived = todo('Passport old', { completed: true, archivedAt: new Date() });
    const done = todo('Passport photo', { completed: true });
    const open = todo('Renew passport');
    expect(searchTodos([archived, done, open], parseQuery('passport')).map((h) => h.todo)).toEqual([
      open,
      done,
      archived,
    ]);
  });

  it('searches the notes under the first line, but prefers the title', () => {
    const inNotes = todo('Trip\nask about the passport');
    const inTitle = todo('Passport');
    expect(searchTodos([inNotes, inTitle], parseQuery('passport')).map((h) => h.todo)).toEqual([
      inTitle,
      inNotes,
    ]);
  });
});

describe('plans', () => {
  it('reads every kind of block, without markup', () => {
    const texts = blockTexts([
      { id: '1', type: 'text', text: 'Book **the train**' },
      { id: '2', type: 'list', variant: 'todo', items: [{ text: 'Pack [[Gear list]]', checked: false }] },
      { id: '3', type: 'table', columns: ['Day', 'Where'], rows: [['Mon', 'Bozen']] },
      { id: '4', type: 'group', title: 'Later', collapsed: true, blocks: [{ id: '5', type: 'quote', text: 'Ask Anna' }] },
      { id: '6', type: 'divider' },
    ]);
    expect(texts).toEqual(['Book the train', 'Pack Gear list', 'Day · Where', 'Mon · Bozen', 'Later', 'Ask Anna']);
  });

  it('strips links down to what they say', () => {
    expect(plainText('[[Trip|the trip]] and [docs](https://x.y)')).toBe('the trip and docs');
  });

  it('prefers a title match and otherwise shows where it matched', () => {
    const byTitle = plan('Bozen trip');
    const byContent = plan('Autumn', [{ id: 'a', type: 'text', text: 'Take the night train to Bozen on Friday' }]);
    const hits = searchPlans([byContent, byTitle], parseQuery('bozen'));
    expect(hits.map((h) => h.plan)).toEqual([byTitle, byContent]);
    expect(hits[1].snippet).toContain('Bozen');
  });

  it('ignores plans when filtering by prefix', () => {
    expect(searchPlans([plan('Must read')], parseQuery('/must read'))).toEqual([]);
  });
});

describe('searchFolders', () => {
  it('matches names, and only when something was typed', () => {
    const work = label('Work');
    expect(searchFolders([work, label('Home')], parseQuery('wor')).map((h) => h.label)).toEqual([work]);
    expect(searchFolders([work], parseQuery(''))).toEqual([]);
  });
});

describe('highlight and snippet', () => {
  it('marks every occurrence, accents included', () => {
    expect(highlight('Café or cafe', ['cafe'])).toEqual([
      { text: 'Café', match: true },
      { text: ' or ', match: false },
      { text: 'cafe', match: true },
    ]);
  });

  it('keeps markup as text', () => {
    expect(highlight('<b>bold</b>', ['bold'])).toEqual([
      { text: '<b>', match: false },
      { text: 'bold', match: true },
      { text: '</b>', match: false },
    ]);
  });

  it('cuts a window around the first match, with the match near the front', () => {
    const long = `${'a '.repeat(60)}Bozen${' b'.repeat(60)}`;
    const cut = snippet(long, ['bozen'], 10, 30);
    expect(cut.startsWith('…')).toBe(true);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.indexOf('Bozen')).toBeLessThan(15);
  });
});
