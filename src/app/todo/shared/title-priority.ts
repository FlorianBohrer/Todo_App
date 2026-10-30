/**
 * Priorität per Titel-Präfix — nach MoSCoW.
 *
 * MoSCoW stammt aus DSDM und ist in der Softwareentwicklung die verbreitetste
 * Art, Anforderungen zu ordnen. Es sind VIER Stufen, und jede hat eine
 * Definition, die über „wichtig/unwichtig" hinausgeht:
 *
 *   Must   — ohne das ist die Lieferung wertlos. Kein Verhandlungsspielraum.
 *   Should — wichtig, aber nicht lebensnotwendig. Es tut weh, es wegzulassen,
 *            und es gibt einen Behelf.
 *   Could  — wünschenswert. Fällt es weg, merkt es kaum jemand. Genau deshalb
 *            ist es der Puffer, den man opfert, wenn die Zeit knapp wird.
 *   Won't  — für DIESEN Zeitraum bewusst draußen. Nicht „nie", sondern „jetzt
 *            nicht" — und, anders als Vergessen, eine festgehaltene
 *            Entscheidung.
 *
 * Die App hatte nur Must und Could. Damit fehlte die Stufe, in der das meiste
 * landet (Should), und die einzige, die eine Entscheidung dokumentiert (Won't).
 *
 * Der Präfix bleibt im gespeicherten Titel — er trägt die Sortierung — und
 * wird in der Ansicht ausgeblendet.
 */
import { isSection, sectionEndOf, sectionStartOf } from './section';

export type MoscowLevel = 'must' | 'should' | 'could' | 'wont';

/**
 * Haupt- oder Unteraufgabe.
 *
 * Eine zweite Achse neben MoSCoW: „/must /main Umzug" ist eine wichtige
 * Hauptaufgabe, „/must /sub Pass verlängern" ein Schritt, der sein muss.
 * Anfangs teilten sich beide einen Präfix-Slot, und es zählte nur das erste —
 * wer beides schrieb, sah das zweite als Text und verlor dabei die
 * Gliederung. Sortiert wird weiter über die Hauptaufgabe (orderWithSubtasks):
 * die Priorität eines Schritts sagt, wie wichtig er ist, nicht wo er steht.
 */
export type TaskLevel = 'main' | 'sub';

/**
 * Wann am Tag — die dritte Achse, für die Tagesansicht (Anytime, Morning,
 * Afternoon, Evening). Ohne Präfix: „Anytime", jederzeit an diesem Tag.
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Was ein Titel ausser Priorität und Gliederung noch trägt: Tageszeit und
 * Dauer. Eigene Achsen, damit ein Umbau des Titels (Stufe setzen, Präfix
 * tippen) sie nicht verliert.
 */
export interface TitleMeta {
  when?: TimeOfDay | null;
  /** Geschätzte Dauer in Minuten. */
  minutes?: number | null;
}

interface TitlePrefix {
  /** Kleinbuchstaben, wird gegen den Titelanfang geprüft. */
  match: string;
  /** kleiner = weiter oben */
  priority: number;
  badge?: MoscowLevel;
  level?: TaskLevel;
}

/** Ohne Präfix: zwischen Could und Won't — unbewertet, aber nicht abgewählt. */
const NORMAL_PRIORITY = 3;

/**
 * Reihenfolge zählt: „/wont " wird vor „/won't " geprüft, und längere Formen
 * vor kürzeren, sonst schluckt ein Präfix den Anfang des nächsten.
 */
const PREFIXES: TitlePrefix[] = [
  { match: '/must ',   priority: 0, badge: 'must' },
  { match: '/should ', priority: 1, badge: 'should' },
  { match: '/could ',  priority: 2, badge: 'could' },
  { match: "/won't ",  priority: 4, badge: 'wont' },
  { match: '/wont ',   priority: 4, badge: 'wont' },
  // Gliederung statt Gewichtung: beide erben die normale Priorität. Die
  // Unteraufgabe bekommt ihre Reihenfolge ohnehin von ihrer Hauptaufgabe,
  // siehe orderWithSubtasks.
  { match: '/main ',   priority: NORMAL_PRIORITY, level: 'main' },
  { match: '/sub ',    priority: NORMAL_PRIORITY, level: 'sub' },
];

const WHEN_PREFIXES: { match: string; when: TimeOfDay }[] = [
  { match: '/morning ', when: 'morning' },
  { match: '/afternoon ', when: 'afternoon' },
  { match: '/evening ', when: 'evening' },
];

