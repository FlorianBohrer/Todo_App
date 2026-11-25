import {
  breakAfterHeading,
  dashHeading,
  firstLineOf,
  hasBold,
  isRich,
  plainText,
  plainTitle,
  richParts,
  stripBold,
  toggleBold,
} from './rich-title';

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

  it('cuts links out as their own parts, inside bold too', () => {
    expect(richParts('PR https://github.com/a/b/pull/52 now')).toEqual([
      { text: 'PR ', bold: false },
      { text: 'github.com/…/pull/52', bold: false, href: 'https://github.com/a/b/pull/52', title: 'https://github.com/a/b/pull/52' },
      { text: ' now', bold: false },
    ]);
    expect(richParts('**[Offer](https://x.de)**')).toEqual([
      { text: 'Offer', bold: true, href: 'https://x.de', title: 'https://x.de' },
    ]);
  });

  it('needs the text view for bold or a link', () => {
    expect(isRich('Buy milk')).toBe(false);
    expect(isRich('Buy **milk**')).toBe(true);
    expect(isRich('Buy at www.milk.de')).toBe(true);
  });

  it('names a task in plain text: no prefix, first line, short links', () => {
    expect(plainText('**Read** https://x.de/a/b/c/d')).toBe('Read x.de/…/c/d');
    expect(plainTitle('/must **Pay** [the bill](https://bank.de)\nIBAN below')).toBe('Pay the bill');
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

  it('breaks after a bold heading the text is glued to', () => {
    const glued = '**Marco antworten**Account Ownership bestätigen';
    const broken = '**Marco antworten**\nAccount Ownership bestätigen';
    expect(breakAfterHeading(glued)).toBe(broken);
    // Mit Umbruch geschrieben bleibt es, wie es ist.
    expect(breakAfterHeading(broken)).toBe(broken);
    expect(firstLineOf(glued)).toBe('**Marco antworten**');
    expect(firstLineOf(broken)).toBe('**Marco antworten**');
    expect(firstLineOf('**Marco antworten**\n\nAccount Ownership\n')).toBe('**Marco antworten**');
  });

  it('keeps a sentence with an emphasised first word on one line', () => {
    expect(breakAfterHeading('**Wichtig** bitte anrufen')).toBe('**Wichtig** bitte anrufen');
    expect(breakAfterHeading('**Wichtig**: bitte anrufen')).toBe('**Wichtig**: bitte anrufen');
    expect(breakAfterHeading('Call **mom**today')).toBe('Call **mom**today');
    expect(breakAfterHeading('**Nur die Überschrift**')).toBe('**Nur die Überschrift**');
  });
});

describe('dashHeading', () => {
  it('turns the text before a dash into a heading', () => {
    expect(dashHeading('Mittagessen– Suppe oder Dal')).toBe('**Mittagessen**\nSuppe oder Dal');
    expect(dashHeading('Einkaufen — Milch, Brot')).toBe('**Einkaufen**\nMilch, Brot');
    expect(dashHeading('Zahnarzt – anrufen – morgen')).toBe('**Zahnarzt**\nanrufen – morgen');
  });

  it('leaves hyphens, ranges and lone dashes alone', () => {
    const same = ['Thumbnail - day in the life', 'E-Mail schreiben', 'Termin 10–12 Uhr', 'Mo–Fr laufen',
      'Offen –', '– Punkt', '**Fett** – schon da', 'Kopf\nZeile – zwei'];
    for (const text of same) expect(dashHeading(text)).toBe(text);
  });
});
