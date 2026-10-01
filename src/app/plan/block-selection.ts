/**
 * Mehrere Bloecke auf einmal markieren.
 *
 * Bis hierher endete jede Markierung am Absatz: der Editor liegt je Block in
 * einem eigenen contenteditable, und eine Auswahl, die zwei davon beruehrt,
 * kann der Browser zwar anzeigen, aber niemand damit etwas anfangen —
 * Loeschen zerriss den Text, Kopieren nahm rohes HTML mit.
 *
 * Deshalb wird aus so einer Auswahl hier etwas anderes: keine Textmarkierung
 * mehr, sondern eine Auswahl VON BLOECKEN. Das ist derselbe Griff wie in
 * Notion, und es ist auch dieselbe Einschraenkung: markiert wird immer ein
 * zusammenhaengender Bereich unter EINEM Elternteil. Ein Bereich, der mitten
 * in einem Toggle anfaengt und ausserhalb aufhoert, waere weder zu loeschen
 * noch zu kopieren, ohne dass man raet, was mit der Haelfte passieren soll.
 */
import type { PlanBlock } from './plan.model';

export interface Siblings {
  /** Die Ids aller Geschwister, in ihrer Reihenfolge. */
  ids: string[];
  /** Position des gesuchten Blocks darin. */
  index: number;
  /** Die Gruppe, in der sie stehen — null fuer die oberste Ebene. */
  parent: string | null;
}

/**
 * Die Geschwisterliste, in der dieser Block steht.
 *
 * Gesucht wird ueber den ganzen Baum, denn ein Block kann beliebig tief in
 * Gruppen liegen; zurueck kommt aber nur seine eigene Ebene.
 */
export function siblingsOf(
  blocks: readonly PlanBlock[],
  id: string,
  parent: string | null = null,
): Siblings | null {
  const index = blocks.findIndex((b) => b.id === id);
  if (index >= 0) return { ids: blocks.map((b) => b.id), index, parent };

  for (const block of blocks) {
    if (block.type !== 'group') continue;
    const found = siblingsOf(block.blocks, id, block.id);
    if (found) return found;
  }
  return null;
}

/**
 * Der zusammenhaengende Bereich zwischen zwei Geschwistern.
 *
 * Die Richtung ist egal: wer von unten nach oben zieht, meint dasselbe.
 * Gehoert einer der beiden nicht in die Liste, gibt es keinen Bereich —
 * lieber nichts markieren als etwas Falsches.
 */
export function rangeBetween(ids: readonly string[], anchor: string, focus: string): string[] {
  const from = ids.indexOf(anchor);
  const to = ids.indexOf(focus);
  if (from < 0 || to < 0) return [];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/**
 * Was nach dem Loeschen einer Auswahl den Cursor bekommt.
 *
 * Der Block ueber der Auswahl, sonst der darunter, sonst nichts — dann war
 * die Liste leer. Ohne das landet der Cursor nirgends, und das naechste
 * Getippte geht ins Leere.
 */
export function neighbourAfterRemoval(
  ids: readonly string[],
  removed: readonly string[],
): string | null {
  const first = ids.indexOf(removed[0]);
  if (first < 0) return null;

  const before = ids[first - 1];
  if (before) return before;

  const after = ids[first + removed.length];
  return after ?? null;
}

/**
 * Mehrere Bloecke auf einmal entfernen.
 *
 * Als eigene Funktion, nicht als Schleife ueber das Entfernen eines
 * einzelnen: so ist der Weg, den das Loeschen einer Auswahl wirklich nimmt,
 * geprueft — und nicht nur die Regeln davor.
 */
export function removeBlocks(blocks: readonly PlanBlock[], ids: readonly string[]): PlanBlock[] {
  const gone = new Set(ids);

  return blocks
    .filter((block) => !gone.has(block.id))
    .map((block) =>
      block.type === 'group' ? { ...block, blocks: removeBlocks(block.blocks, ids) } : block,
    );
}