/**
 * Dauer als Präfix: „/15m", „/1h", „/1h30m". Erst das Leerzeichen dahinter
 * macht es zum Zeichen, wie bei allen anderen.
 */
const DURATION = /^\/(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?=\s)/i;

/** Längste Dauer, die als Zeichen gilt: ein Tag. */
const MAX_MINUTES = 24 * 60;

function readDuration(lower: string): { length: number; minutes: number } | null {
  const m = DURATION.exec(lower);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (minutes <= 0 || minutes > MAX_MINUTES) return null;
  return { length: m[0].length, minutes };
}

interface TitlePrefixes {
  badge: MoscowLevel | null;
  level: TaskLevel | null;
  when: TimeOfDay | null;
  minutes: number | null;
  /** Der Titel ab dem ersten Zeichen nach den Präfixen. */
  rest: string;
}

/**
 * Alle Präfixe am Anfang, in beliebiger Reihenfolge: „/must /sub " und
 * „/sub /must " meinen dasselbe. Pro Achse zählt das erste; ein zweites
 * derselben Achse wird trotzdem gelesen, damit es nie als Text stehen bleibt.
 */
function readPrefixes(title: string): TitlePrefixes {
  let badge: MoscowLevel | null = null;
  let level: TaskLevel | null = null;
  let when: TimeOfDay | null = null;
  let minutes: number | null = null;
  let rest = title.trimStart();
  let found = false;

  // Hinter dem Wort zählt jedes Leerzeichen, auch ein Zeilenumbruch:
  // „/sub" allein in der ersten Zeile ist genauso ein Präfix.
  const at = (lower: string, match: string) =>
    lower.startsWith(match.trimEnd()) && /\s/.test(lower.charAt(match.length - 1));

  for (;;) {
    const lower = rest.toLowerCase();
    const prefix = PREFIXES.find((p) => at(lower, p.match));
    if (prefix) {
      badge ??= prefix.badge ?? null;
      level ??= prefix.level ?? null;
      rest = rest.slice(prefix.match.length).trimStart();
      found = true;
      continue;
    }
    const time = WHEN_PREFIXES.find((p) => at(lower, p.match));
    if (time) {
      when ??= time.when;
      rest = rest.slice(time.match.length).trimStart();
      found = true;
      continue;
    }
    const duration = readDuration(lower);
    if (duration) {
      minutes ??= duration.minutes;
      rest = rest.slice(duration.length).trimStart();
      found = true;
      continue;
    }
    break;
  }

  return { badge, level, when, minutes, rest: found ? rest : title };
}

/** Die Tageszeit eines Titels, oder null für „Anytime". */
export function timeOfDay(title: string): TimeOfDay | null {
  return readPrefixes(title).when;
}

/** Die geschätzte Dauer in Minuten, oder null wenn keine dasteht. */
export function durationOf(title: string): number | null {
  return readPrefixes(title).minutes;
}

/** Was ein Titel an Tageszeit und Dauer trägt — für alles, was ihn umbaut. */
export function titleMeta(title: string): TitleMeta {
  const { when, minutes } = readPrefixes(title);
  return { when, minutes };
}

/** 5 → „5m", 60 → „1h", 90 → „1h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** So steht eine Dauer im Titel: „/15m", „/1h", „/1h30m". */
export function durationPrefix(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `/${h > 0 ? `${h}h` : ''}${m > 0 || h === 0 ? `${m}m` : ''} `;
}

/** Sortier-Priorität: must 0, should 1, could 2, ohne 3, won't 4. */
export function titlePriority(title: string): number {
  const badge = readPrefixes(title).badge;
  return PREFIXES.find((p) => p.badge === badge)?.priority ?? NORMAL_PRIORITY;
}

/** Die MoSCoW-Stufe eines Titels, oder null wenn keine gesetzt ist. */
export function priorityBadge(title: string): MoscowLevel | null {
  return readPrefixes(title).badge;
}

/** Haupt- oder Unteraufgabe, oder null wenn nichts gesetzt ist. */
export function taskLevel(title: string): TaskLevel | null {
  return readPrefixes(title).level;
}

/** So steht eine Stufe im Titel. Won't mit Apostroph, wie man es schreibt. */
const WRITTEN: Record<MoscowLevel | TaskLevel, string> = {
  must: '/must ',
  should: '/should ',
  could: '/could ',
  wont: "/won't ",
  main: '/main ',
  sub: '/sub ',
};

/**
 * Stufen und Text → Titel, so wie er gespeichert wird: erst die Priorität,
 * dann die Gliederung. Ohne Text kein Präfix — ein Titel, der nur aus
 * „/must " bestünde, wäre leer.
 */
