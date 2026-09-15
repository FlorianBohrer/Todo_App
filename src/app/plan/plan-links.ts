import { Plan, PlanBlock } from './plan.model';
import { wikiLinkTargets } from './inline-format';

/**
 * Auswertung des Planinhalts für Verknüpfungen und Suche.
 *
 * Liegt hier statt in der Komponente, weil Editor (Backlinks, unverlinkte
 * Erwähnungen) und Graph-Ansicht dieselbe Antwort brauchen — zwei Kopien
 * würden zwangsläufig auseinanderlaufen.
 */

/** Alle Wikilink-Ziele eines Plans, quer durch alle Blocktypen. */
export function planLinkTargets(plan: Plan): string[] {
  const targets: string[] = [];

  const walk = (blocks: PlanBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'text' || block.type === 'quote' || block.type === 'heading') {
        targets.push(...wikiLinkTargets(block.text));
      } else if (block.type === 'list') {
        for (const item of block.items) targets.push(...wikiLinkTargets(item.text));
      } else if (block.type === 'group') {
        targets.push(...wikiLinkTargets(block.title));
        walk(block.blocks);
      }
    }
  };

  walk(plan.content);
  return targets;
}

/** Sämtlicher lesbarer Text eines Plans — Grundlage für unverlinkte Treffer. */
export function planPlainText(plan: Plan): string {
  const parts: string[] = [];

  const walk = (blocks: PlanBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'text' || block.type === 'quote' || block.type === 'heading') {
        parts.push(block.text);
      } else if (block.type === 'code') {
        parts.push(block.code);
      } else if (block.type === 'list') {
        parts.push(...block.items.map((i) => i.text));
      } else if (block.type === 'table') {
        parts.push(...block.columns, ...block.rows.flat());
      } else if (block.type === 'group') {
        parts.push(block.title);
        walk(block.blocks);
      }
    }
  };

  walk(plan.content);
  return parts.join('\n');
}
