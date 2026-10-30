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
