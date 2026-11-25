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
 * trägt bis zu vier Zeichen: Priorität, Gliederung, Tageszeit und Dauer.
 */
import {
  Ban,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Clock3,
  CornerDownRight,
  ListTree,
  Moon,
  Sun,
  Sunrise,
  type LucideIconData,
} from 'lucide-angular';

import {
  MoscowLevel,
  TaskLevel,
  TimeOfDay,
  composeTitle,
  durationOf,
  formatDuration,
  priorityBadge,
  stripPriorityPrefix,
  taskLevel,
  timeOfDay,
} from './title-priority';
import { dashHeading } from './rich-title';

/** Eine Dauer als Zeichen: Minuten mit „m" dahinter, „15m", „90m". */
export type DurationToken = `${number}m`;

export type TitleToken = MoscowLevel | TaskLevel | TimeOfDay | DurationToken;

type FixedToken = Exclude<TitleToken, DurationToken>;

/** Auf welcher Achse ein Zeichen liegt: je Achse steht höchstens eins im Titel. */
type Axis = 'priority' | 'level' | 'when' | 'duration';

function axisOf(token: TitleToken): Axis {
  if (token === 'main' || token === 'sub') return 'level';
  if (token === 'morning' || token === 'afternoon' || token === 'evening') return 'when';
  if (isDuration(token)) return 'duration';
  return 'priority';
}

const AXES: Axis[] = ['priority', 'level', 'when', 'duration'];

export function isDuration(token: TitleToken): token is DurationToken {
  return /^\d+m$/.test(token);
}

/** Die Minuten eines Dauer-Zeichens. */
export function durationMinutes(token: DurationToken): number {
  return Number.parseInt(token, 10);
}

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
const ICON: Record<FixedToken, LucideIconData> = {
  must: ChevronsUp,
  should: ChevronUp,
  could: ChevronDown,
  wont: Ban,
  main: ListTree,
  sub: CornerDownRight,
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
};

export function tokenIcon(token: TitleToken): LucideIconData {
  return isDuration(token) ? Clock3 : ICON[token];
}

/** Das Wort zum Zeichen — für Tooltip und Ansagen, nicht für die Fläche. */
const LABEL: Record<FixedToken, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
  main: 'Main',
  sub: 'Step',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export function tokenLabel(token: TitleToken): string {
  return isDuration(token) ? formatDuration(durationMinutes(token)) : LABEL[token];
}

/** Für die Vorlesesoftware: was das Zeichen bedeutet, nicht wie es aussieht. */
const DESCRIPTION: Record<FixedToken, string> = {
  must: 'Must-have',
  should: 'Should-have',
  could: 'Could-have',
  wont: "Won't-have",
  main: 'Main task',
  sub: 'Step of the task above',
  morning: 'In the morning',
  afternoon: 'In the afternoon',
  evening: 'In the evening',
};

export function tokenDescription(token: TitleToken): string {
  return isDuration(token) ? `Takes about ${formatDuration(durationMinutes(token))}` : DESCRIPTION[token];
}

/**
 * Text im Chip, wo das Symbol allein nichts sagt. Eine Uhr ist keine Dauer —
 * „15m" schon. Alle anderen Zeichen bleiben reine Symbole.
 */
export function tokenText(token: TitleToken): string | null {
  return isDuration(token) ? formatDuration(durationMinutes(token)) : null;
}

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
const TOKEN_CLASS: Record<FixedToken, string> = {
  must: 'bg-rose-500/20 text-rose-300',
  should: 'bg-indigo-500/20 text-indigo-300',
  could: 'bg-fill-strong text-muted',
  wont: 'bg-fill text-subtle',
  main: 'bg-fill-strong text-text',
  sub: 'bg-fill text-muted',
  morning: 'bg-amber-500/15 text-amber-300',
  afternoon: 'bg-sky-500/15 text-sky-300',
  evening: 'bg-violet-500/15 text-violet-300',
};

export function tokenClass(token: TitleToken): string {
  return isDuration(token) ? 'bg-fill-strong text-muted' : TOKEN_CLASS[token];
}

/**
 * In fester Reihenfolge: Priorität, Gliederung, Tageszeit, Dauer — so
 * stehen sie im Titel und als Chips.
 */
function ordered(tokens: ReadonlyArray<TitleToken | null>): TitleToken[] {
  const present = tokens.filter((t): t is TitleToken => t !== null);
  return AXES.flatMap((axis) => present.filter((t) => axisOf(t) === axis));
}

/**
 * Die Zeichen eines Titels: höchstens eins je Achse, in fester Reihenfolge.
 * Leer, wenn keins davorsteht.
 */
export function tokensOf(title: string): TitleToken[] {
  const minutes = durationOf(title);
  return ordered([
    priorityBadge(title),
    taskLevel(title),
    timeOfDay(title),
    minutes === null ? null : (`${minutes}m` as DurationToken),
  ]);
}

