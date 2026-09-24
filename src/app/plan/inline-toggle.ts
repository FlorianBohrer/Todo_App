/**
 * Auszeichnung um eine Auswahl legen oder wieder entfernen.
 *
 * Eigenes Modul und reine Funktion, weil hier die Fälle sitzen, die man beim
 * Ausprobieren nicht trifft: keine Auswahl, Auswahl mit Leerzeichen am Rand,
 * ein zweiter Druck auf dieselbe Taste, und die Frage, wo der Cursor danach
 * steht. Ohne DOM und ohne Angular prüfbar.
 */

export type InlineMarker = '**' | '*' | '__' | '~~';

export interface ToggleResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Zeichen, die zu einem Wort gehören. Alles andere begrenzt es. */
const WORD = /[\p{L}\p{N}_'-]/u;

/**
 * Das Wort unter dem Cursor.
 *
 * Ohne das müsste man vor jedem Fettmachen erst genau markieren. Cmd+B mitten
 * im Wort ist die Geste, die man tatsächlich macht — in jedem Editor, den es
 * gibt.
 */
export function wordAt(text: string, position: number): [number, number] {
  let start = position;
  let end = position;

  while (start > 0 && WORD.test(text[start - 1])) start--;
  while (end < text.length && WORD.test(text[end])) end++;

  return [start, end];
}

/**
 * Auszeichnung umschalten.
 *
 * Steht die Auswahl bereits in den Zeichen, werden sie entfernt, sonst gesetzt.
 * Das ist die Erwartung an jede Formattaste: zweimal drücken hebt auf.
 *
 * Die Auswahl umfasst danach wieder den Text OHNE die Zeichen. Wer sie
 * mitmarkiert zurückbekäme, würde beim Weitertippen sein eigenes Markup
 * überschreiben.
 */
export function toggleInline(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: InlineMarker,
): ToggleResult {
  let start = selectionStart;
  let end = selectionEnd;

  // Keine Auswahl: das Wort unter dem Cursor nehmen. Steht der Cursor nicht an
  // einem Wort, werden nur die Zeichen gesetzt und der Cursor dazwischen
  // geparkt — dann tippt man eben los.
  if (start === end) {
    [start, end] = wordAt(text, start);
  }

  // Leerzeichen am Rand gehören nicht in die Auszeichnung: "**wort **" ist in
  // Markdown kein Fettdruck, und markiert wird mit der Maus fast immer eins zu
  // viel.
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;

  const len = marker.length;
  const inner = text.slice(start, end);
  const ch = marker[0];

  /**
   * Wie viele gleiche Zeichen stehen hier ununterbrochen?
   *
   * Diese Zaehlung ist der Grund, warum Kursiv auf fettem Text nicht mehr die
   * Fettschrift zerstoert: `*` und `**` teilen sich das Sternchen. Ohne sie sah
   * die Funktion in `**welt**` links ein `*`, hielt das fuer Kursiv und zog es
   * ab — aus fett wurde kursiv, und niemand hatte darum gebeten.
   */
  const runBefore = (): number => {
    let n = 0;
    while (start - n - 1 >= 0 && text[start - n - 1] === ch) n++;
    return n;
  };
  const runAfter = (): number => {
    let n = 0;
    while (end + n < text.length && text[end + n] === ch) n++;
    return n;
  };

  // Abgenommen wird nur, wenn die Laufweite GENAU passt. Bei drei Sternchen
  // und der Kursivtaste wird stattdessen hinzugefuegt: das ist in dem seltenen
  // Fall nicht, was man wollte, aber es zerstoert nichts. Die Richtung, in die
  // ein Zweifelsfall fallen soll.
  const wrapped = runBefore() === len && runAfter() === len;

  if (wrapped) {
    return {
      text: text.slice(0, start - len) + inner + text.slice(end + len),
      selectionStart: start - len,
      selectionEnd: end - len,
    };
  }

  // Oder sind sie Teil der Auswahl selbst? Dann ebenfalls abnehmen, mit
  // derselben Zaehlung wie oben.
  const innerRunStart = inner.length - inner.replace(new RegExp(`^\\${ch}+`), '').length;
  const innerRunEnd = inner.length - inner.replace(new RegExp(`\\${ch}+$`), '').length;
  if (
    inner.length > len * 2 &&
    innerRunStart === len &&
    innerRunEnd === len
  ) {
    const stripped = inner.slice(len, -len);
    return {
      text: text.slice(0, start) + stripped + text.slice(end),
      selectionStart: start,
      selectionEnd: start + stripped.length,
    };
  }

  return {
    text: text.slice(0, start) + marker + inner + marker + text.slice(end),
    selectionStart: start + len,
    selectionEnd: end + len,
  };
}
