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

import { splitLinks, stripLinks } from '../../shared/links';
import { stripPriorityPrefix } from './title-priority';

export interface RichPart {
  text: string;
  bold: boolean;
  /** Ein Link (shared/links.ts): `text` ist, was zu lesen ist, das hier das Ziel. */
  href?: string;
  /** Die volle Adresse bzw. das Ziel, für den Tooltip. */
  title?: string;
}

const BOLD = /\*\*(?!\s)([^\n]*?[^\s*])\*\*/g;

/** Hat der Text wenigstens eine fette Stelle? */
export function hasBold(text: string): boolean {
  BOLD.lastIndex = 0;
  return BOLD.test(text);
}

/**
 * Der Text in Stücken, fett und nicht fett, ohne die Sternchen; Links darin
 * als eigene Stücke mit ihrem Ziel und kurzem Text.
 */
export function richParts(text: string): RichPart[] {
  const parts: RichPart[] = [];
  const push = (piece: string, bold: boolean) => {
    for (const { text: shown, link } of splitLinks(piece)) {
      parts.push(link ? { text: shown, bold, href: link.href, title: link.href } : { text: shown, bold });
    }
  };
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index ?? 0;
    if (start > last) push(text.slice(last, start), false);
    push(match[1], true);
    last = start + match[0].length;
  }
  if (last < text.length) push(text.slice(last), false);
  return parts;
}

/**
 * Braucht der Titel mehr als ein Textfeld? Fette Stellen und Links kann ein
 * Textfeld nicht zeigen, dann steht ausserhalb des Bearbeitens der Text.
 */
export function isRich(text: string): boolean {
  return hasBold(text) || richParts(text).some((part) => part.href);
}

/** Der Text ohne die Sternchen, für Stellen, die nur Klartext zeigen. */
export function stripBold(text: string): string {
  return text.replace(BOLD, '$1');
}

/** Klartext: ohne Sternchen, Links als ihr Text bzw. ihre Kurzform. */
export function plainText(text: string): string {
  return stripLinks(stripBold(text));
}

/**
 * Der Titel, wie Karten ihn zeigen: ohne Präfixe (die stehen als Chip davor),
 * eine angeklebte Überschrift umgebrochen. Fett und Links bleiben drin, die
 * zeichnet app-rich-text.
 */
export function titleText(title: string): string {
  return breakAfterHeading(stripPriorityPrefix(title));
}

/**
 * Wie eine Aufgabe in einer Zeile heisst: ohne Präfixe, nur die erste Zeile,
 * als Klartext. Für Meldungen, Menüs, Statistik und alles, was nur Text kann.
 */
export function plainTitle(title: string): string {
  return plainText(firstLineOf(stripPriorityPrefix(title)));
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
