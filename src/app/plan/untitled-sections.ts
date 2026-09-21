/**
 * Absätze finden, über denen keine Überschrift steht.
 *
 * Die Regel ist bewusst eng: es zählt das UNMITTELBAR vorherige Element. Steht
 * dort keine Überschrift, gilt der Absatz als unbetitelt — auch dann, wenn
 * weiter oben im Dokument eine steht. Damit bekommt jeder Absatz seine eigene
 * Überschrift, außer er folgt direkt auf eine.
 *
 * (Eine frühere Fassung prüfte „irgendwo davor im Container". Das ließ jeden
 * Absatz ab dem zweiten unter einer Überschrift unbeachtet.)
 */
import { PlanBlock } from './plan.model';

export interface UntitledSection {
  /** Block-ID — Sprungziel und Schlüssel für die Überschrift. */
  id: string;
  /** Der Text, der dem Modell vorgelegt wird. */
  text: string;
}

/**
 * Kürzere Absätze bekommen keine Überschrift. Ein Zweizeiler braucht keine,
 * und der Titel wäre länger als der Inhalt.
 */
export const MIN_SECTION_CHARS = 80;

/** Der lesbare Text eines Blocks; '' für alles, was sich nicht betiteln lässt. */
export function blockText(block: PlanBlock): string {
  switch (block.type) {
    case 'text':
    case 'quote':
      return block.text.trim();
    case 'list':
      return block.items.map((item) => item.text).join('\n').trim();
    default:
      // Code trägt seine Sprache, Tabellen ihre Spalten, Diagramme ihren
      // Quelltext — und Trennlinien gar nichts.
      return '';
  }
}

/** Trägt dieses Element eine Überschrift, deckt es also den Block darunter ab? */
function isHeadingLike(block: PlanBlock | undefined): boolean {
  if (!block) return false;
  if (block.type === 'heading') return block.text.trim().length > 0;
  // Ein Toggle mit Titel leistet dasselbe wie eine Überschrift.
  if (block.type === 'group') return block.title.trim().length > 0;
  return false;
}

/**
 * Braucht genau dieser Block eine Überschrift? Prüft seinen Vorgänger in der
 * übergebenen Liste — für den Fall, dass ein einzelner Block geprüft wird,
 * ohne das ganze Dokument zu durchlaufen.
 */
export function needsHeading(blocks: PlanBlock[], blockId: string): boolean {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index === -1) {
    // Verschachtelt: in den Toggles weitersuchen.
    for (const block of blocks) {
      if (block.type === 'group' && needsHeading(block.blocks, blockId)) return true;
    }
    return false;
  }

  if (isHeadingLike(blocks[index - 1])) return false;
  return blockText(blocks[index]).length >= MIN_SECTION_CHARS;
}

export function findUntitledSections(blocks: PlanBlock[]): UntitledSection[] {
  const found: UntitledSection[] = [];

  const walk = (list: PlanBlock[]) => {
    list.forEach((block, index) => {
      if (block.type === 'group') {
        walk(block.blocks);
        return;
      }
      if (isHeadingLike(list[index - 1])) return;

      const text = blockText(block);
      if (text.length >= MIN_SECTION_CHARS) {
        found.push({ id: block.id, text });
      }
    });
  };

  walk(blocks);
  return found;
}

/**
 * Stabiler Schlüssel über den Inhalt. Solange der Absatz unverändert ist,
 * wird kein zweites Mal gefragt — Anfragen kosten Geld und Wartezeit.
 * FNV-1a: kurz, schnell, und für einen Cache-Schlüssel völlig ausreichend.
 */
export function contentKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
