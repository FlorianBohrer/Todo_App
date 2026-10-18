import { Todo } from '../todo/model/todo.model';
import { isGolden } from './level';
import { BASE_XP, ON_TIME_BONUS, SUBTASK_XP, rewardFor, totalXp } from './todo-xp';

let counter = 0;

/** Eine id, die garantiert (nicht) golden ist — sonst wären die Tests ein Würfelspiel. */
function id(golden: boolean): string {
  let candidate: string;
  do {
    candidate = `t${++counter}`;
  } while (isGolden(candidate) !== golden);
  return candidate;
}

function todo(partial: Partial<Todo> = {}): Todo {
  return {
    id: id(false),
    title: 'Something',
    completed: true,
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

describe('rewardFor', () => {
  it('pays by MoSCoW level', () => {
    expect(rewardFor(todo({ title: '/must Ship it' })).total).toBe(BASE_XP.must);
    expect(rewardFor(todo({ title: '/should Tidy up' })).total).toBe(BASE_XP.should);
    expect(rewardFor(todo({ title: 'Plain' })).total).toBe(BASE_XP.normal);
    expect(rewardFor(todo({ title: '/could Maybe' })).total).toBe(BASE_XP.could);
    expect(rewardFor(todo({ title: "/won't Not now" })).total).toBe(BASE_XP.wont);
  });

  it('does not pay less for rating something a could-have than for not rating it', () => {
    expect(BASE_XP.could).toBeGreaterThanOrEqual(BASE_XP.normal);
  });

  it('pays a step of a bigger task less', () => {
    expect(rewardFor(todo({ title: '/sub One step' })).total).toBe(SUBTASK_XP);
  });

  it('adds the bonus when done on or before its day', () => {
    const onTheDay = todo({ scheduledDate: '2026-10-12', completedAt: new Date(2026, 9, 12, 21) });
    const early = todo({ scheduledDate: '2026-10-12', completedAt: new Date(2026, 9, 10, 9) });
    const late = todo({ scheduledDate: '2026-10-12', completedAt: new Date(2026, 9, 13, 0, 5) });

    expect(rewardFor(onTheDay)).toMatchObject({ onTime: true, total: BASE_XP.normal + ON_TIME_BONUS });
    expect(rewardFor(early).onTime).toBe(true);
    expect(rewardFor(late)).toMatchObject({ onTime: false, total: BASE_XP.normal });
  });

  it('claims no bonus when it does not know when something was done', () => {
    expect(rewardFor(todo({ scheduledDate: '2026-10-12', completedAt: null })).onTime).toBe(false);
  });

  it('doubles everything for a golden todo', () => {
    const golden = todo({
      id: id(true),
      title: '/must Big one',
      scheduledDate: '2026-10-12',
      completedAt: new Date(2026, 9, 12),
    });
    expect(rewardFor(golden)).toMatchObject({ golden: true, total: (BASE_XP.must + ON_TIME_BONUS) * 2 });
  });
});

describe('totalXp', () => {
  it('counts only what is done', () => {
    const items = [
      todo({ title: '/must A' }),
      todo({ title: 'B', completed: false }),
      todo({ title: 'C' }),
    ];
    expect(totalXp(items)).toBe(BASE_XP.must + BASE_XP.normal);
  });

  it('keeps archived todos — archiving costs nothing', () => {
    const archived = todo({ archivedAt: new Date(2026, 9, 5) });
    expect(totalXp([archived])).toBe(BASE_XP.normal);
  });
});
