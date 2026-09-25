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
export type MoscowLevel = 'must' | 'should' | 'could' | 'wont';

/**
 * Haupt- oder Unteraufgabe.
 *
 * Bewusst derselbe Präfix-Slot wie MoSCoW und keine zweite Achse: eine
 * Unteraufgabe ist ein Schritt ihrer Hauptaufgabe, und priorisiert wird die
 * Hauptaufgabe. „Wichtiger Teilschritt einer unwichtigen Aufgabe" ist keine
 * Aussage, die man treffen will.
 */
export type TaskLevel = 'main' | 'sub';

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

function findPrefix(title: string): TitlePrefix | undefined {
  const start = title.trimStart().toLowerCase();
  return PREFIXES.find((p) => start.startsWith(p.match));
}

/** Sortier-Priorität: must 0, should 1, could 2, ohne 3, won't 4. */
export function titlePriority(title: string): number {
  return findPrefix(title)?.priority ?? NORMAL_PRIORITY;
}

/** Die MoSCoW-Stufe eines Titels, oder null wenn keine gesetzt ist. */
export function priorityBadge(title: string): MoscowLevel | null {
  return findPrefix(title)?.badge ?? null;
}

/** Haupt- oder Unteraufgabe, oder null wenn nichts gesetzt ist. */
export function taskLevel(title: string): TaskLevel | null {
  return findPrefix(title)?.level ?? null;
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
 * ist dann eben eine gewöhnliche Aufgabe mit Einzug.
 */
export function subtaskGroups<T extends { title: string }>(items: readonly T[]): T[][] {
  const groups: T[][] = [];

  for (const item of items) {
    const isSub = taskLevel(item.title) === 'sub';
    if (isSub && groups.length > 0) {
      groups[groups.length - 1].push(item);
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
 */
export function orderWithSubtasks<T extends { title: string }>(items: T[]): T[] {
  // Stabil: gleich priorisierte Gruppen behalten die Reihenfolge, die der
  // Nutzer selbst gezogen hat.
  const sorted = [...subtaskGroups(items)].sort(
    (a, b) => titlePriority(a[0].title) - titlePriority(b[0].title),
  );

  return sorted.flat();
}

/** Erste Zeile nach der Gruppe, zu der `index` gehört. */
function groupEnd(items: readonly { title: string }[], index: number): number {
  let end = index + 1;
  while (end < items.length && taskLevel(items[end].title) === 'sub') end++;
  return end;
}

/** Kopfzeile der Gruppe, zu der `index` gehört. */
function groupStart(items: readonly { title: string }[], index: number): number {
  let start = index;
  while (start > 0 && taskLevel(items[start].title) === 'sub') start--;
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

/** Anzeigetext ohne Präfix (und ohne die folgenden Leerzeichen). */
export function stripPriorityPrefix(title: string): string {
  const found = findPrefix(title);
  if (!found) return title;
  const trimmed = title.trimStart();
  return trimmed.slice(found.match.length).trimStart();
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
 * Ein selbst getipptes Präfix gewinnt. Das ist zugleich der Weg zurück: wer
 * „/main " davorschreibt, macht aus der Unteraufgabe wieder eine
 * Hauptaufgabe.
 */
export function withTaskLevel(title: string, level: TaskLevel | null): string {
  if (level === null) return title;
  const trimmed = title.trimStart();
  if (trimmed === '' || findPrefix(trimmed)) return title;
  return `/${level} ${trimmed}`;
}

/** Beschriftung des Badges. */
export const MOSCOW_LABEL: Record<MoscowLevel, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};
