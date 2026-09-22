import { Todo } from '../model/todo.model';
import {
  dailyLoad,
  moscowBalance,
  MUST_SHARE_LIMIT,
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
    // Die Priorisierung kennt weder Archiv noch Wiederholung noch Herkunft.
    // Die Felder stehen hier nur, damit die Attrappe ein vollstaendiges Todo
    // ist — waeren sie optional, verdeckte der Test kuenftige Luecken.
    archivedAt: null,
    repeat: null,
    planId: null,
    ...partial,
  };
}

describe('importanceOf', () => {
  it('reads all four MoSCoW levels from the title prefix', () => {
    expect(importanceOf('/must call the landlord')).toBe('must');
    expect(importanceOf('/should sort the inbox')).toBe('should');
    expect(importanceOf('/could tidy the desk')).toBe('could');
    expect(importanceOf("/won't rewrite the parser")).toBe('wont');
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
  it('keeps every adjacent level further apart than urgency can reach', () => {
    // Das ist die Invariante, auf der die ganze Rangfolge steht. Bricht sie,
    // schiebt sich eine dringende Kleinigkeit vor etwas Wichtiges — genau der
    // Fehler, den der Mere-Urgency-Effekt beschreibt.
    const mostUrgent = todo({ scheduledDate: '2020-01-01' }); // laengst faellig
    const leastUrgent = todo({});                             // ohne Tag
    const urgencySpan =
      focusScore(mostUrgent, TODAY) - focusScore(leastUrgent, TODAY);

    const levels = ['/must ', '/should ', '', '/could ', "/won't "];
    for (let i = 0; i < levels.length - 1; i++) {
      const higher = focusScore(todo({ title: `${levels[i]}x` }), TODAY);
      const lower = focusScore(todo({ title: `${levels[i + 1]}x` }), TODAY);
      expect(higher - lower).toBeGreaterThan(urgencySpan);
    }
  });

  it('puts a should-have above an unrated todo, and that above a could-have', () => {
    const should = focusScore(todo({ title: '/should a' }), TODAY);
    const plain = focusScore(todo({ title: 'a' }), TODAY);
    const could = focusScore(todo({ title: '/could a' }), TODAY);
    expect(should).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(could);
  });

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
  it('leaves out won\'t-haves — they are deliberately out of scope', () => {
    const wont = todo({ title: "/won't rewrite the parser", scheduledDate: TODAY });
    const plain = todo({ title: 'something', scheduledDate: TODAY });
    expect(rankForFocus([wont, plain], TODAY).map((t) => t.title)).toEqual(['something']);
  });

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

describe('moscowBalance', () => {
  const rated = (level: string, n: number) =>
    Array.from({ length: n }, () => todo({ title: `${level}x` }));

  it('counts each level separately', () => {
    const balance = moscowBalance([
      ...rated('/must ', 2),
      ...rated('/should ', 3),
      ...rated('/could ', 1),
      ...rated("/won't ", 4),
      ...rated('', 5),
    ]);
    expect(balance.counts.must).toBe(2);
    expect(balance.counts.should).toBe(3);
    expect(balance.counts.could).toBe(1);
    expect(balance.counts.wont).toBe(4);
    expect(balance.counts.normal).toBe(5);
  });

  it('leaves the unrated and the ruled-out out of the share', () => {
    // Unbewertet ist keine Einstufung; won\'t steht gar nicht zur Umsetzung an.
    const balance = moscowBalance([
      ...rated('/must ', 3),
      ...rated('/could ', 3),
      ...rated('', 20),
      ...rated("/won't ", 20),
    ]);
    expect(balance.rated).toBe(6);
    expect(balance.mustShare).toBeCloseTo(0.5);
  });

  it('flags a plan that is almost entirely must-have', () => {
    const balance = moscowBalance([...rated('/must ', 9), ...rated('/could ', 1)]);
    expect(balance.mustShare).toBeGreaterThan(MUST_SHARE_LIMIT);
    expect(balance.mustHeavy).toBe(true);
  });

  it('stays quiet at a healthy mix', () => {
    const balance = moscowBalance([
      ...rated('/must ', 3),
      ...rated('/should ', 4),
      ...rated('/could ', 3),
    ]);
    expect(balance.mustHeavy).toBe(false);
  });

  it('says nothing when there is barely anything rated', () => {
    // Bei drei Todos ist ein Anteil keine Aussage, sondern Rauschen.
    const balance = moscowBalance(rated('/must ', 3));
    expect(balance.mustShare).toBe(1);
    expect(balance.mustHeavy).toBe(false);
  });

  it('ignores finished todos', () => {
    const balance = moscowBalance([
      todo({ title: '/must done', completed: true }),
      ...rated('/could ', 2),
    ]);
    expect(balance.counts.must).toBe(0);
  });
});
