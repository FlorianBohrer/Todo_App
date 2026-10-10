import { describe, expect, it } from 'vitest';

import { RepeatRule, Todo } from '../model/todo.model';
import {
  RHYTHM_WINDOW,
  addInterval,
  groupBySeries,
  rhythmByTodo,
  rhythmOf,
  seriesKey,
} from './rhythm';

// Samstag.
const TODAY = '2026-10-10';

const EVERY_2_DAYS: RepeatRule = { every: 2, unit: 'day', from: 'due' };

let counter = 0;
function todo(partial: Partial<Todo> = {}): Todo {
  return {
    id: `t${++counter}`,
    title: 'Sport',
    completed: false,
    isFavorite: false,
    labelIds: [],
    createdAt: new Date(2026, 8, 1),
    scheduledDate: null,
    archivedAt: null,
    completedAt: null,
    seriesId: null,
    repeat: EVERY_2_DAYS,
    planId: null,
    ...partial,
  };
}

/** Mittag lokal, damit der Tag nicht an der Zeitzone haengt. */
function at(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Eine Ausgabe, faellig am `due`, erledigt am `doneOn` (oder offen). */
function occ(due: string, doneOn: string | null, extra: Partial<Todo> = {}): Todo {
  return todo({
    scheduledDate: due,
    completed: doneOn !== null,
    completedAt: doneOn ? at(doneOn) : null,
    ...extra,
  });
}

describe('seriesKey', () => {
  it('falls back to the own id, so the first occurrence needs no value', () => {
    expect(seriesKey(todo({ id: 'a', seriesId: null }))).toBe('a');
  });

  it('uses the inherited id once there is one', () => {
    expect(seriesKey(todo({ id: 'b', seriesId: 'a' }))).toBe('a');
  });
});

describe('groupBySeries', () => {
  it('puts a source and its occurrences in one group', () => {
    const groups = groupBySeries([
      todo({ id: 'a', seriesId: null }),
      todo({ id: 'b', seriesId: 'a' }),
      todo({ id: 'c', seriesId: 'a' }),
    ]);

    expect(groups.size).toBe(1);
    expect(groups.get('a')?.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps unrelated todos apart', () => {
    const groups = groupBySeries([todo({ id: 'a' }), todo({ id: 'b' })]);
    expect([...groups.keys()]).toEqual(['a', 'b']);
  });
});

describe('addInterval (must match the backend exactly)', () => {
  it('clamps to the last day of a shorter month', () => {
    expect(addInterval('2026-01-31', 1, 'month')).toBe('2026-02-28');
  });

  it('knows leap years', () => {
    expect(addInterval('2028-01-31', 1, 'month')).toBe('2028-02-29');
  });

  it('crosses the year', () => {
    expect(addInterval('2026-12-15', 1, 'month')).toBe('2027-01-15');
  });

  it('adds weeks as seven days', () => {
    expect(addInterval('2026-10-30', 1, 'week')).toBe('2026-11-06');
  });

  it('is not thrown by a daylight-saving change', () => {
    // In Europa springt die Uhr in der Nacht zum 29.03.2026.
    expect(addInterval('2026-03-28', 2, 'day')).toBe('2026-03-30');
  });
});

describe('rhythmOf', () => {
  it('counts on time and early as hit, late as miss', () => {
    const rhythm = rhythmOf(
      [
        occ('2026-10-02', '2026-10-01'), // frueh — getroffen
        occ('2026-10-04', '2026-10-05'), // einen Tag zu spaet — verpasst
        occ('2026-10-06', '2026-10-06'), // puenktlich
        occ('2026-10-08', '2026-10-08'),
      ],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, false, true, true]);
  });

  it('gives a completed row without a time the benefit of the doubt', () => {
    // Abgehakt, bevor die App Zeitpunkte festhielt. Grau zu faerben, weil
    // damals niemand mitgeschrieben hat, waere eine Unterstellung.
    const rhythm = rhythmOf(
      [occ('2026-10-06', null, { completed: true }), occ('2026-10-08', '2026-10-08')],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, true]);
  });

  it('counts dates the server skipped as missed', () => {
    // Genau so entsteht eine Reihe auf dem Server: am 28. faellig, erst am 30.
    // abgehakt — die naechste Ausgabe landet dann auf dem 2., weil der 30.
    // schon vorbei ist. Den 30. gibt es als Zeile nie. Danach ist seit dem 4.
    // nichts mehr passiert: 4., 6. und 8. sind verstrichen.
    const rhythm = rhythmOf(
      [
        occ('2026-09-26', '2026-09-26'),
        occ('2026-09-28', '2026-09-30'),
        occ('2026-10-02', '2026-10-02'),
        occ('2026-10-04', null),
      ],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([
      true, // 26.
      false, // 28., zu spaet
      false, // 30., uebersprungen
      true, // 2.
      false, // 4., offen
      false, // 6., verstrichen
      false, // 8., verstrichen
    ]);
    expect(rhythm?.hit).toBe(2);
    expect(rhythm?.of).toBe(7);
  });

  it('invents no gaps after a completed last row', () => {
    // Ist die letzte erledigt, gibt es eine naechste — sie ist hier nur nicht
    // geladen. Dahinter Luecken zu zaehlen, hiesse, sie dem Nutzer anzurechnen.
    const rhythm = rhythmOf(
      [occ('2026-10-02', '2026-10-02'), occ('2026-10-04', '2026-10-04')],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, true]);
  });

  it('skips nothing for a rule that counts from completion', () => {
    // "Drei Tage nachdem ich es zuletzt gemacht habe" hat keinen festen
    // Kalender. Spaet bleibt spaet, aber uebersprungen wird nichts.
    const fromCompletion: RepeatRule = { every: 3, unit: 'day', from: 'completion' };
    const rhythm = rhythmOf(
      [
        occ('2026-09-28', '2026-09-30', { repeat: fromCompletion }),
        occ('2026-10-03', null, { repeat: fromCompletion }),
      ],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([false, false]);
  });

  it('leaves today out while it is still open', () => {
    const rhythm = rhythmOf(
      [occ('2026-10-06', '2026-10-06'), occ('2026-10-08', '2026-10-08'), occ(TODAY, null)],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, true]);
  });

  it('counts today once it is done', () => {
    const rhythm = rhythmOf(
      [occ('2026-10-06', '2026-10-06'), occ('2026-10-08', '2026-10-08'), occ(TODAY, TODAY)],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, true, true]);
  });

  it('never counts the future, nor today as skipped', () => {
    // Die naechste Ausgabe liegt auf dem 12. Laut Regel waere der 10. dran —
    // aber der 10. ist heute und noch nicht vorbei.
    const rhythm = rhythmOf(
      [occ('2026-10-06', '2026-10-06'), occ('2026-10-08', '2026-10-08'), occ('2026-10-12', null)],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([true, true]);
  });

  it('keeps only the last eight', () => {
    // Zwoelf Ausgaben im Abstand der Regel, die ersten vier offen geblieben.
    const rows = Array.from({ length: 12 }, (_, i) => {
      const due = addInterval('2026-09-01', i * 2, 'day');
      return occ(due, i < 4 ? null : due);
    });

    const rhythm = rhythmOf(rows, TODAY);

    expect(rhythm?.of).toBe(RHYTHM_WINDOW);
    expect(rhythm?.hit).toBe(8);
  });

  it('stays cheap and correct for a date years ago', () => {
    const daily: RepeatRule = { every: 1, unit: 'day', from: 'due' };
    const started = performance.now();

    const rhythm = rhythmOf([occ('2023-10-10', null, { repeat: daily })], TODAY);

    expect(performance.now() - started).toBeLessThan(50);
    expect(rhythm).toEqual({ marks: Array(8).fill(false), hit: 0, of: 8 });
  });

  it('sorts by date, not by the order the rows arrived in', () => {
    const rhythm = rhythmOf(
      [
        occ('2026-10-08', '2026-10-08'),
        occ('2026-10-04', '2026-10-05'),
        occ('2026-10-06', '2026-10-06'),
      ],
      TODAY,
    );

    expect(rhythm?.marks).toEqual([false, true, true]);
  });

  it('stays quiet at a single due date', () => {
    expect(rhythmOf([occ('2026-10-08', '2026-10-08')], TODAY)).toBeNull();
  });

  it('stays quiet without any dates at all', () => {
    expect(rhythmOf([todo(), todo(), todo()], TODAY)).toBeNull();
  });
});

