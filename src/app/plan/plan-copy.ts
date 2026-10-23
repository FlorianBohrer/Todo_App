/**
 * Ein Plan als Vorlage für den nächsten: dieselben Blöcke, neue Kennungen.
 *
 * Zwei Dinge dürfen nicht mitkommen. Die Kennungen — sonst zeigten Verweise
 * und Auswahl in zwei Plänen auf „denselben" Block. Und die Verknüpfung eines
 * Eintrags mit einem echten Todo: zwei Pläne, die dasselbe Todo abhaken,
 * liefen auseinander, sobald man eines davon löscht. In der Kopie ist der
 * Eintrag wieder ein gewöhnlicher Punkt mit seinem letzten Stand.
 */
import { PlanBlock } from './plan.model';

export function copyBlocks(blocks: readonly PlanBlock[], newId: () => string): PlanBlock[] {
  return blocks.map((block): PlanBlock => {
    switch (block.type) {
      case 'group':
        return { ...block, id: newId(), blocks: copyBlocks(block.blocks, newId) };
      case 'list':
        return {
          ...block,
          id: newId(),
          items: block.items.map(({ todoId: _linked, ...item }) => ({ ...item })),
        };
      case 'table':
        return {
          ...block,
          id: newId(),
          columns: [...block.columns],
          rows: block.rows.map((row) => [...row]),
          ...(block.widths ? { widths: [...block.widths] } : {}),
        };
      default:
        return { ...block, id: newId() };
    }
  });
}

/** „Plan" → „Plan (copy)", „Plan (copy)" → „Plan (copy 2)". */
export function copyTitle(title: string, taken: readonly string[]): string {
  const base = title.replace(/\s*\(copy(?: \d+)?\)$/, '').trim() || 'Untitled plan';
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  let candidate = `${base} (copy)`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (copy ${n})`;
  return candidate;
}
