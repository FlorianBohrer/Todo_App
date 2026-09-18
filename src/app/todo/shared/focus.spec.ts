import { Todo } from '../model/todo.model';
import {
  dailyLoad,
  focusReason,
  focusScore,
  importanceOf,
  pastThroughput,
  rankForFocus,
  unplannedImportant,
  urgencyOf,
} from './focus';

const TODAY = '2026-09-18';

let counter = 0;
function todo(partial: Partial<Todo> = {}): Todo {
  return {
    id: `t${++counter}`,
    title: 'Something',
    completed: false,
    isFavorite: false,
    labelIds: [],
    createdAt: new Date(2026, 8, 1),
    scheduledDate: null,
    ...partial,
  };
}

describe('importanceOf', () => {
  it('reads the title prefix the app already uses', () => {
    expect(importanceOf('/must call the landlord')).toBe('must');
    expect(importanceOf('/could tidy the desk')).toBe('could');
    expect(importanceOf('call the landlord')).toBe('normal');
  });
});

describe('urgencyOf', () => {
  it('names the distance to today', () => {
    expect(urgencyOf(null, TODAY)).toBe('none');
    expect(urgencyOf('2026-09-17', TODAY)).toBe('overdue');
    expect(urgencyOf(TODAY, TODAY)).toBe('today');
    expect(urgencyOf('2026-09-19', TODAY)).toBe('tomorrow');
    expect(urgencyOf('2026-09-23', TODAY)).toBe('week');
    expect(urgencyOf('2026-09-25', TODAY)).toBe('week');
    expect(urgencyOf('2026-09-26', TODAY)).toBe('later');
  });
});

describe('focusScore — urgency never outranks importance', () => {
  // Das ist der Punkt der ganzen Uebung (Mere-Urgency-Effekt): eine dringende
  // Kleinigkeit darf eine wichtige Sache nicht verdraengen.
  it('puts a far-off must-have above the most urgent could-have', () => {
    const must = todo({ title: '/must file the taxes', scheduledDate: '2026-12-01' });
    const could = todo({ title: '/could reply to that newsletter', scheduledDate: '2026-09-01' });
    expect(focusScore(must, TODAY)).toBeGreaterThan(focusScore(could, TODAY));
  });

  it('puts an unscheduled must-have above an overdue normal todo', () => {
    const must = todo({ title: '/must renew the passport' });
    const normal = todo({ scheduledDate: '2026-09-10' });
    expect(focusScore(must, TODAY)).toBeGreaterThan(focusScore(normal, TODAY));
  });

  it('lets urgency decide inside one level of importance', () => {
    const overdue = todo({ title: '/must a', scheduledDate: '2026-09-10' });
    const later = todo({ title: '/must b', scheduledDate: '2026-12-01' });
    expect(focusScore(overdue, TODAY)).toBeGreaterThan(focusScore(later, TODAY));
  });
});

describe('rankForFocus', () => {
  it('drops finished todos and orders by score', () => {
    const done = todo({ title: '/must done', completed: true });
    const could = todo({ title: '/could later' });
    const must = todo({ title: '/must now', scheduledDate: TODAY });
    const normal = todo({ scheduledDate: TODAY });

    const ranked = rankForFocus([done, could, must, normal], TODAY);
    expect(ranked.map((t) => t.title)).toEqual(['/must now', 'Something', '/could later']);
  });

  it('keeps the order the user set when the score is equal', () => {
    const first = todo({ title: 'first', scheduledDate: TODAY });
    const second = todo({ title: 'second', scheduledDate: TODAY });
    expect(rankForFocus([first, second], TODAY).map((t) => t.title)).toEqual(['first', 'second']);
    expect(rankForFocus([second, first], TODAY).map((t) => t.title)).toEqual(['second', 'first']);
  });
});

