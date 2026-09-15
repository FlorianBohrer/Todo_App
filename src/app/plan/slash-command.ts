/**
 * Erkennung des „/"-Kommandos im Fließtext.
 *
 * Als reine Funktion herausgezogen, weil hier die Kanten sitzen: ein Schrägstrich
 * mitten in einem Wort (Pfade wie `src/app`, Datumsangaben wie `12/2026`) darf
 * das Menü nicht aufreißen.
 */
export interface SlashToken {
  /** Index des „/" im Text. */
  start: number;
  /** Was zwischen „/" und Cursor steht. */
  query: string;
}

function isBoundary(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t';
}

/**
 * Sucht ein Kommando direkt links vom Cursor.
 *
 * Bedingungen: Das „/" steht am Textanfang oder hinter einem Leerraum, und
 * zwischen „/" und Cursor liegt kein Leerraum. Sonst gibt es kein Kommando.
 */
export function detectSlashToken(value: string, caret: number): SlashToken | null {
  const end = Math.max(0, Math.min(caret, value.length));

  for (let i = end - 1; i >= 0; i--) {
    const ch = value[i];

    if (ch === '/') {
      const prev = i === 0 ? '' : value[i - 1];
      if (i === 0 || isBoundary(prev)) {
        return { start: i, query: value.slice(i + 1, end) };
      }
      // Schrägstrich klebt an einem Wort — ein Pfad, kein Kommando.
      return null;
    }

    if (isBoundary(ch)) return null;
  }

  return null;
}
