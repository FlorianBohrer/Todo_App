/**
 * Priorität per Titel-Präfix. Der Präfix bleibt im gespeicherten Titel
 * (trägt die Sortierung), wird in der Ansicht aber ausgeblendet.
 */
interface PriorityPrefix {
  match: string;               // Kleinbuchstaben, wird gegen den Titelanfang geprüft
  priority: number;            // kleiner = weiter oben
  badge: 'must' | 'could';
}

const PREFIXES: PriorityPrefix[] = [
  { match: '/must-have',  priority: 0, badge: 'must' },
  { match: '/could-have', priority: 1, badge: 'could' },
];

const NORMAL_PRIORITY = 2;

function findPrefix(title: string): PriorityPrefix | undefined {
  const start = title.trimStart().toLowerCase();
  return PREFIXES.find((p) => start.startsWith(p.match));
}

/** Sortier-Priorität: /must-have -> 0, /could-have -> 1, sonst -> 2. */
export function titlePriority(title: string): number {
  return findPrefix(title)?.priority ?? NORMAL_PRIORITY;
}

/** 'must' | 'could' | null — für ein optionales Badge. */
export function priorityBadge(title: string): 'must' | 'could' | null {
  return findPrefix(title)?.badge ?? null;
}

/** Anzeigetext ohne Präfix (und ohne die folgenden Leerzeichen). */
export function stripPriorityPrefix(title: string): string {
  const found = findPrefix(title);
  if (!found) return title;
  const trimmed = title.trimStart();
  return trimmed.slice(found.match.length).trimStart();
}