export function composeTitle(
  badge: MoscowLevel | null,
  level: TaskLevel | null,
  text: string,
  meta: TitleMeta = {},
): string {
  if (text.trim() === '') return text;
  return (
    (badge ? WRITTEN[badge] : '') +
    (level ? WRITTEN[level] : '') +
    (meta.when ? `/${meta.when} ` : '') +
    (meta.minutes ? durationPrefix(meta.minutes) : '') +
    text
  );
}

/** Setzt die Tageszeit neu (null: Anytime). Alles andere bleibt. */
export function setTimeOfDay(title: string, when: TimeOfDay | null): string {
  const typed = readPrefixes(title.trimStart());
  if (typed.rest.trim() === '') return title;
  return composeTitle(typed.badge, typed.level, typed.rest, { when, minutes: typed.minutes });
}

/** Setzt die Dauer neu (null: keine). Alles andere bleibt. */
export function setDuration(title: string, minutes: number | null): string {
  const typed = readPrefixes(title.trimStart());
  if (typed.rest.trim() === '') return title;
  return composeTitle(typed.badge, typed.level, typed.rest, { when: typed.when, minutes });
}

/** Setzt die Priorität neu (null: keine). Alles andere bleibt. */
export function setPriority(title: string, badge: MoscowLevel | null): string {
  const typed = readPrefixes(title.trimStart());
  if (typed.rest.trim() === '') return title;
  return composeTitle(badge, typed.level, typed.rest, { when: typed.when, minutes: typed.minutes });
}

/**
 * Bündelt die Liste: jede Hauptaufgabe mit den Unteraufgaben, die ihr folgen.
 *
 * Die eine Stelle, an der „wozu gehört diese Zeile" beantwortet wird.
 * Sortieren, Einklappen und Verschieben müssen dieselbe Antwort bekommen —
 * sonst landet eine gezogene Zeile an einer Stelle, an der sie laut Einrückung
 * nicht liegt, und das Einklappen versteckt die falschen Zeilen.
 *
 * Eine Unteraufgabe ohne Hauptaufgabe darüber bildet ihre eigene Gruppe: sie
 * ist dann eben eine gewöhnliche Aufgabe mit Einzug. Ebenso direkt unter
 * einer Abschnittsüberschrift (section.ts): ein Abschnitt hat keine Schritte.
 */
