import {
  COMBO_WINDOW_MS,
  GOLDEN_ODDS,
  isGolden,
  levelFor,
  levelUpBetween,
  nextCombo,
  nextTitle,
  titleFor,
  xpAtLevel,
  xpForStep,
} from './level';

describe('level curve', () => {
  it('starts at level 1 with nothing', () => {
    expect(levelFor(0)).toEqual({
      level: 1,
      title: 'Starter',
      xp: 0,
      intoLevel: 0,
      stepSize: 50,
      progress: 0,
    });
  });

  it('makes every step 25 XP longer than the one before', () => {
    expect([1, 2, 3, 4].map(xpForStep)).toEqual([50, 75, 100, 125]);
    expect([1, 2, 3, 4].map(xpAtLevel)).toEqual([0, 50, 125, 225]);
  });

  it('agrees with itself: the threshold of a level is that level', () => {
    for (let level = 1; level <= 60; level++) {
      expect(levelFor(xpAtLevel(level)).level).toBe(level);
      if (level > 1) expect(levelFor(xpAtLevel(level) - 1).level).toBe(level - 1);
    }
  });

  it('reports how far into the level you are', () => {
    const info = levelFor(100);
    expect(info.level).toBe(2);
    expect(info.intoLevel).toBe(50);
    expect(info.stepSize).toBe(75);
    expect(info.progress).toBeCloseTo(2 / 3);
  });

  it('ignores negative and fractional input', () => {
    expect(levelFor(-30).xp).toBe(0);
    expect(levelFor(49.9).level).toBe(1);
  });
});

describe('titles', () => {
  it('changes at the named levels and holds in between', () => {
    expect(titleFor(1)).toBe('Starter');
    expect(titleFor(2)).toBe('Getting going');
    expect(titleFor(4)).toBe('Warming up');
    expect(titleFor(3)).toBe('Warming up');
    expect(titleFor(8)).toBe('Focused');
    expect(titleFor(99)).toBe('Legend');
  });

  it('names the next title ahead, and nothing after the last', () => {
    expect(nextTitle(1)).toEqual({ level: 2, title: 'Getting going' });
    expect(nextTitle(8)).toEqual({ level: 12, title: 'Sharp' });
    expect(nextTitle(50)).toBeNull();
  });
});

describe('levelUpBetween', () => {
  it('is null within a level', () => {
    expect(levelUpBetween(10, 40)).toBeNull();
    expect(levelUpBetween(60, 30)).toBeNull();
  });

  it('reports a single level and whether a title came with it', () => {
    expect(levelUpBetween(xpAtLevel(4) - 1, xpAtLevel(4))).toMatchObject({
      gained: 1,
      newTitle: false,
      to: { level: 4 },
    });
    expect(levelUpBetween(xpAtLevel(3) - 1, xpAtLevel(3))).toMatchObject({
      gained: 1,
      newTitle: true,
      to: { level: 3, title: 'Warming up' },
    });
  });

  it('counts several levels at once', () => {
    expect(levelUpBetween(0, xpAtLevel(4))?.gained).toBe(3);
  });
});

describe('golden', () => {
  it('is stable for the same key', () => {
    const keys = Array.from({ length: 50 }, (_, i) => `todo-${i}`);
    expect(keys.map(isGolden)).toEqual(keys.map(isGolden));
  });

  it('hits roughly one in eight', () => {
    const keys = Array.from({ length: 8000 }, (_, i) => `todo-${i}`);
    const share = keys.filter(isGolden).length / keys.length;
    expect(share).toBeGreaterThan(1 / GOLDEN_ODDS - 0.02);
    expect(share).toBeLessThan(1 / GOLDEN_ODDS + 0.02);
  });
});

describe('combo', () => {
  it('climbs inside the window and starts over after it', () => {
    const first = nextCombo(null, 0);
    const second = nextCombo(first, 10_000);
    const third = nextCombo(second, 10_000 + COMBO_WINDOW_MS);
    const broken = nextCombo(third, 10_000 + 2 * COMBO_WINDOW_MS + 1);

    expect([first.count, second.count, third.count, broken.count]).toEqual([1, 2, 3, 1]);
  });
});
