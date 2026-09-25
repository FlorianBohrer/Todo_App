/**
 * Die Zeichen links vom Eintrag — Punkt, Zahl, Buchstabe.
 *
 * Sobald Einträge einrücken können, reicht `list-style: disc` nicht mehr: eine
 * geschachtelte Aufzählung, die auf jeder Ebene denselben Punkt zeigt, sieht
 * aus wie eine, die nur zufällig verschoben ist. Notion wechselt deshalb mit
 * der Tiefe — •, ◦, ▪ — und zählt Nummern pro Ebene neu, als 1. / a. / i.
 *
 * Neu gezählt heisst: eine Unterebene beginnt bei jedem neuen Elternteil wieder
 * bei eins. Deshalb reicht kein Index, es braucht die Vorgeschichte.
 */
import type { PlanListItem } from './plan.model';

const BULLETS = ['•', '◦', '▪'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const ROMAN: [number, string][] = [
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** 1 -> a, 26 -> z, 27 -> aa. */
export function alphaLabel(n: number): string {
  let out = '';
  let rest = Math.max(1, n);
  while (rest > 0) {
    const index = (rest - 1) % 26;
    out = ALPHABET[index] + out;
    rest = Math.floor((rest - 1) / 26);
  }
  return out;
}

/** 1 -> i, 4 -> iv, 9 -> ix. */
export function romanLabel(n: number): string {
  let rest = Math.max(1, n);
  let out = '';
  for (const [value, sign] of ROMAN) {
    while (rest >= value) {
      out += sign;
      rest -= value;
    }
  }
  return out;
}

/** Die Tiefe eines Eintrags; fehlt sie, ist es die oberste Ebene. */
export function levelOf(item: PlanListItem): number {
  return Math.max(0, item.level ?? 0);
}

/**
 * Ein Zeichen je Eintrag, in Listenreihenfolge.
 *
 * In einem Durchgang für die ganze Liste statt je Eintrag gerechnet: die
 * Nummerierung braucht ohnehin alles davor, und die Vorlage soll nicht für
 * jeden Punkt die halbe Liste noch einmal durchgehen.
 */
export function listMarkers(
  items: readonly PlanListItem[],
  variant: 'bullet' | 'number' | 'todo',
): string[] {
  if (variant !== 'number') {
    return items.map((item) => BULLETS[Math.min(levelOf(item), BULLETS.length - 1)]);
  }

  const counters: number[] = [];
  return items.map((item) => {
    const level = levelOf(item);
    counters.length = level + 1;
    counters[level] = (counters[level] ?? 0) + 1;
    const n = counters[level];

    switch (level % 3) {
      case 0:
        return `${n}.`;
      case 1:
        return `${alphaLabel(n)}.`;
      default:
        return `${romanLabel(n)}.`;
    }
  });
}
