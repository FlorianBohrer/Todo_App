/**
 * Einen Absatz teilen, ohne seine Auszeichnung zu zerreissen.
 *
 * Enter hinter fettem Text zog die Sternchen in den naechsten Absatz: aus
 * „**fett**" wurden „**fett" und „**", und damit war beides kaputt. Der
 * Grund ist keine Schlamperei, sondern eine Zweideutigkeit — am Ende einer
 * Auszeichnung gibt es zwei Stellen, die genau gleich aussehen:
 *
 *     **fett|**     der Cursor steht hinter dem Wort, vor dem Zeichenpaar
 *     **fett**|     und hier dahinter
 *
 * Im Dokument sind das die Positionen 6 und 8, auf dem Schirm derselbe
 * Strich. Wer dort Enter drueckt, meint immer die zweite: die Auszeichnung
 * gehoert zu dem, was man gerade geschrieben hat, und nicht zu dem, was man
 * gleich schreibt.
 *
 * Und wer wirklich MITTEN in fettem Text teilt, meint auch dort das
 * Naheliegende: beide Haelften bleiben fett. Dafuer wird die Auszeichnung
 * vorne geschlossen und hinten wieder geoeffnet.
 */

/**
 * Die Zeichenpaare, die eine Auszeichnung aufspannen — in der Reihenfolge,
 * in der sie gelesen werden muessen.
 *
 * Code zuerst, weil darin nichts gilt: in `a ** b` sind die Sternchen Text.
 * Dann die langen vor den kurzen, sonst nimmt „**" die ersten zwei Zeichen
 * von „***" und laesst eins liegen. Dieselbe Reihenfolge wie beim
 * Formatieren, siehe inline-format.ts.
 */
const MARKERS = ['`', '***', '**', '__', '~~', '*'] as const;

interface Run {
  /** Index, an dem das oeffnende Zeichenpaar beginnt. */
  open: number;
  /** Index, an dem das schliessende Zeichenpaar beginnt. */
  close: number;
  marker: string;
}

/** Alle Auszeichnungen einer Zeile, aussen vor innen. */
function runsIn(md: string): Run[] {
  const found: Run[] = [];
  const taken = new Array<boolean>(md.length).fill(false);

  for (const marker of MARKERS) {
    let at = 0;
    while (at < md.length) {
      const open = md.indexOf(marker, at);
      if (open < 0) break;

      // Was eine laengere Auszeichnung schon fuer sich beansprucht hat,
      // gehoert ihr — hier wird nichts zweimal gelesen.
      if (taken[open]) {
        at = open + 1;
        continue;
      }

      const from = open + marker.length;
      const close = md.indexOf(marker, from);
      if (close < 0) break;
      if (close === from || taken[close]) {
        at = open + marker.length;
        continue;
      }

      found.push({ open, close, marker });

      // Belegt werden nur die Zeichenpaare selbst — nicht, was dazwischen
      // steht. Sonst faende „*" nichts mehr in „**fett *und* mehr**", weil
      // das aeussere Paar die ganze Zeile fuer sich beansprucht haette.
      //
      // Code ist die Ausnahme und beansprucht auch seinen Inhalt: darin gilt
      // keine Auszeichnung, in `a ** b ** c` sind die Sternchen Text.
      const upto = marker === '`' ? close + marker.length : open + marker.length;
      for (let i = open; i < upto; i++) taken[i] = true;
      for (let i = close; i < close + marker.length; i++) taken[i] = true;
      at = close + marker.length;
    }
  }

  return found.sort((a, b) => a.open - b.open);
}

/**
 * Den Schnitt aus einem Zeichenpaar heraustreten lassen.
 *
 * Steht er direkt vor dem schliessenden Paar, rutscht er dahinter; steht er
 * direkt hinter dem oeffnenden, rutscht er davor. Beides wiederholt sich,
 * denn eine Auszeichnung kann in einer anderen stecken und der Schnitt
 * danach an deren Rand liegen.
 */
function stepOut(md: string, at: number): number {
  for (let guard = 0; guard < MARKERS.length + 1; guard++) {
    const moved = runsIn(md).find((run) => {
      const contentStart = run.open + run.marker.length;
      if (at > run.open && at <= contentStart) return true;
      if (at >= run.close && at < run.close + run.marker.length) return true;
      return false;
    });
    if (!moved) return at;

    at = at <= moved.open + moved.marker.length ? moved.open : moved.close + moved.marker.length;
  }
  return at;
}

export interface SplitParts {
  before: string;
  after: string;
}

/** Teilt den Text an dieser Stelle, ohne eine Auszeichnung zu zerreissen. */
export function splitMarkdown(md: string, at: number): SplitParts {
  const cut = stepOut(md, Math.max(0, Math.min(at, md.length)));

  // Was den Schnitt jetzt noch umschliesst, wird vorne geschlossen und
  // hinten wieder geoeffnet — innerste zuerst, sonst stehen die Paare
  // ueberkreuz.
  const open = runsIn(md).filter((run) => cut > run.open + run.marker.length && cut < run.close);

  const closing = [...open]
    .reverse()
    .map((run) => run.marker)
    .join('');
  const opening = open.map((run) => run.marker).join('');

  return {
    before: md.slice(0, cut) + closing,
    after: opening + md.slice(cut),
  };
}
