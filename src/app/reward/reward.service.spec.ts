import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { Todo } from '../todo/model/todo.model';
import { TodoService } from '../todo/services/todo';
import { isGolden, xpAtLevel } from './level';
import { RewardService } from './reward.service';
import { BASE_XP } from './todo-xp';

let counter = 0;

function plainId(): string {
  let candidate: string;
  do {
    candidate = `r${++counter}`;
  } while (isGolden(candidate));
  return candidate;
}

function todo(partial: Partial<Todo> = {}): Todo {
  return {
    id: plainId(),
    title: 'Something',
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

describe('RewardService', () => {
  let items: WritableSignal<Todo[]>;
  let completions: Subject<Todo>;
  let service: RewardService;

  beforeEach(() => {
    vi.useFakeTimers();
    items = signal<Todo[]>([]);
    completions = new Subject<Todo>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: TodoService,
          useValue: {
            withArchive: items,
            completions,
            todoById: (id: string) => items().find((t) => t.id === id) ?? null,
          },
        },
      ],
    });
    service = TestBed.inject(RewardService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives XP from what is done, archive included', () => {
    items.set([
      todo({ completed: true, title: '/must A' }),
      todo({ completed: true, archivedAt: new Date() }),
      todo({ completed: false }),
    ]);
    expect(service.xp()).toBe(BASE_XP.must + BASE_XP.normal);
    expect(service.level().level).toBe(1);
  });

  it('announces the gain', () => {
    const open = todo({ title: '/should Thing' });
    items.set([open]);

    service.reward(open);

    expect(service.lastGain()).toMatchObject({ amount: BASE_XP.should, golden: false, combo: 1 });
  });

  it('celebrates one tick once, even when list and service both report it', () => {
    const open = todo();
    items.set([open]);

    service.reward(open);
    const first = service.lastGain()?.id;

    // 540 ms später meldet sich derselbe Haken über TodoService.completions.
    vi.advanceTimersByTime(540);
    items.set([{ ...open, completed: true }]);
    completions.next({ ...open, completed: true });

    expect(service.lastGain()?.id).toBe(first);
  });

  it('builds a combo for ticks in quick succession', () => {
    const a = todo();
    const b = todo();
    const c = todo();
    items.set([a, b, c]);

    service.reward(a);
    vi.advanceTimersByTime(5_000);
    service.reward(b);
    vi.advanceTimersByTime(5_000);
    service.reward(c);

    expect(service.lastGain()?.combo).toBe(3);
  });

  it('raises a level-up when a tick crosses the line — before the tick is saved', () => {
    // 45 XP erledigt; ein Must-have (30) hebt über 50.
    const done = Array.from({ length: 4 }, () => todo({ completed: true }));
    const almost = todo({ completed: true, title: '/wont Something' });
    const next = todo({ title: '/must The one' });
    items.set([...done, almost, next]);
    expect(service.xp()).toBe(45);

    service.reward(next);
    expect(service.levelUp()).toBeNull();

    vi.advanceTimersByTime(500);
    expect(service.levelUp()).toMatchObject({ gained: 1, to: { level: 2 } });
  });

  it('does not count the gain twice when the todo is already saved as done', () => {
    const done = Array.from({ length: 4 }, () => todo({ completed: true }));
    items.set(done);
    const ticked = todo({ completed: true, title: '/wont Small' });
    items.set([...done, ticked]);
    expect(service.xp()).toBe(xpAtLevel(2) - 5);

    // Über completions gemeldet, also schon im Bestand: kein Level-Up.
    service.reward(ticked);
    vi.advanceTimersByTime(500);
    expect(service.levelUp()).toBeNull();
  });
});
