import type { Todo } from '../model/todo.model';
import type { FocusSessionRecord } from '../services/focus-session.service';
import {
  clockTime,
  dayRange,
  doneOn,
  entryHas,
  homeEntries,
  stepIndex,
  focusBlocksOn,
  focusSecondsOn,
  layoutDay,
  openOn,
  totalFocusOn,
  type DayBlock,
} from './today';

const DAY = '2026-11-18';
const at = (h: number, m = 0, day = 18) => new Date(2026, 10, day, h, m);

function todo(id: string, extra: Partial<Todo> = {}): Todo {
  return {
    id,
    title: id,
    completed: false,
    isFavorite: false,
    labelIds: [],
    createdAt: at(8),
    scheduledDate: null,
    archivedAt: null,
    completedAt: null,
    seriesId: null,
    repeat: null,
    planId: null,
    ...extra,
  };
}

function session(id: string, start: Date, end: Date | null, extra: Partial<FocusSessionRecord> = {}): FocusSessionRecord {
  return {
    id,
    todoId: 't1',
    todoTitle: 'Film',
    startedAt: start,
    endedAt: end,
    elapsedSeconds: end ? (end.getTime() - start.getTime()) / 1000 : 600,
    plannedSeconds: 1500,
    completed: end !== null,
    ...extra,
  };
}

function block(id: string, start: Date, end: Date): DayBlock {
  return { id, kind: 'focus', todoId: null, title: id, start, end, running: false };
}

describe('doneOn', () => {
  it('lists what was finished today, the latest first, whatever day it was planned for', () => {
    const todos = [
      todo('early', { completed: true, completedAt: at(9) }),
      todo('late', { completed: true, completedAt: at(16), scheduledDate: '2026-11-15' }),
      todo('yesterday', { completed: true, completedAt: at(20, 0, 17) }),
      todo('open', { scheduledDate: DAY }),
    ];

    expect(doneOn(todos, DAY).map((t) => t.id)).toEqual(['late', 'early']);
  });

  it('leaves out finished tasks whose time nobody recorded', () => {
    expect(doneOn([todo('old', { completed: true, completedAt: null })], DAY)).toEqual([]);
  });
});

describe('openOn', () => {
  it('lists what is planned for the day and still open', () => {
    const todos = [
      todo('a', { scheduledDate: DAY }),
      todo('b', { scheduledDate: DAY, completed: true, completedAt: at(9) }),
      todo('c', { scheduledDate: '2026-11-19' }),
    ];

    expect(openOn(todos, DAY).map((t) => t.id)).toEqual(['a']);
  });
});

describe('focusBlocksOn', () => {
  it('keeps the part of a block after midnight and runs a live block until now', () => {
    const blocks = focusBlocksOn(
      [
        session('overnight', at(23, 30, 17), at(0, 30)),
        session('live', at(14), null),
        session('yesterday', at(10, 0, 17), at(11, 0, 17)),
      ],
      DAY,
      at(14, 20),
    );

    expect(blocks.map((b) => [b.id, clockTime(b.start), clockTime(b.end), b.running])).toEqual([
      ['overnight', '00:00', '00:30', false],
      ['live', '14:00', '14:20', true],
    ]);
  });
});

describe('focus totals', () => {
  const sessions = [
    session('a', at(9), at(9, 25), { elapsedSeconds: 1500 }),
    session('b', at(11), at(11, 10), { elapsedSeconds: 600, todoId: 't2' }),
    session('live', at(14), null, { elapsedSeconds: 300 }),
    session('old', at(9, 0, 17), at(10, 0, 17), { elapsedSeconds: 3600 }),
  ];

  it('adds up focus per task for the day, the running block included', () => {
    expect(Object.fromEntries(focusSecondsOn(sessions, DAY))).toEqual({ t1: 1800, t2: 600 });
  });

  it('adds up all focus of the day', () => {
    expect(totalFocusOn(sessions, DAY)).toBe(2400);
  });
});