export function subtaskGroups<T extends { title: string }>(items: readonly T[]): T[][] {
  const groups: T[][] = [];

  for (const item of items) {
    const isSub = taskLevel(item.title) === 'sub';
    const last = groups[groups.length - 1];
    if (isSub && last && !isSection(last[0].title)) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups;
}

/**
 * Sortiert nach Priorität und hält Unteraufgaben bei ihrer Hauptaufgabe.
 *
 * Ohne diese Bündelung wäre die Einrückung eine Lüge. Sortiert wird nach
 * MoSCoW; eine Unteraufgabe trägt keine eigene Stufe und läge damit bei den
 * unbewerteten, während ihre Hauptaufgabe als /must nach oben rutscht. Die
 * eingerückte Zeile stünde dann unter irgendeiner fremden Aufgabe und sähe aus,
 * als gehöre sie dorthin.
 *
 * Also: erst gruppieren, dann die GRUPPEN sortieren, dann wieder ausrollen.
 *
 * Und zwar je Abschnitt: ein Must-have aus „Später" springt nicht über die
 * Überschrift nach „Diese Woche". Die Abschnitte selbst bleiben, wo sie sind.
 */
export function orderWithSubtasks<T extends { title: string }>(items: T[]): T[] {
  const out: T[] = [];
  let segment: T[][] = [];
  const flush = () => {
    // Stabil: gleich priorisierte Gruppen behalten die Reihenfolge, die der
    // Nutzer selbst gezogen hat.
    segment.sort((a, b) => titlePriority(a[0].title) - titlePriority(b[0].title));
    for (const group of segment) out.push(...group);
    segment = [];
  };

  for (const group of subtaskGroups(items)) {
    if (isSection(group[0].title)) {
      flush();
      out.push(...group);
    } else {
      segment.push(group);
    }
  }
  flush();
  return out;
}

/** Erste Zeile nach der Gruppe, zu der `index` gehört. */
function groupEnd(items: readonly { title: string }[], index: number): number {
  if (isSection(items[index].title)) return index + 1;
  let end = index + 1;
  while (end < items.length && taskLevel(items[end].title) === 'sub') end++;
  return end;
}

/** Kopfzeile der Gruppe, zu der `index` gehört. */
function groupStart(items: readonly { title: string }[], index: number): number {
  let start = index;
  while (
    start > 0 &&
    taskLevel(items[start].title) === 'sub' &&
    !isSection(items[start - 1].title)
  ) {
    start--;
  }
  return start;
}

/**
 * Neue Reihenfolge nach einem Zug — mit den Unteraufgaben im Schlepptau.
 *
 * Eine Hauptaufgabe zieht ihre Unteraufgaben mit. Sonst blieben sie liegen und
 * würden, weil die Zugehörigkeit an der Position hängt, beim nächsten
 * Durchlauf der fremden Zeile darüber zugeschlagen: man schiebt eine Aufgabe
 * und verliert dabei ihre Teilschritte an den Nachbarn. Zugeklappt wäre das
 * nicht einmal sichtbar.
 *
 * Eine Unteraufgabe zieht dagegen allein — genau so wechselt sie die
 * Hauptaufgabe.
 *
 * Fällt eine Hauptaufgabe mitten in eine fremde Gruppe, rastet sie an deren
 * Rand ein: eine Gruppe aufzutrennen würde die dahinter liegenden
 * Unteraufgaben an die eingeschobene Zeile hängen.
 *
 * Gibt die vollständige neue Reihenfolge als IDs zurück, oder null, wenn der
 * Zug nichts ändert.
 */
export function moveWithSubtasks<T extends { id: string; title: string }>(
  items: readonly T[],
  movedId: string,
  targetId: string,
): string[] | null {
  const from = items.findIndex((i) => i.id === movedId);
  const to = items.findIndex((i) => i.id === targetId);
  if (from === -1 || to === -1 || from === to) return null;

  if (isSection(items[from].title)) return moveSection(items, from, to);

  const alone = taskLevel(items[from].title) === 'sub';
  const start = from;
  const end = alone ? from + 1 : groupEnd(items, from);

  // Ziel innerhalb des bewegten Blocks: eine Hauptaufgabe auf die eigene
  // Unteraufgabe zu ziehen hat kein sinnvolles Ergebnis.
  if (to >= start && to < end) return null;

  const down = to > from;
  const anchorIndex = alone
    ? (down ? to + 1 : to)
    : (down ? groupEnd(items, to) : groupStart(items, to));
  const anchorId = items[anchorIndex]?.id ?? null;

  const moved = items.slice(start, end);
  const rest = [...items.slice(0, start), ...items.slice(end)];
  const found = anchorId === null ? -1 : rest.findIndex((i) => i.id === anchorId);
  const at = found === -1 ? rest.length : found;

  return [...rest.slice(0, at), ...moved, ...rest.slice(at)].map((i) => i.id);
}

/**
 * Ein Abschnitt zieht alles mit, was zu ihm gehört, und rastet an den
 * Grenzen anderer Abschnitte ein — mitten in einen fremden fallen gelassen,
 * würde er dessen hintere Hälfte übernehmen. Nach oben in den Bereich ohne
 * Überschrift gezogen, landet er vor dem ersten Abschnitt: sonst gehörten
 * die Todos dort plötzlich ihm.
 */
function moveSection<T extends { id: string; title: string }>(
  items: readonly T[],
  from: number,
  to: number,
): string[] | null {
  const end = sectionEndOf(items, from);
  if (to >= from && to < end) return null;

  let anchorIndex: number;
  if (to > from) {
    anchorIndex = sectionEndOf(items, to);
  } else {
    const start = sectionStartOf(items, to);
    anchorIndex = start === -1 ? items.findIndex((i) => isSection(i.title)) : start;
  }
  const anchorId = items[anchorIndex]?.id ?? null;
  if (anchorId === items[from].id) return null;

  const moved = items.slice(from, end);
  const rest = [...items.slice(0, from), ...items.slice(end)];
  const found = anchorId === null ? -1 : rest.findIndex((i) => i.id === anchorId);
  const at = found === -1 ? rest.length : found;
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)].map((i) => i.id);
}

/**
 * Legt ein Todo ans Ende der Gruppe einer Hauptaufgabe.
 *
 * Ans ENDE, nicht direkt dahinter: wer drei Schritte nacheinander tippt, meint
 * ihre Reihenfolge. Direkt hinter der Hauptaufgabe eingesetzt stünde der
 * zuletzt getippte oben, und die Liste läse sich rückwärts.
 *
 * Gibt die Liste unverändert zurück, wenn es eines von beiden nicht gibt —
 * eine halb ausgeführte Umsortierung wäre schlimmer als gar keine.
 */
