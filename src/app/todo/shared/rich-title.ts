/**
 * Fett im Titel einer Aufgabe: **so** wie in Markdown und im Planungsmodus.
 *
 * Gespeichert wird der Text mit den Sternchen. Das hält den Titel ein
 * einfacher String (Server, Flow, Export bleiben unverändert), und wer ihn
 * irgendwo als Klartext sieht, liest trotzdem, was gemeint ist. Angezeigt
 * wird er fett in Liste, Tag und Woche; überall sonst ohne die Sternchen.
 *
 * Wie in Markdown zählt ein Paar nur, wenn innen direkt am Rand kein
 * Leerzeichen steht („2 ** 3 ** 4" bleibt Text), und es reicht nie über
 * einen Zeilenumbruch: Titel und Unterpunkte werden getrennt gezeigt.
 */

export interface RichPart {
  text: string;
  bold: boolean;
}

const BOLD = /\*\*(?!\s)([^\n]*?[^\s*])\*\*/g;

/** Hat der Text wenigstens eine fette Stelle? */
export function hasBold(text: string): boolean {
  BOLD.lastIndex = 0;
  return BOLD.test(text);
}

/** Der Text in Stücken, fett und nicht fett, ohne die Sternchen. */
export function richParts(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), bold: false });
    parts.push({ text: match[1], bold: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

/** Der Text ohne die Sternchen, für Stellen, die nur Klartext zeigen. */
export function stripBold(text: string): string {
  return text.replace(BOLD, '$1');
}

/**
 * Eine fette Überschrift vorn, an die der Text ohne Umbruch anschliesst:
 * „**Marco antworten**Account Ownership bestätigen". Gemeint ist dasselbe
 * wie mit Umbruch, die Überschrift und darunter die Beschreibung. Ohne den
 * Umbruch stand beides in einer Zeile, und in Klartext klebten die Wörter
 * zusammen („antwortenAccount").
 *
 * Nur wenn direkt ein Buchstabe oder eine Ziffer folgt. Steht ein Leerzeichen
 * oder ein Satzzeichen dazwischen („**Wichtig**: bitte anrufen"), ist es ein
 * Satz mit einem betonten Wort und bleibt eine Zeile.
 */
const GLUED_HEADING = /^(\s*\*\*(?!\s)[^\n]*?[^\s*]\*\*)(?=[\p{L}\p{N}])/u;

export function breakAfterHeading(text: string): string {
  return text.replace(GLUED_HEADING, '$1\n');
}

/** Die erste Zeile eines Titels, eine angeklebte Überschrift mitgedacht. */
export function firstLineOf(text: string): string {
  return breakAfterHeading(text).split('\n')[0].trim();
}

/**
 * Ist das der Tastendruck für Fett? Strg/⌘+B, wie man es aus jedem
 * Schreibprogramm kennt, und das Kürzel aus den Einstellungen, das auch im
 * Planungsmodus fett macht (`action` ist, was ShortcutService.match meldet).
 */
export function isBoldKey(event: KeyboardEvent, action: string | null): boolean {
  if (action === 'format.bold') return true;
  return (
    event.key.toLowerCase() === 'b' &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

/**
 * Strg/⌘+B im Textfeld: die Auswahl fett machen oder, wenn sie es schon ist,
 * wieder normal. Ohne Auswahl kommen zwei Paare Sternchen hin, der Cursor
 * steht dazwischen.
 */
export function toggleBold(
  value: string,
  start: number,
  end: number,
): { value: string; start: number; end: number } {
  // Leerzeichen am Rand der Auswahl gehören nicht in das Paar: „**Wort **"
  // wäre kein Fett mehr.
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;

  // Schon fett, mit den Sternchen ausserhalb der Auswahl …
  if (value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return {
      value: value.slice(0, start - 2) + value.slice(start, end) + value.slice(end + 2),
      start: start - 2,
      end: end - 2,
    };
  }
  // … oder mit ausgewählt.
  const picked = value.slice(start, end);
  if (picked.length >= 4 && picked.startsWith('**') && picked.endsWith('**')) {
    const inner = picked.slice(2, -2);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }

  return {
    value: value.slice(0, start) + '**' + picked + '**' + value.slice(end),
    start: start + 2,
    end: end + 2,
  };
}
