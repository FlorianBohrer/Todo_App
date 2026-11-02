import { DUOTONE } from './task-glyphs';
import { KEYWORD_EMOJIS, bareEmoji, guessEmoji, splitLeadingEmoji, taskIcon } from './task-icon';

describe('taskIcon', () => {
  it('takes an emoji the user put in front', () => {
    expect(taskIcon('🧹 Wohnzimmer')).toMatchObject({ glyph: '🧹', initial: false });
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
    expect(taskIcon('xylophon stimmen')).toEqual({ glyph: 'X', initial: true, drawn: false });
    expect(taskIcon('(Offline) Test')).toEqual({ glyph: 'O', initial: true, drawn: false });
  });

  it('has a picture for every emoji it hands out from keywords', () => {
    const missing = KEYWORD_EMOJIS.filter((emoji) => !DUOTONE[bareEmoji(emoji)]);
    expect(missing).toEqual([]);
    expect(KEYWORD_EMOJIS.every((emoji) => taskIcon(`${emoji} x`).drawn)).toBe(true);
  });

  it('draws a guessed or typed emoji, with or without the variation selector', () => {
    expect(taskIcon('Zahnarzt anrufen').drawn).toBe(true);
    expect(taskIcon('✈ Koffer packen')).toMatchObject({ drawn: true });
    expect(bareEmoji('✈️')).toBe(bareEmoji('✈'));
  });

  it('keeps an emoji it has no picture for', () => {
    expect(taskIcon('🎉 Party planen')).toEqual({ glyph: '🎉', initial: false, drawn: false });
  });
});
