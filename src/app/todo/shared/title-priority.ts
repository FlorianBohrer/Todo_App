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

interface PriorityPrefix {
  /** Kleinbuchstaben, wird gegen den Titelanfang geprüft. */
  match: string;
  /** kleiner = weiter oben */
  priority: number;
  badge: MoscowLevel;
}

/**
 * Reihenfolge zählt: „/wont " wird vor „/won't " geprüft, und längere Formen
 * vor kürzeren, sonst schluckt ein Präfix den Anfang des nächsten.
 */
const PREFIXES: PriorityPrefix[] = [
  { match: '/must ',   priority: 0, badge: 'must' },
  { match: '/should ', priority: 1, badge: 'should' },
  { match: '/could ',  priority: 2, badge: 'could' },
  { match: "/won't ",  priority: 4, badge: 'wont' },
  { match: '/wont ',   priority: 4, badge: 'wont' },
];

/** Ohne Präfix: zwischen Could und Won't — unbewertet, aber nicht abgewählt. */
const NORMAL_PRIORITY = 3;

function findPrefix(title: string): PriorityPrefix | undefined {
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

/** Anzeigetext ohne Präfix (und ohne die folgenden Leerzeichen). */
export function stripPriorityPrefix(title: string): string {
  const found = findPrefix(title);
  if (!found) return title;
  const trimmed = title.trimStart();
  return trimmed.slice(found.match.length).trimStart();
}

/** Beschriftung des Badges. */
export const MOSCOW_LABEL: Record<MoscowLevel, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};
