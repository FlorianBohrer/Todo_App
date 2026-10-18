/**
 * Präfixe als Zeichen statt als Text.
 *
 * „/must ", „/sub " und ihre Geschwister sind Steuerzeichen: man tippt sie,
 * damit die App etwas weiß — lesen will man sie danach nie wieder. Gespeichert
 * bleiben sie (sie tragen Sortierung, Gliederung und XP, siehe
 * title-priority.ts), auf dem Bildschirm stehen sie nur noch als Chip.
 *
 * Hier liegt die eine Stelle, die zwischen beidem übersetzt: Titel → Zeichen
 * und Text, Zeichen und Text → Titel, und wie ein Zeichen aussieht. Ein Titel
 * trägt bis zu zwei Zeichen: eine Priorität und eine Gliederung.
 */
import {
  Ban,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  CornerDownRight,
  ListTree,
  type LucideIconData,
} from 'lucide-angular';

import {
  MoscowLevel,
  TaskLevel,
  composeTitle,
  priorityBadge,
  stripPriorityPrefix,
  taskLevel,
} from './title-priority';

export type TitleToken = MoscowLevel | TaskLevel;

/**
 * Das Zeichen selbst — ein Symbol, kein Wort.
 *
 * Vorher stand „MUST" im Chip. Das war das Präfix in Großbuchstaben: immer
 * noch geschrieben, nur anders. Jetzt sagt die Form, was gemeint ist, so wie
 * Prioritäten in Issue-Trackern seit jeher aussehen: zwei Pfeile hinauf für
 * das Unverhandelbare, einer für das Wichtige, einer hinab für das
 * Verzichtbare, durchgestrichen für das bewusst Ausgeschlossene. Main und
 * Step zeigen die Gliederung: ein Baum, ein Haken nach rechts unten.
 *
 * Die Form trägt die Bedeutung, nicht die Farbe — auch farbenblind bleibt
 * ⇈ von ↓ zu unterscheiden. Das Wort steht im Tooltip und für Screenreader.
 */
export const TOKEN_ICON: Record<TitleToken, LucideIconData> = {
  must: ChevronsUp,
  should: ChevronUp,
  could: ChevronDown,
  wont: Ban,
  main: ListTree,
  sub: CornerDownRight,
};

/** Das Wort zum Zeichen — für Tooltip und Ansagen, nicht für die Fläche. */
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
  wont: 'bg-fill text-subtle',
  main: 'bg-fill-strong text-text',
  sub: 'bg-fill text-muted',
};

export function tokenClass(token: TitleToken): string {
  return TOKEN_CLASS[token];
}

const isLevel = (token: TitleToken): token is TaskLevel => token === 'main' || token === 'sub';

/** Erst die Priorität, dann die Gliederung — so stehen sie im Titel und als Chips. */
function ordered(tokens: ReadonlyArray<TitleToken | null>): TitleToken[] {
  const present = tokens.filter((t): t is TitleToken => t !== null);
  return [...present.filter((t) => !isLevel(t)), ...present.filter(isLevel)];
}

/**
 * Die Zeichen eines Titels: höchstens eine Priorität und eine Gliederung, in
 * dieser Reihenfolge. Leer, wenn keins davorsteht.
 */
export function tokensOf(title: string): TitleToken[] {
  return ordered([priorityBadge(title), taskLevel(title)]);
}

/**
 * Ein Zeichen dazu. Es ersetzt das derselben Achse — eine Priorität die
 * andere, eine Gliederung die andere — und lässt das der anderen stehen.
 */
export function withToken(tokens: readonly TitleToken[], token: TitleToken): TitleToken[] {
  return ordered([...tokens.filter((t) => isLevel(t) !== isLevel(token)), token]);
}

/**
 * Titel → Zeichen und Text.
 *
 * Zugleich das Erkennen beim Tippen: erst das Leerzeichen hinter dem Wort
 * macht es zum Zeichen. „/mu" ist noch Text, „/must " schon nicht mehr.
 * „/must /sub " sind zwei Zeichen, in beliebiger Reihenfolge getippt.
 */
export function splitTitle(title: string): { tokens: TitleToken[]; text: string } {
  const tokens = tokensOf(title);
  return { tokens, text: tokens.length === 0 ? title : stripPriorityPrefix(title) };
}

/**
 * Zeichen und Text → Titel, so wie er gespeichert wird.
 *
 * Ohne Text kein Präfix: ein Titel, der nur aus „/must " bestünde, wäre leer.
 * Steht im Text selbst schon ein Präfix, gewinnt es auf seiner Achse — wer es
 * ausdrücklich davorschreibt, meint es auch (dieselbe Regel wie withTaskLevel).
 */
export function joinTitle(tokens: readonly TitleToken[], text: string): string {
  const trimmed = text.trimStart();
  if (trimmed === '') return text;
  const typed = splitTitle(trimmed);
  const all = typed.tokens.reduce(withToken, [...tokens]);
  if (all.length === 0) return text;
  const badge = all.find((t): t is MoscowLevel => !isLevel(t)) ?? null;
  const level = all.find(isLevel) ?? null;
  return composeTitle(badge, level, typed.text);
}