export function appendUnder<T extends { id: string; title: string }>(
  items: readonly T[],
  movedId: string,
  parentId: string,
): T[] {
  const moved = items.find((i) => i.id === movedId);
  if (!moved || movedId === parentId) return [...items];

  const rest = items.filter((i) => i.id !== movedId);
  const at = rest.findIndex((i) => i.id === parentId);
  if (at === -1) return [...items];

  let end = at + 1;
  while (end < rest.length && taskLevel(rest[end].title) === 'sub') end++;

  return [...rest.slice(0, end), moved, ...rest.slice(end)];
}

/**
 * Zieht ein Todo aus seiner Gruppe heraus: hinter deren letzte Zeile.
 *
 * An Ort und Stelle zur eigenen Aufgabe gemacht, würde es die Schritte, die
 * ihm folgen, an sich ziehen — die Zugehörigkeit hängt an der Position. Aus
 * „a1, a2, a3" würde beim Ausrücken von a2 eine Aufgabe a2 mit dem Schritt a3.
 * Gemeint ist aber: a2 gehört nicht mehr dazu, der Rest schon.
 */
export function moveOutOfGroup<T extends { id: string; title: string }>(
  items: readonly T[],
  movedId: string,
): T[] {
  const from = items.findIndex((i) => i.id === movedId);
  if (from === -1) return [...items];
  const end = groupEnd(items, from); // erste Zeile nach der Gruppe
  const moved = items[from];
  const rest = items.filter((i) => i.id !== movedId);
  // Durch das Herausnehmen rückt alles dahinter um eins auf.
  const at = end - 1;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/**
 * Setzt die Gliederungsstufe neu — anders als withTaskLevel auch dann, wenn
 * schon eine im Titel steht. null nimmt sie heraus. Die Priorität bleibt.
 */
export function setTaskLevel(title: string, level: TaskLevel | null): string {
  const typed = readPrefixes(title.trimStart());
  if (typed.rest.trim() === '') return title;
  return composeTitle(typed.badge, level, typed.rest, typed);
}

/**
 * Was unter „Active" steht: jede Gruppe, in der noch etwas offen ist — und
 * zwar ganz, mit den erledigten Schritten.
 *
 * Vorher verschwand ein abgehakter Schritt sofort. Von „Umzug" mit fünf
 * Schritten standen nach dreien noch zwei da, und nichts sagte, dass es
 * vorangeht. Jetzt bleiben die erledigten durchgestrichen stehen, bis die
 * ganze Aufgabe fertig ist; dann geht die Gruppe als Ganzes.
 */
export function openGroups<T extends { title: string; completed: boolean }>(items: readonly T[]): T[] {
  return subtaskGroups(items)
    .filter((group) => group.some((item) => !item.completed))
    .flat();
}

/** Anzeigetext ohne Präfixe (und ohne die folgenden Leerzeichen). */
export function stripPriorityPrefix(title: string): string {
  return readPrefixes(title).rest;
}

/**
 * Setzt die Gliederungsstufe wieder an einen bearbeiteten Titel.
 *
 * Beim Bearbeiten steht im Feld der Text OHNE „/sub" — ein Steuerzeichen,
 * das man einmal tippt, will man danach nicht jedes Mal wieder vor der Nase
 * haben. Gespeichert wird aber weiter mit Präfix: es trägt die Zugehörigkeit.
 * Ohne dieses Anfügen würde jede Bearbeitung eine Unteraufgabe stillschweigend
 * aus ihrer Hauptaufgabe herauslösen.
 *
 * Eine selbst getippte Gliederung gewinnt. Das ist zugleich der Weg zurück:
 * wer „/main " davorschreibt, macht aus der Unteraufgabe wieder eine
 * Hauptaufgabe. Eine getippte Priorität dagegen bleibt neben der Stufe
 * stehen: „/must Milch" unter „Einkaufen" ist ein Schritt, der sein muss —
 * keine neue Aufgabe neben der Liste.
 */
export function withTaskLevel(title: string, level: TaskLevel | null): string {
  if (level === null) return title;
  const trimmed = title.trimStart();
  const typed = readPrefixes(trimmed);
  if (typed.level !== null || typed.rest.trim() === '') return title;
  return composeTitle(typed.badge, level, typed.rest, typed);
}

/** Beschriftung des Badges. */
export const MOSCOW_LABEL: Record<MoscowLevel, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};
