import { guessEmoji, splitLeadingEmoji, taskIcon } from './task-icon';

describe('taskIcon', () => {
  it('takes an emoji the user put in front', () => {
    expect(taskIcon('🧹 Wohnzimmer')).toEqual({ glyph: '🧹', initial: false });
    expect(splitLeadingEmoji('✈️ Koffer packen')).toEqual({ emoji: '✈️', rest: 'Koffer packen' });
    expect(splitLeadingEmoji('🧑‍💻 Deep work').emoji).toBe('🧑‍💻');
  });

  it('keeps a title that is nothing but an emoji', () => {
    expect(splitLeadingEmoji('🎉')).toEqual({ emoji: null, rest: '🎉' });
  });

  it('guesses from German and English words, specific before general', () => {
    expect(guessEmoji('Zahnarzt anrufen')).toBe('🦷');
    expect(guessEmoji('Arzttermin vereinbaren')).toBe('🩺');
    expect(guessEmoji('Water the houseplants')).toBe('🪴');
    expect(guessEmoji('Drink water')).toBe('💧');
    expect(guessEmoji('Wocheneinkauf bei Rewe')).toBe('🛒');
    expect(guessEmoji('Steuererklärung abgeben')).toBe('💰');
  });

  it('matches short words only as whole words', () => {
    expect(guessEmoji('Fix the login bug')).toBe('💻');
    expect(guessEmoji('Im Grunde fertig')).toBeNull();
    expect(guessEmoji('Präsentieren üben')).toBe('🎵');
    expect(guessEmoji('Automatisierung testen')).toBeNull();
  });

  it('falls back to the first letter', () => {
    expect(taskIcon('xylophon stimmen')).toEqual({ glyph: 'X', initial: true });
    expect(taskIcon('(Offline) Test')).toEqual({ glyph: 'O', initial: true });
  });
});