describe('focusReason', () => {
  it('says what put the todo there', () => {
    expect(focusReason(todo({ title: '/must x', scheduledDate: '2026-09-10' }), TODAY))
      .toBe('Must-have · past its day');
    expect(focusReason(todo({ scheduledDate: TODAY }), TODAY)).toBe('planned for today');
    expect(focusReason(todo({ title: '/must x' }), TODAY)).toBe('Must-have · no day yet');
  });
});

describe('unplannedImportant', () => {
  it('finds open must-haves without a day', () => {
    const wanted = todo({ title: '/must renew the passport' });
    const items = [
      wanted,
      todo({ title: '/must already planned', scheduledDate: TODAY }),
      todo({ title: '/must already done', completed: true }),
      todo({ title: 'not important' }),
    ];
    expect(unplannedImportant(items)).toEqual([wanted]);
  });
});

describe('pastThroughput', () => {
  it('says nothing until there is enough history', () => {
    expect(pastThroughput([], TODAY)).toBeNull();
    expect(pastThroughput(
      [todo({ scheduledDate: '2026-09-16', completed: true }),
       todo({ scheduledDate: '2026-09-17', completed: true })],
      TODAY,
    )).toBeNull();
  });

  it('takes the median of what was finished per planned day', () => {
    const items = [
      // 15.09.: 1 fertig
      todo({ scheduledDate: '2026-09-15', completed: true }),
      todo({ scheduledDate: '2026-09-15' }),
      // 16.09.: 4 fertig
      ...Array.from({ length: 4 }, () => todo({ scheduledDate: '2026-09-16', completed: true })),
      // 17.09.: 3 fertig
      ...Array.from({ length: 3 }, () => todo({ scheduledDate: '2026-09-17', completed: true })),
    ];
    expect(pastThroughput(items, TODAY)).toBe(3);
  });

  it('ignores today and the future — those days are not over', () => {
    const items = [
      todo({ scheduledDate: '2026-09-15', completed: true }),
      todo({ scheduledDate: '2026-09-16', completed: true }),
      todo({ scheduledDate: '2026-09-17', completed: true }),
      ...Array.from({ length: 9 }, () => todo({ scheduledDate: TODAY, completed: true })),
      ...Array.from({ length: 9 }, () => todo({ scheduledDate: '2026-09-30', completed: true })),
    ];
    expect(pastThroughput(items, TODAY)).toBe(1);
  });

  it('counts a planned day with nothing finished as zero, not as missing', () => {
    const items = [
      todo({ scheduledDate: '2026-09-15' }),
      todo({ scheduledDate: '2026-09-16', completed: true }),
      todo({ scheduledDate: '2026-09-17', completed: true }),
    ];
    expect(pastThroughput(items, TODAY)).toBe(1);
  });
});

describe('dailyLoad', () => {
  const history = [
    todo({ scheduledDate: '2026-09-15', completed: true }),
    todo({ scheduledDate: '2026-09-16', completed: true }),
    todo({ scheduledDate: '2026-09-17', completed: true }),
  ];

  it('counts today and compares it with the usual day', () => {
    const load = dailyLoad(
      [...history, ...Array.from({ length: 5 }, () => todo({ scheduledDate: TODAY }))],
      TODAY,
    );
    expect(load.open).toBe(5);
    expect(load.done).toBe(0);
    expect(load.typical).toBe(1);
    expect(load.overCommitted).toBe(true);
  });

  it('makes no claim without history', () => {
    const load = dailyLoad(
      Array.from({ length: 9 }, () => todo({ scheduledDate: TODAY })),
      TODAY,
    );
    expect(load.typical).toBeNull();
    expect(load.overCommitted).toBe(false);
  });

  it('counts finished todos of today as done, not as open', () => {
    const load = dailyLoad(
      [...history, todo({ scheduledDate: TODAY, completed: true }), todo({ scheduledDate: TODAY })],
      TODAY,
    );
    expect(load.done).toBe(1);
    expect(load.open).toBe(1);
  });
});
