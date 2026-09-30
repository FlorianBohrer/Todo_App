/**
 * Ein Plan als Markdown-Datei.
 *
 * Der Weg nach draussen. Was hier steht, oeffnet jeder Editor — und wer die
 * App morgen nicht mehr benutzen will, nimmt seine Notizen mit. Dass das
 * ueberhaupt billig ist, liegt daran, dass der Inhalt schon Markdown IST: die
 * Bloecke halten den Text so, wie man ihn getippt hat. Uebersetzt wird nur die
 * Gliederung drumherum.
 *
 * Zwei Stellen verlieren dabei etwas, und das ist unvermeidlich:
 *
 *   Ein Toggle wird eine Ueberschrift mit seinem Inhalt darunter. Markdown
 *   kennt kein Aufklappen, und einruecken waere falsch — vier Leerzeichen
 *   machen aus Text einen Codeblock.
 *
 *   Ein Checklisten-Punkt, der zu einem echten Todo geworden ist, wird wieder
 *   ein gewoehnliches „- [ ]". Die Verbindung lebt in der App, nicht im Text.
 */
import type { Plan, PlanBlock, PlanListBlock, PlanTableBlock } from './plan.model';

/** Tiefste Ueberschrift, die Markdown kennt. */
const MAX_HEADING = 6;

function fence(code: string): string {
  // Enthaelt der Code selbst Zaunzeichen, braucht der Zaun eins mehr.
  let ticks = 3;
  for (const run of code.match(/`+/g) ?? []) {
    if (run.length >= ticks) ticks = run.length + 1;
  }
  return '`'.repeat(ticks);
}

function cell(text: string): string {
  // Ein Strich in der Zelle beendet sonst die Spalte, ein Umbruch die Zeile.
  return text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function table(block: PlanTableBlock): string {
  const head = `| ${block.columns.map(cell).join(' | ')} |`;
  const rule = `| ${block.columns.map(() => '---').join(' | ')} |`;
  const rows = block.rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...rows].join('\n');
}

function list(block: PlanListBlock): string {
  // Nummern je Ebene neu: eine Unterliste faengt wieder bei eins an.
  const counters: number[] = [];

  return block.items
    .map((item) => {
      const level = Math.max(0, item.level ?? 0);
      const pad = '  '.repeat(level);

      if (block.variant === 'todo') {
        return `${pad}- [${item.checked ? 'x' : ' '}] ${item.text}`;
      }
      if (block.variant === 'bullet') {
        return `${pad}- ${item.text}`;
      }

      counters.length = level + 1;
      counters[level] = (counters[level] ?? 0) + 1;
      return `${pad}${counters[level]}. ${item.text}`;
    })
    .join('\n');
}

function blockToMarkdown(block: PlanBlock, depth: number): string[] {
  switch (block.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(MAX_HEADING, block.level + depth))} ${block.text}`];

    case 'text':
      return [block.text];

    case 'list':
      return [list(block)];

    case 'quote':
      return [
        block.text
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n'),
      ];

    case 'code': {
      const bar = fence(block.code);
      return [`${bar}${block.language}\n${block.code}\n${bar}`];
    }

    case 'diagram': {
      const bar = fence(block.code);
      return [`${bar}mermaid\n${block.code}\n${bar}`];
    }

    case 'divider':
      return ['---'];

    case 'table':
      return [table(block)];

    case 'group': {
      // Ueberschrift statt Aufklapper, Inhalt darunter auf derselben Ebene.
      const title = `${'#'.repeat(Math.min(MAX_HEADING, depth + 2))} ${block.title}`;
      const inner = block.blocks.flatMap((child) => blockToMarkdown(child, depth + 1));
      return [title, ...inner];
    }
  }
}

/** Dateikopf im YAML-Stil — Obsidian liest ihn, jeder andere ueberliest ihn. */
function frontMatter(plan: Plan, folder: string | null): string {
  const lines = ['---', `title: ${JSON.stringify(plan.title || 'Untitled')}`];
  if (folder) lines.push(`folder: ${JSON.stringify(folder)}`);
  lines.push(`updated: ${plan.updatedAt}`, '---');
  return lines.join('\n');
}

/**
 * Eine Auswahl von Bloecken als Markdown — fuer die Zwischenablage.
 *
 * Derselbe Weg wie beim Export, nur ohne Dateikopf und Titel: was hier
 * herauskommt, wird woanders eingefuegt und braucht keine Huelle.
 */
export function blocksToMarkdown(blocks: readonly PlanBlock[]): string {
  return blocks
    .flatMap((block) => blockToMarkdown(block, 0))
    .map((part) => part.trimEnd())
    .filter((part) => part !== '')
    .join('\n\n');
}

/** Der ganze Plan als Markdown. */
export function planToMarkdown(plan: Plan, folder: string | null = null): string {
  // Leere Bloecke fallen weg: eine Datei voller Leerzeilen liest sich schlecht.
  const parts = [frontMatter(plan, folder), `# ${plan.title || 'Untitled'}`]
    .map((part) => part.trimEnd())
    .filter((part) => part !== '');

  const body = blocksToMarkdown(plan.content);
  return [...parts, ...(body ? [body] : [])].join('\n\n') + '\n';
}

/**
 * Ein Dateiname aus dem Titel.
 *
 * Bewusst streng: was ein Dateisystem oder ein ZIP-Eintrag missversteht, ist
 * hier nichts wert. Umlaute bleiben, Schraegstriche und Doppelpunkte nicht.
 */
export function fileNameFor(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');

  return `${clean || 'untitled'}.md`;
}

/**
 * Namen eindeutig machen.
 *
 * Zwei Plaene duerfen denselben Titel tragen; zwei Dateien im selben Archiv
 * nicht — die zweite ueberschriebe die erste beim Entpacken.
 */
export function uniqueNames(titles: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return titles.map((title) => {
    const name = fileNameFor(title);
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return name;
    return `${name.slice(0, -3)} (${count + 1}).md`;
  });
}
