/**
 * Erkennung von Eingaben, die beim Tippen einen Block umwandeln oder ein Menü
 * öffnen — der Teil, der sich beim Schreiben ständig bemerkbar macht und
 * deshalb eigene Tests verdient.
 *
 * Bewusst reine Funktionen: die Kanten (ein „-" mitten im Satz, ein bereits
 * geschlossener Wikilink) lassen sich so einzeln festnageln.
 */

/** Blocktypen, die sich per Markdown-Präfix erzeugen lassen. */
export type MarkdownBlockKind =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'number'
  | 'todo'
  | 'quote'
  | 'code'
  | 'divider';

/**
 * Reihenfolge ist Absicht: „###" muss vor „##" und „#" geprüft werden, und die
 * Checkliste vor der Aufzählung — „- [ ] " beginnt nun einmal ebenfalls mit
 * „- ".
 */
const PREFIX_RULES: { pattern: RegExp; kind: MarkdownBlockKind }[] = [
  { pattern: /^###[ \t]/, kind: 'heading3' },
  { pattern: /^##[ \t]/, kind: 'heading2' },
  { pattern: /^#[ \t]/, kind: 'heading1' },
  { pattern: /^>[ \t]/, kind: 'quote' },
  { pattern: /^[-*][ \t]\[[ xX]?\][ \t]/, kind: 'todo' },
  { pattern: /^\[[ xX]?\][ \t]/, kind: 'todo' },
  { pattern: /^[-*][ \t]/, kind: 'bullet' },
  { pattern: /^\d+\.[ \t]/, kind: 'number' },
];

/** Präfixe ohne Leerzeichen dahinter — sie stehen für sich allein. */
const EXACT_RULES: { text: string; kind: MarkdownBlockKind }[] = [
  { text: '```', kind: 'code' },
  { text: '---', kind: 'divider' },
];

/**
 * Prüft, ob der Blockinhalt mit einem Markdown-Präfix beginnt.
 *
 * Bewusst nur am Blockanfang: ein „- " mitten im Satz ist ein Gedankenstrich,
 * keine Aufzählung. `rest` ist der Text ohne Präfix und wandert in den neuen
 * Block, damit nichts verloren geht.
 */
export function detectMarkdownShortcut(
  value: string,
): { kind: MarkdownBlockKind; rest: string } | null {
  for (const rule of EXACT_RULES) {
    if (value === rule.text) return { kind: rule.kind, rest: '' };
  }

  for (const rule of PREFIX_RULES) {
    const match = rule.pattern.exec(value);
    if (match) return { kind: rule.kind, rest: value.slice(match[0].length) };
  }

  return null;
}

/**
 * Findet einen noch offenen Wikilink links vom Cursor, also „[[" ohne
 * schließendes „]]".
 *
 * Ein bereits geschlossener Link darf das Menü nicht erneut aufreißen, sonst
 * ginge es beim Weiterschreiben hinter dem Link wieder auf.
 */
export function detectWikiToken(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const end = Math.max(0, Math.min(caret, value.length));
  const open = value.lastIndexOf('[[', end);
  if (open === -1) return null;

  const query = value.slice(open + 2, end);
  if (query.includes(']') || query.includes('[') || query.includes('\n')) return null;

  return { start: open, query };
}
