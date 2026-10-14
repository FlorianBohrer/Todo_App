/**
 * Präfixe als Zeichen statt als Text.
 *
 * „/must ", „/sub " und ihre Geschwister sind Steuerzeichen: man tippt sie,
 * damit die App etwas weiß — lesen will man sie danach nie wieder. Gespeichert
 * bleiben sie (sie tragen Sortierung, Gliederung und XP, siehe
 * title-priority.ts), auf dem Bildschirm stehen sie nur noch als Chip.
 *
 * Hier liegt die eine Stelle, die zwischen beidem übersetzt: Titel → Zeichen
 * und Text, Zeichen und Text → Titel, und wie ein Zeichen aussieht.
 */
import {
  MoscowLevel,
  TaskLevel,
  priorityBadge,
  stripPriorityPrefix,
  taskLevel,
} from './title-priority';

export type TitleToken = MoscowLevel | TaskLevel;

/** So steht das Zeichen im gespeicherten Titel. Won't mit Apostroph, wie man es schreibt. */
const PREFIX: Record<TitleToken, string> = {
  must: '/must ',
  should: '/should ',
  could: '/could ',
  wont: "/won't ",
  main: '/main ',
  sub: '/sub ',
};

/** Die Aufschrift des Chips. */
export const TOKEN_LABEL: Record<TitleToken, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
  main: 'Main',
  sub: 'Step',
};

/** Für die Vorlesesoftware: was das Zeichen bedeutet, nicht wie es aussieht. */
export const TOKEN_DESCRIPTION: Record<TitleToken, string> = {
  must: 'Must-have',
  should: 'Should-have',
  could: 'Could-have',
  wont: "Won't-have",
  main: 'Main task',
  sub: 'Step of the task above',
};

/**
 * Farbe des Chips.
 *
 * Rosé für das Unverhandelbare, die Farbe der Ansicht für das Wichtige,
 * neutral für das Verzichtbare — und Won't tritt zurück: es ist bewusst
 * draußen, nicht dringend. Main und Step neutral: sie ordnen, sie gewichten
 * nicht. (Lag vorher als badgeClass in der Liste; jetzt braucht es auch das
 * Eingabefeld und die Woche.)
 *
 * Literal ausgeschrieben, sonst findet Tailwinds Scanner die Klassen nicht.
 */
const TOKEN_CLASS: Record<TitleToken, string> = {
  must: 'bg-rose-500/20 text-rose-300',
  should: 'bg-indigo-500/20 text-indigo-300',
  could: 'bg-fill-strong text-muted',
  wont: 'bg-fill text-subtle line-through',
  main: 'bg-fill-strong text-text',
  sub: 'bg-fill text-muted',
};

export function tokenClass(token: TitleToken): string {
  return TOKEN_CLASS[token];
}

/** Das Zeichen eines Titels, oder null, wenn keins davorsteht. */
export function tokenOf(title: string): TitleToken | null {
  return priorityBadge(title) ?? taskLevel(title);
}

/**
 * Titel → Zeichen und Text.
 *
 * Zugleich das Erkennen beim Tippen: erst das Leerzeichen hinter dem Wort
 * macht es zum Zeichen. „/mu" ist noch Text, „/must " schon nicht mehr.
 */
export function splitTitle(title: string): { token: TitleToken | null; text: string } {
  const token = tokenOf(title);
  return { token, text: token === null ? title : stripPriorityPrefix(title) };
}

/**
 * Zeichen und Text → Titel, so wie er gespeichert wird.
 *
 * Ohne Text kein Präfix: ein Titel, der nur aus „/must " bestünde, wäre leer.
 * Steht im Text selbst schon ein Präfix, gewinnt das — wer es ausdrücklich
 * davorschreibt, meint es auch (dieselbe Regel wie withTaskLevel).
 */
export function joinTitle(token: TitleToken | null, text: string): string {
  const trimmed = text.trimStart();
  if (token === null || trimmed === '') return text;
  if (tokenOf(trimmed) !== null) return trimmed;
  return PREFIX[token] + trimmed;
}
