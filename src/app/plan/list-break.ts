/**
 * Eine Liste an einem Eintrag aufbrechen.
 *
 * Der Eintrag wird zu einem Absatz an GENAU seiner Stelle: was davor steht,
 * bleibt die Liste, was danach steht, wird eine zweite Liste derselben Art.
 *
 * Gebraucht an zwei Stellen, die sich beide anfuehlen sollen wie in jedem
 * anderen Editor:
 *
 * - Enter auf einem leeren Punkt heisst „Liste hier zu Ende". Vorher landete
 *   der neue Absatz immer HINTER der ganzen Liste — stand der leere Punkt in
 *   der Mitte, sprang der Cursor ans Listenende, weg von der Stelle, an der
 *   man gerade war.
 * - Rueckschritt am Anfang eines Punktes nimmt zuerst das Aufzaehlungszeichen
 *   weg; die Zeile bleibt stehen. Erst der zweite Rueckschritt fuegt sie an
 *   den Punkt darueber an. Vorher klebte der Text sofort am vorigen Punkt
 *   („ApfelBirne"), und ein Aufzaehlungszeichen allein loszuwerden ging nur
 *   ueber das Menue.
 */
import { levelOf } from './list-markers';
import { PlanBlock, PlanListBlock, PlanListItem, PlanTextBlock } from './plan.model';

/**
 * @param listId   die Liste, die aufgebrochen wird — auch in einem Abschnitt
 * @param index    der Eintrag, der zum Absatz wird
 * @param paragraph der Absatz, der an seine Stelle tritt
 * @param newListId Kennung fuer die zweite Liste, falls es eine gibt
 *
 * Die urspruengliche Kennung bleibt bei dem Teil, der am Platz bleibt: bei
 * der vorderen Liste, und wenn es keine gibt, bei der hinteren. So bleibt die
 * Liste fuer alles, was sie ueber ihre Kennung findet, dieselbe.
 */
export function breakListAt(
  blocks: readonly PlanBlock[],
  listId: string,
  index: number,
  paragraph: PlanTextBlock,
  newListId: string,
): PlanBlock[] {
  const at = blocks.findIndex((b) => b.id === listId);

  if (at < 0) {
    return blocks.map((b) =>
      b.type === 'group'
        ? { ...b, blocks: breakListAt(b.blocks, listId, index, paragraph, newListId) }
        : b,
    );
  }

  const list = blocks[at];
  if (list.type !== 'list' || index < 0 || index >= list.items.length) return [...blocks];

  const head = list.items.slice(0, index);
  const tail = list.items.slice(index + 1);

  const replacement: PlanBlock[] = [];
  if (head.length > 0) replacement.push({ ...list, items: head });
  replacement.push(paragraph);
  if (tail.length > 0) {
    // Dieselbe Art (Aufzaehlung, Nummern, Checkliste) und alle uebrigen
    // Felder; neu ist nur die Kennung — es sei denn, vorn blieb nichts.
    const rest: PlanListBlock = {
      ...list,
      id: head.length > 0 ? newListId : list.id,
      items: settleLevels(tail),
    };
    replacement.push(rest);
  }

  const out = [...blocks];
  out.splice(at, 1, ...replacement);
  return out;
}

/**
 * Die Einrueckung einer neuen Liste wieder gueltig machen.
 *
 * Hingen unter dem aufgebrochenen Punkt eingerueckte Punkte, beginnt die
 * hintere Liste sonst mit einem Unterpunkt ohne Oberpunkt. Es gilt dieselbe
 * Regel wie beim Tabulator: hoechstens eine Stufe tiefer als der Punkt davor,
 * der erste auf der obersten Ebene.
 */
function settleLevels(items: readonly PlanListItem[]): PlanListItem[] {
  let above = -1;
  return items.map((item) => {
    const level = Math.min(levelOf(item), above + 1);
    above = level;
    return level === levelOf(item) ? item : { ...item, level };
  });
}

/**
 * Das Gegenstueck: zwei Listen, die nach einem Rueckschritt direkt
 * aufeinanderfolgen, wieder zu einer machen.
 *
 * Steht hinter der Liste `listId` — im selben Abschnitt — eine Liste derselben
 * Art, wandern deren Punkte ans Ende, und sie selbst verschwindet. So hebt der
 * zweite Rueckschritt den ersten ganz auf: aus „Apfel / Birne / Kirsche" wird
 * nicht „ApfelBirne" plus eine zweite Liste mit „Kirsche", sondern wieder eine.
 * Sonst finge eine Nummerierung danach bei 1 neu an.
 */
export function joinFollowingList(blocks: readonly PlanBlock[], listId: string): PlanBlock[] {
  const at = blocks.findIndex((b) => b.id === listId);

  if (at < 0) {
    return blocks.map((b) =>
      b.type === 'group' ? { ...b, blocks: joinFollowingList(b.blocks, listId) } : b,
    );
  }

  const list = blocks[at];
  const next = blocks[at + 1];
  if (list.type !== 'list' || next?.type !== 'list' || next.variant !== list.variant) {
    return [...blocks];
  }

  const out = [...blocks];
  out.splice(at, 2, { ...list, items: [...list.items, ...next.items] });
  return out;
}