/**
 * Ein Zeichen dazu. Es ersetzt das derselben Achse — eine Priorität die
 * andere, eine Gliederung die andere — und lässt die übrigen stehen.
 */
export function withToken(tokens: readonly TitleToken[], token: TitleToken): TitleToken[] {
  return ordered([...tokens.filter((t) => axisOf(t) !== axisOf(token)), token]);
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

/** Ein einzelnes Wort als Zeichen („/must", „/1h"), oder null. */
function tokenOfWord(word: string): TitleToken | null {
  const { tokens, text } = splitTitle(`${word} `);
  return tokens.length === 1 && text === '' ? tokens[0] : null;
}

/** Ein Wort mit Schrägstrich, allein stehend: am Zeilenanfang oder nach Leerraum. */
const SLASH_WORD = /(^|[ \t]+)(\/\S+)(?=[ \t]|$)/g;

/**
 * Zeichen aus dem Getippten holen — von überall, nicht nur von vorn.
 *
 * „Mittagessen /afternoon /1h /must" meint dasselbe wie
 * „/must /afternoon /1h Mittagessen": man schreibt erst, worum es geht, und
 * hängt an, was die App wissen soll. Vorher zählten die Zeichen nur ganz vorn,
 * und hinten blieben sie als Text stehen.
 *
 * Nur für Getipptes, nicht für gespeicherte Titel: dort stehen die Zeichen
 * vorn (joinTitle), und ein „/must" mitten im Satz bleibt beim Lesen Text
 * (splitTitle).
 *
 * `done`: der Text ist fertig (Enter, Feld verlassen). Dann zählt auch ein
 * Zeichen ganz am Ende ohne Leerzeichen dahinter — beim Tippen nicht, „/1h"
 * kann noch „/1h30m" werden. Je Achse gilt das letzte.
 */
export function pullTokens(text: string, done = false): { tokens: TitleToken[]; text: string } {
  let tokens: TitleToken[] = [];
  const lines = text.split('\n');
  const out = lines.map((line, i) => {
    const last = i === lines.length - 1;
    let atStart = false;
    const rest = line.replace(SLASH_WORD, (match: string, _lead: string, word: string, offset: number) => {
      if (!done && last && offset + match.length === line.length) return match;
      const token = tokenOfWord(word);
      if (token === null) return match;
      tokens = withToken(tokens, token);
      if (offset === 0) atStart = true;
      return '';
    });
    // Vorn weggenommen, bliebe das Leerzeichen dahinter als Einzug stehen.
    return atStart ? rest.trimStart() : rest;
  });
  return { tokens, text: tokens.length === 0 ? text : out.join('\n') };
}

/**
 * Beim Tippen: was links vom Cursor fertig dasteht, wird zum Chip — vorn,
 * hinten oder dazwischen, sobald das Leerzeichen dahinter fällt. Rechts vom
 * Cursor wird nicht getippt, das bleibt für `typedTitle` beim Anlegen.
 *
 * Null, wenn es nichts zu holen gab; sonst der neue Text und wo der Cursor
 * jetzt steht.
 */
export function pullTyped(
  value: string,
  caret: number,
): { tokens: TitleToken[]; text: string; caret: number } | null {
  const before = pullTokens(value.slice(0, caret));
  if (before.tokens.length === 0) return null;
  let after = value.slice(caret);
  // „Suppe /must | Dal": ein Leerzeichen vor und eins hinter der Lücke.
  if (/[ \t]$/.test(before.text) && after.startsWith(' ')) after = after.slice(1);
  return { tokens: before.tokens, text: before.text + after, caret: before.text.length };
}

/**
 * Was jemand eingegeben hat → Titel, so wie er gespeichert wird.
 *
 * Die Zeichen von überall (`pullTokens`), ein Gedankenstrich als Überschrift
 * (`dashHeading`), und die Chips des Felds dazu. Ein getipptes Zeichen
 * gewinnt auf seiner Achse gegen den Chip, wie in joinTitle.
 *
 * `heading: false` lässt den Gedankenstrich stehen — beim Bearbeiten eines
 * Titels, der ihn schon vorher hatte: der war so gemeint.
 */
export function typedTitle(
  raw: string,
  chips: readonly TitleToken[] = [],
  { heading = true }: { heading?: boolean } = {},
): string {
  const pulled = pullTokens(raw.trim(), true);
  const text = pulled.text.trim();
  const tokens = pulled.tokens.reduce(withToken, [...chips]);
  return joinTitle(tokens, heading ? dashHeading(text) : text);
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
  const on = <T extends TitleToken>(axis: Axis) => (all.find((t) => axisOf(t) === axis) ?? null) as T | null;
  const duration = on<DurationToken>('duration');
  return composeTitle(on<MoscowLevel>('priority'), on<TaskLevel>('level'), typed.text, {
    when: on<TimeOfDay>('when'),
    minutes: duration === null ? null : durationMinutes(duration),
  });
}
