import { splitMarkdown } from './split-inline';

/** Schreibt den Schnitt als „vorne | hinten" — so liest sich der Test. */
function cut(md: string, at: number): string {
  const { before, after } = splitMarkdown(md, at);
  return `${before}|${after}`;
}

describe('splitMarkdown', () => {
  it('leaves plain text where it is', () => {
    expect(cut('ein Satz', 4)).toBe('ein |Satz');
    expect(cut('ein Satz', 0)).toBe('|ein Satz');
    expect(cut('ein Satz', 8)).toBe('ein Satz|');
  });

  describe('am Ende einer Auszeichnung', () => {
    it('keeps the closing marker where it belongs', () => {
      // Der gemeldete Fehler: aus „**fett**" wurden „**fett" und „**".
      expect(cut('**fett**', 6)).toBe('**fett**|');
    });

    it('does the same for the other markers', () => {
      expect(cut('*leise*', 6)).toBe('*leise*|');
      expect(cut('__unter__', 7)).toBe('__unter__|');
      expect(cut('~~weg~~', 5)).toBe('~~weg~~|');
      expect(cut('`code`', 5)).toBe('`code`|');
      expect(cut('***beides***', 9)).toBe('***beides***|');
    });

    it('keeps what comes after the marker in the second half', () => {
      expect(cut('**fett** und mehr', 6)).toBe('**fett**| und mehr');
    });
  });

  describe('am Anfang einer Auszeichnung', () => {
    it('hands the whole thing to the second half', () => {
      // Sonst stuende vorne ein „**" ohne Inhalt.
      expect(cut('**fett**', 2)).toBe('|**fett**');
      expect(cut('davor **fett**', 8)).toBe('davor |**fett**');
    });
  });

  describe('mitten in einer Auszeichnung', () => {
    it('closes it in front and opens it again behind', () => {
      expect(cut('**fettes Wort**', 8)).toBe('**fettes**|** Wort**');
    });

    it('does it for code too', () => {
      expect(cut('`eins zwei`', 6)).toBe('`eins `|`zwei`');
    });

    it('closes the inner one first when they are nested', () => {
      // Innen zuerst, sonst stuenden die Paare ueberkreuz. Dass dabei drei
      // Sternchen nebeneinander stehen, ist der Preis: Markdown selbst
      // liest „***" zweideutig. Der Fall ist selten, und das Ergebnis ist
      // immer noch besser als eine halbe Auszeichnung.
      expect(cut('**fett *und schief* zu**', 11)).toBe('**fett *und***|*** schief* zu**');
    });
  });

  describe('was keine Auszeichnung ist', () => {
    it('ignores a marker without a partner', () => {
      expect(cut('zwei ** Sterne', 8)).toBe('zwei ** |Sterne');
    });

    it('ignores an empty pair', () => {
      expect(cut('leer **** hier', 7)).toBe('leer **|** hier');
    });

    it('leaves stars inside code alone', () => {
      // In Code gilt nichts — die Sternchen sind dort Text.
      expect(cut('`a ** b`', 3)).toBe('`a `|`** b`');
    });
  });

  it('stays inside the text when asked for an impossible place', () => {
    expect(cut('kurz', 99)).toBe('kurz|');
    expect(cut('kurz', -5)).toBe('|kurz');
  });
});
