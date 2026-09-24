import { toggleInline, wordAt } from './inline-toggle';

describe('wordAt', () => {
  it('finds the word the cursor stands in', () => {
    expect(wordAt('hallo welt', 7)).toEqual([6, 10]);
  });

  it('finds the word when the cursor sits at its end', () => {
    expect(wordAt('hallo welt', 5)).toEqual([0, 5]);
  });

  it('returns an empty range between words', () => {
    // Auf dem Leerzeichen gibt es nichts zu umschliessen.
    expect(wordAt('hallo welt', 5 + 1 - 1)).toEqual([0, 5]);
    expect(wordAt('a  b', 2)).toEqual([2, 2]);
  });

  it('keeps hyphens and apostrophes inside the word', () => {
    expect(wordAt("won't-have", 3)).toEqual([0, 10]);
  });
});

describe('toggleInline', () => {
  it('wraps a selection', () => {
    const out = toggleInline('hallo welt', 6, 10, '**');
    expect(out.text).toBe('hallo **welt**');
    // Markiert bleibt das Wort, nicht das Markup.
    expect(out.text.slice(out.selectionStart, out.selectionEnd)).toBe('welt');
  });

  it('takes the word under the cursor when nothing is selected', () => {
    const out = toggleInline('hallo welt', 8, 8, '**');
    expect(out.text).toBe('hallo **welt**');
  });

  it('removes the markers on a second press', () => {
    const first = toggleInline('hallo welt', 6, 10, '**');
    const second = toggleInline(
      first.text,
      first.selectionStart,
      first.selectionEnd,
      '**',
    );
    expect(second.text).toBe('hallo welt');
    expect(second.text.slice(second.selectionStart, second.selectionEnd)).toBe('welt');
  });

  it('also removes them when the markers are inside the selection', () => {
    const out = toggleInline('hallo **welt**', 6, 14, '**');
    expect(out.text).toBe('hallo welt');
  });

  it('leaves trailing spaces out of the markup', () => {
    // Mit der Maus markiert man fast immer eins zu viel, und "**welt **" ist
    // in Markdown kein Fettdruck.
    const out = toggleInline('hallo welt ', 6, 11, '**');
    expect(out.text).toBe('hallo **welt** ');
  });

  it('handles the underline marker', () => {
    expect(toggleInline('hallo welt', 6, 10, '__').text).toBe('hallo __welt__');
  });

  it('does not tear a marker off bold text when italic is pressed', () => {
    // `*` und `**` teilen sich das Sternchen. Vorher sah die Funktion links
    // ein `*`, hielt es fuer Kursiv und zog es ab: aus fett wurde kursiv, und
    // niemand hatte darum gebeten.
    const out = toggleInline('**welt**', 2, 6, '*');
    expect(out.text).toBe('***welt***');
  });

  it('does not strip bold when the whole thing is selected and italic is pressed', () => {
    const out = toggleInline('**welt**', 0, 8, '*');
    expect(out.text).toContain('**welt**');
  });

  it('parks the cursor between the markers when there is no word', () => {
    const out = toggleInline('a  b', 2, 2, '**');
    expect(out.text).toBe('a **** b');
    expect(out.selectionStart).toBe(4);
    expect(out.selectionEnd).toBe(4);
  });

  it('works across several words', () => {
    const out = toggleInline('eins zwei drei', 0, 9, '__');
    expect(out.text).toBe('__eins zwei__ drei');
  });
});
