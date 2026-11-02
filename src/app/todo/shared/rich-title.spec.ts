import { hasBold, richParts, stripBold, toggleBold } from './rich-title';

describe('rich-title', () => {
  it('splits a title into bold and plain parts', () => {
    expect(richParts('Call **mom** today')).toEqual([
      { text: 'Call ', bold: false },
      { text: 'mom', bold: true },
      { text: ' today', bold: false },
    ]);
    expect(richParts('**All** of **it**')).toEqual([
      { text: 'All', bold: true },
      { text: ' of ', bold: false },
      { text: 'it', bold: true },
    ]);
  });

  it('keeps text without a closed pair as it is', () => {
    expect(richParts('plain')).toEqual([{ text: 'plain', bold: false }]);
    expect(richParts('2 ** 3 ** 4')).toEqual([{ text: '2 ** 3 ** 4', bold: false }]);
    expect(richParts('**open')).toEqual([{ text: '**open', bold: false }]);
    expect(richParts('****')).toEqual([{ text: '****', bold: false }]);
    expect(hasBold('2 ** 3 ** 4')).toBe(false);
    expect(hasBold('a **b** c')).toBe(true);
    // Mehrmals hintereinander: das globale Muster darf keinen Zustand behalten.
    expect(hasBold('a **b** c')).toBe(true);
  });

  it('never spans a line break', () => {
    expect(hasBold('**first\nsecond**')).toBe(false);
    expect(richParts('**one**\n**two**')).toEqual([
      { text: 'one', bold: true },
      { text: '\n', bold: false },
      { text: 'two', bold: true },
    ]);
  });

  it('strips the markers for plain text', () => {
    expect(stripBold('Call **mom** today')).toBe('Call mom today');
    expect(stripBold('2 ** 3 ** 4')).toBe('2 ** 3 ** 4');
  });

  it('wraps the selection in markers, without the spaces at its edges', () => {
    expect(toggleBold('Call mom today', 5, 8)).toEqual({ value: 'Call **mom** today', start: 7, end: 10 });
    expect(toggleBold('Call mom today', 4, 9)).toEqual({ value: 'Call **mom** today', start: 7, end: 10 });
  });

  it('unbolds a bold selection, markers inside or outside of it', () => {
    expect(toggleBold('Call **mom** today', 7, 10)).toEqual({ value: 'Call mom today', start: 5, end: 8 });
    expect(toggleBold('Call **mom** today', 5, 12)).toEqual({ value: 'Call mom today', start: 5, end: 8 });
  });

  it('puts the cursor between two pairs without a selection', () => {
    expect(toggleBold('Call ', 5, 5)).toEqual({ value: 'Call ****', start: 7, end: 7 });
  });
});