describe('rhythmByTodo', () => {
  // Die Daten folgen dem, was der Server erzeugt: puenktlich am 8. erledigt
  // heisst, die naechste Ausgabe liegt auf dem 10.
  it('puts the rate on the open occurrence only', () => {
    const a = occ('2026-10-06', '2026-10-06', { id: 'a' });
    const b = occ('2026-10-08', '2026-10-08', { id: 'b', seriesId: 'a' });
    const c = occ(TODAY, null, { id: 'c', seriesId: 'a' });

    const byTodo = rhythmByTodo([a, b, c], TODAY);

    expect([...byTodo.keys()]).toEqual(['c']);
    expect(byTodo.get('c')).toEqual({ marks: [true, true], hit: 2, of: 2 });
  });

  it('shows nothing for a series without an open row', () => {
    const a = occ('2026-10-04', '2026-10-04', { id: 'a' });
    const b = occ('2026-10-06', '2026-10-06', { id: 'b', seriesId: 'a' });

    expect(rhythmByTodo([a, b], TODAY).size).toBe(0);
  });

  it('leaves out a one-off task, which has no rhythm to miss', () => {
    const once = occ('2026-10-04', '2026-10-04', { id: 'x', repeat: null });
    const open = occ('2026-10-06', null, { id: 'y', seriesId: 'x', repeat: null });

    expect(rhythmByTodo([once, open], TODAY).size).toBe(0);
  });

  it('does not mix two series', () => {
    const rows = [
      occ('2026-10-06', '2026-10-06', { id: 's1' }),
      occ('2026-10-08', '2026-10-08', { id: 's2', seriesId: 's1' }),
      occ(TODAY, null, { id: 's3', seriesId: 's1' }),
      // Zweimal je einen Tag zu spaet. Wer am 7. statt am 6. abhakt, bekommt
      // den 8. als naechsten Termin, wer am 9. statt am 8. abhakt, den 10.
      occ('2026-10-06', '2026-10-07', { id: 'b1', title: 'Bins' }),
      occ('2026-10-08', '2026-10-09', { id: 'b2', title: 'Bins', seriesId: 'b1' }),
      occ(TODAY, null, { id: 'b3', title: 'Bins', seriesId: 'b1' }),
    ];

    const byTodo = rhythmByTodo(rows, TODAY);

    expect(byTodo.get('s3')?.hit).toBe(2);
    expect(byTodo.get('b3')?.hit).toBe(0);
  });
});
