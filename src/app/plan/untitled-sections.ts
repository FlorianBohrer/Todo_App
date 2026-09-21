/**
 * Absätze finden, die in der Outline fehlen.
 *
 * Die Navigation rechts listet Überschriften und Toggle-Titel. Was davor oder
 * ganz ohne Überschrift steht, taucht dort nicht auf — man kann es nicht
 * anspringen und sieht beim Überfliegen nicht, dass es existiert.
 *
 * Als „ohne Überschrift" zählt ein Block genau dann, wenn in seinem Container
 * vor ihm keine Überschrift steht. Alles NACH einer Überschrift gehört zu
 * deren Abschnitt und ist damit bereits vertreten — dafür einen zweiten Titel
 * vorzuschlagen würde die Outline verdoppeln statt sie zu vervollständigen.
 */
import { PlanBlock } from './plan.model';

export interface UntitledSection {
  /** Block-ID — Sprungziel und Schlüssel für den Vorschlag. */
  id: string;
  /** Der Text, der dem Modell vorgelegt wird. */
  text: string;
}

/**
 * Kürzere Absätze bekommen keinen Vorschlag. Ein Zweizeiler braucht keine
 * Lasche, und ein Titel dafür wäre länger als der Inhalt.
 */
export const MIN_SECTION_CHARS = 80;

/** Der lesbare Text eines Blocks; '' für alles, was sich nicht betiteln lässt. */
function blockText(block: PlanBlock): string {
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

export function findUntitledSections(blocks: PlanBlock[]): UntitledSection[] {
  const found: UntitledSection[] = [];

  const walk = (list: PlanBlock[], coveredByTitle: boolean) => {
    let headingSeen = coveredByTitle;

    for (const block of list) {
      if (block.type === 'heading') {
        if (block.text.trim()) headingSeen = true;
        continue;
      }

      if (block.type === 'group') {
        // Ein Toggle mit Titel deckt seinen Inhalt ab, ein namenloser nicht.
        walk(block.blocks, block.title.trim().length > 0);
        if (block.title.trim()) headingSeen = true;
        continue;
      }

      if (headingSeen) continue;

      const text = blockText(block);
      if (text.length >= MIN_SECTION_CHARS) {
        found.push({ id: block.id, text });
      }
    }
  };

  walk(blocks, false);
  return found;
}

/**
 * Stabiler Schlüssel über den Inhalt. Solange der Absatz unverändert ist,
 * wird kein zweites Mal gefragt — Vorschläge kosten Geld und Wartezeit.
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