describe('dayRange', () => {
  it('starts at six unless the day started earlier', () => {
    expect(dayRange([block('a', at(9), at(10))], DAY)).toEqual({ startHour: 6, endHour: 24 });
    expect(dayRange([block('a', at(4, 40), at(5))], DAY)).toEqual({ startHour: 4, endHour: 24 });
  });
});

describe('layoutDay', () => {
  const range = { startHour: 6, endHour: 24 };

  it('places a block by its time and length', () => {
    const [placed] = layoutDay([block('a', at(8), at(9, 30))], DAY, range, 48, 20);

    expect(placed).toMatchObject({ top: 96, height: 72, lane: 0, lanes: 1 });
  });

  it('gives very short entries a readable minimum height', () => {
    const [placed] = layoutDay([block('a', at(8), at(8, 2))], DAY, range, 48, 20);

    expect(placed.height).toBe(20);
  });

  it('lets a short running block grow upwards so it ends at now', () => {
    const live = { ...block('live', at(13, 12), at(13, 20)), running: true };
    const [placed] = layoutDay([live], DAY, range, 48, 20);

    // 13:20 liegt bei 7h20m * 48px = 352px; der Block endet dort.
    expect(placed.top + placed.height).toBeCloseTo(352);
    expect(placed.height).toBe(20);
  });

  it('puts overlapping entries side by side and leaves the rest full width', () => {
    const placed = layoutDay(
      [
        block('long', at(9), at(11)),
        block('inside', at(10), at(10, 30)),
        block('after', at(12), at(13)),
      ],
      DAY,
      range,
      48,
      20,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));

    expect([byId['long'].lane, byId['long'].lanes]).toEqual([0, 2]);
    expect([byId['inside'].lane, byId['inside'].lanes]).toEqual([1, 2]);
    expect([byId['after'].lane, byId['after'].lanes]).toEqual([0, 1]);
  });

  it('reuses a lane once it is free again inside the same group', () => {
    const placed = layoutDay(
      [
        block('long', at(9), at(12)),
        block('first', at(9, 30), at(10)),
        block('second', at(11), at(11, 30)),
      ],
      DAY,
      range,
      48,
      20,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));

    expect(byId['second'].lane).toBe(1);
    expect(byId['long'].lanes).toBe(2);
  });
});

describe('main tasks with their steps', () => {
  const list = [
    todo('head', { title: '/main Launch website' }),
    todo('s1', { title: '/sub Write copy', completed: true, completedAt: at(9) }),
    todo('s2', { title: '/sub Pick images', scheduledDate: DAY }),
    todo('s3', { title: '/sub Publish', scheduledDate: DAY }),
    todo('solo', { title: 'Call the bank', scheduledDate: DAY }),
    todo('section', { title: '/section Later' }),
    todo('orphan', { title: '/sub Under a heading' }),
  ];
  const index = stepIndex(list);

  it('knows the steps of every main task and the main task of every step', () => {
    expect(index.stepsOf.get('head')?.map((t) => t.id)).toEqual(['s1', 's2', 's3']);
    expect(index.headOf.get('s3')?.id).toBe('head');
    // Ein Schritt hinter einer Abschnittsüberschrift gehört keiner Aufgabe.
    expect(index.headOf.has('orphan')).toBe(false);
  });

  it('shows a main task once, with all its steps, when any of them is due', () => {
    const entries = homeEntries(openOn(list, DAY), index);

    expect(entries.map((e) => (e.kind === 'group' ? ['group', e.head.id, e.steps.map((s) => s.id)] : ['single', e.todo.id]))).toEqual([
      ['group', 'head', ['s1', 's2', 's3']],
      ['single', 'solo'],
    ]);
  });

  it('keeps a step on its own when it may not join its main task', () => {
    const entries = homeEntries([list[1]], index, () => false);

    expect(entries).toEqual([{ kind: 'single', key: 's1', todo: list[1] }]);
  });

  it('tells whether a task is part of an entry', () => {
    const [group, single] = homeEntries(openOn(list, DAY), index);

    expect(entryHas(group, 's1')).toBe(true);
    expect(entryHas(group, 'solo')).toBe(false);
    expect(entryHas(single, 'solo')).toBe(true);
  });
});
