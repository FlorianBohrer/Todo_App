/**
 * Was man über einen Plan wissen will, bevor man ihn öffnet.
 *
 * Die Karten der Übersicht sagten bisher „9 blocks" — eine Zahl, die nichts
 * darüber verrät, worum es geht oder wie weit man ist. Hier steht stattdessen,
 * womit der Plan anfängt, wann er zuletzt angefasst wurde, wie viele seiner
 * Aufgaben erledigt sind und ob Diagramme oder Tabellen darin stehen.
 *
 * Reine Funktionen, die Uhrzeit kommt von außen.
 */
import { PlanBlock } from './plan.model';

export interface PlanSummary {
  /** Die ersten Worte, ohne Formatierungszeichen; leer, wenn es keine gibt. */
  snippet: string;
  todos: { done: number; total: number };
  diagrams: number;
  tables: number;
}

const SNIPPET_LENGTH = 140;

export function planSummary(content: readonly PlanBlock[]): PlanSummary {
  const summary: PlanSummary = { snippet: '', todos: { done: 0, total: 0 }, diagrams: 0, tables: 0 };
  let heading = '';

  const visit = (blocks: readonly PlanBlock[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case 'text':
        case 'quote':
          if (!summary.snippet) summary.snippet = plain(block.text);
          break;
        case 'heading':
          heading ||= plain(block.text);
          break;
        case 'list':
          if (block.variant === 'todo') {
            summary.todos.total += block.items.length;
            summary.todos.done += block.items.filter((i) => i.checked).length;
          }
          if (!summary.snippet) summary.snippet = plain(block.items.map((i) => i.text).filter(Boolean).join(' · '));
          break;
        case 'diagram':
          summary.diagrams++;
          break;
        case 'table':
          summary.tables++;
          break;
        case 'group':
          visit(block.blocks);
          break;
      }
    }
  };
  visit(content);

  // Ohne einen einzigen Satz sagt die erste Überschrift wenigstens, worum es geht.
  summary.snippet ||= heading;
  if (summary.snippet.length > SNIPPET_LENGTH) {
    summary.snippet = `${summary.snippet.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`;
  }
  return summary;
}

/** Text ohne Markdown-Zeichen: **fett**, `code`, [[Verweis]], ~~durch~~. */
function plain(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, '$1')
    .replace(/(\*\*|__|~~|`|\*|_)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * „Edited 3 days ago" — so ungefähr, wie man es sich merkt. Je länger her,
 * desto gröber: nach einer Woche zählt das Datum, nicht die Zahl der Tage.
 */
export function editedLabel(updatedAt: string, now: Date): string {
  const then = new Date(updatedAt);
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return '';

  if (ms < MINUTE) return 'Edited just now';
  if (ms < HOUR) return `Edited ${Math.floor(ms / MINUTE)} min ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= startOfToday) return `Edited ${Math.floor(ms / HOUR)} h ago`;
  if (then.getTime() >= startOfToday - DAY) return 'Edited yesterday';

  const days = Math.ceil((startOfToday - then.getTime()) / DAY);
  if (days < 7) return `Edited ${days} days ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  const date = then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `Edited ${date}`;
}
