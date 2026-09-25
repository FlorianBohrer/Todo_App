import { alphaLabel, listMarkers, romanLabel } from './list-markers';

const items = (...levels: number[]) =>
  levels.map((level) => ({ text: 'x', checked: false, level }));

describe('listMarkers', () => {
  it('changes the bullet with the depth', () => {
    expect(listMarkers(items(0, 1, 2, 3), 'bullet')).toEqual(['•', '◦', '▪', '▪']);
  });

  it('numbers each level on its own', () => {
    expect(listMarkers(items(0, 0, 1, 1, 0), 'number')).toEqual([
      '1.', '2.', 'a.', 'b.', '3.',
    ]);
  });

  it('starts a sub-level again under the next parent', () => {
    // Genau der Fall, fuer den es die Vorgeschichte braucht: „a." muss zweimal
    // vorkommen, einmal unter 1. und einmal unter 2.
    expect(listMarkers(items(0, 1, 0, 1), 'number')).toEqual(['1.', 'a.', '2.', 'a.']);
  });

  it('goes to roman numerals on the third level', () => {
    expect(listMarkers(items(0, 1, 2, 2), 'number')).toEqual(['1.', 'a.', 'i.', 'ii.']);
  });

  it('treats a missing level as the top one', () => {
    expect(listMarkers([{ text: 'x', checked: false }], 'number')).toEqual(['1.']);
  });

  it('gives a checklist bullets, not numbers', () => {
    expect(listMarkers(items(0, 0), 'todo')).toEqual(['•', '•']);
  });

  it('handles an empty list', () => {
    expect(listMarkers([], 'number')).toEqual([]);
  });
});

describe('alphaLabel', () => {
  it('counts through the alphabet and beyond', () => {
    expect(alphaLabel(1)).toBe('a');
    expect(alphaLabel(26)).toBe('z');
    expect(alphaLabel(27)).toBe('aa');
  });
});

describe('romanLabel', () => {
  it('writes small roman numerals', () => {
    expect(romanLabel(1)).toBe('i');
    expect(romanLabel(4)).toBe('iv');
    expect(romanLabel(9)).toBe('ix');
    expect(romanLabel(12)).toBe('xii');
  });
});
