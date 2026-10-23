import { describe, expect, it } from 'vitest';

import { Todo } from '../model/todo.model';
import { doneByCompletionDay, weeklyReview } from './review';

// Samstag. Die Woche davor ist damit Mo 2026-09-28 bis So 2026-10-04.
const TODAY = '2026-10-10';

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
    archivedAt: null,
    completedAt: null,
    seriesId: null,
    repeat: null,
    planId: null,
    ...partial,
  };
}

/** Lokale Mitternacht, damit der Test nicht an der Zeitzone haengt. */
function at(iso: string, hour = 12): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour);
}

function done(iso: string, labelIds: string[] = []): Todo {
  return todo({ completed: true, completedAt: at(iso), labelIds });
}

describe('weeklyReview', () => {
  it('says nothing at all without completion times', () => {
    // Erledigt, aber ohne Zeitpunkt: genau der Zustand vor der Migration.
    // Eine Bilanz daraus waere geraten.
    expect(weeklyReview([todo({ completed: true }), todo({ completed: true })], TODAY)).toBeNull();
  });

  it('spans the previous calendar week, Monday to Sunday', () => {
    const review = weeklyReview([done('2026-10-01')], TODAY);

    expect(review?.from).toBe('2026-09-28');
    expect(review?.to).toBe('2026-10-04');
  });

  it('counts only what was finished inside that week', () => {
    const review = weeklyReview(
      [
        done('2026-09-27'), // Sonntag davor — zu alt
        done('2026-09-28'), // Montag — zaehlt
        done('2026-10-04'), // Sonntag — zaehlt
        done('2026-10-05'), // Montag danach — diese Woche
      ],
      TODAY,
    );

    expect(review?.total).toBe(2);
  });

  it('ignores an open todo even when something else carries a time', () => {
    const review = weeklyReview([done('2026-10-01'), todo({ completed: false })], TODAY);

    expect(review?.total).toBe(1);
  });

  it('groups by the primary folder, biggest first', () => {
    const review = weeklyReview(
      [
        done('2026-09-28', ['work']),
        done('2026-09-29', ['home']),
        done('2026-09-30', ['home']),
        done('2026-10-01', ['home']),
        done('2026-10-02', ['work']),
      ],
      TODAY,
    );

    expect(review?.groups).toEqual([
      { labelId: 'home', count: 3 },
      { labelId: 'work', count: 2 },
    ]);
  });

  it('keeps todos without a folder in last place, however many there are', () => {
    const review = weeklyReview(
      [done('2026-09-28'), done('2026-09-29'), done('2026-09-30'), done('2026-10-01', ['work'])],
      TODAY,
    );

    expect(review?.groups.at(-1)).toEqual({ labelId: null, count: 3 });
  });

  it('only the first folder counts, not every assigned one', () => {
    const review = weeklyReview([done('2026-09-28', ['home', 'work'])], TODAY);

    expect(review?.groups).toEqual([{ labelId: 'home', count: 1 }]);
  });

  it('flags a week the record does not fully cover', () => {
    // Erste bekannte Erledigung mitten in der Woche: davor fehlen Zeitpunkte,
    // die Zahl ist also zu klein. Das gehoert dazugesagt.
    const review = weeklyReview([done('2026-10-01'), done('2026-10-02')], TODAY);

    expect(review?.incompleteSince).toBe('2026-10-01');
  });

  it('stays quiet about it when the record reaches further back', () => {
    const review = weeklyReview([done('2026-09-20'), done('2026-10-01')], TODAY);

    expect(review?.incompleteSince).toBeNull();
  });

  it('reports an empty week as empty, not as missing', () => {
    // Zeitpunkte liegen vor, in dieser Woche wurde nur nichts fertig. Das ist
    // eine Aussage, und zwar eine andere als "wir wissen es nicht".
    const review = weeklyReview([done('2026-09-20'), done('2026-10-08')], TODAY);

    expect(review).not.toBeNull();
    expect(review?.total).toBe(0);
    expect(review?.groups).toEqual([]);
  });

  it('has nothing to say about a week that ended before the record began', () => {
    // Erste Erledigungszeit nach der Woche: ob darin etwas fertig wurde, ist
    // unbekannt. „Nichts erledigt" wäre eine Behauptung ohne Grundlage.
    expect(weeklyReview([done('2026-10-08')], TODAY)).toBeNull();
  });

  it('a Monday looks back at the week that just ended', () => {
    const review = weeklyReview([done('2026-10-07')], '2026-10-12');

    expect(review?.from).toBe('2026-10-05');
    expect(review?.to).toBe('2026-10-11');
    expect(review?.total).toBe(1);
  });

  it('a Sunday still looks at the week before, not the running one', () => {
    const review = weeklyReview([done('2026-10-01')], '2026-10-11');

    expect(review?.from).toBe('2026-09-28');
    expect(review?.total).toBe(1);
  });
});

describe('doneByCompletionDay', () => {
  it('counts per day of completion, not per planned day', () => {
    const byDay = doneByCompletionDay([
      // Geplant war der 28., fertig wurde es am 30. Die alte Schaetzung haette
      // den 28. gezaehlt.
      todo({
        completed: true,
        scheduledDate: '2026-09-28',
        completedAt: at('2026-09-30'),
      }),
      done('2026-09-30'),
      done('2026-10-01'),
    ]);

    expect(byDay.get('2026-09-30')).toBe(2);
    expect(byDay.get('2026-10-01')).toBe(1);
    expect(byDay.has('2026-09-28')).toBe(false);
  });

  it('leaves out what carries no time', () => {
    expect(doneByCompletionDay([todo({ completed: true })]).size).toBe(0);
  });
});
