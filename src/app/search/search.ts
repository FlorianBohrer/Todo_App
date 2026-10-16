/**
 * Die Suche über alles: Todos — auch erledigte und archivierte, aus jedem
 * Ordner —, Pläne samt ihrem Inhalt, und Ordner.
 *
 * Die Suche über der Liste bleibt, was sie ist: ein Filter für das, was man
 * gerade vor sich hat. Diese hier beantwortet die andere Frage: „wo war das
 * noch?" — und springt hin.
 *
 * Rein, ohne Angular und ohne DOM. Die Palette zeigt nur an, was hier
 * entschieden wird.
 */
import type { Plan, PlanBlock } from '../plan/plan.model';
import type { Todo } from '../todo/model/todo.model';
import type { Label } from '../todo/services/label.service';
import { TitleToken, splitTitle } from '../todo/shared/title-token';

// ---------------------------------------------------------------------------
// Vergleichen
// ---------------------------------------------------------------------------

/** Eine Form, entlang der Akzente und Groß-/Kleinschreibung keine Rolle spielen. */
const MARKS = /\p{M}/gu;

/**
 * Kleinschreibung ohne Akzente: „uber" findet „Über", „cafe" findet „Café".
 *
 * Mit einer Zuordnung zurück auf das Original, Zeichen für Zeichen — sonst
 * ließe sich ein Treffer in „Café" nicht markieren: die zerlegte Form ist
 * länger als das Wort, das man sieht.
 */
function fold(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const part = text[i].normalize('NFD').replace(MARKS, '').toLowerCase();
    for (let k = 0; k < part.length; k++) origin.push(i);
    folded += part;
  }
  return { folded, origin };
}

export function normalize(text: string): string {
  return fold(text).folded;
}

/** Zeichen, nach denen ein Wort anfängt. */
const WORD_START = /[\s\-_/.,:;!?()[\]"'„“»«]/;

/**
 * Wie gut ein Text zu allen Begriffen passt; null, wenn einer fehlt.
 *
 * Alle Begriffe müssen vorkommen, in beliebiger Reihenfolge — „bank call"
 * findet „Call the bank". Am Textanfang zählt ein Treffer am meisten, am
 * Wortanfang mehr als mitten im Wort.
 */
export function score(text: string, terms: readonly string[]): number | null {
  if (terms.length === 0) return 0;
  const folded = normalize(text);

  let total = 0;
  for (const term of terms) {
    const at = folded.indexOf(term);
    if (at === -1) return null;
    total += at === 0 ? 3 : WORD_START.test(folded[at - 1]) ? 2 : 1;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Anfrage
// ---------------------------------------------------------------------------

export interface Query {
  /** Ein vorn getipptes Präfix, als Filter: „/must " zeigt nur Must-haves. */
  token: TitleToken | null;
  terms: string[];
}

export function parseQuery(raw: string): Query {
  const { token, text } = splitTitle(raw.trimStart());
  return { token, terms: normalize(text).split(/\s+/).filter((t) => t.length > 0) };
}

export function isEmptyQuery(query: Query): boolean {
  return query.token === null && query.terms.length === 0;
}

// ---------------------------------------------------------------------------
// Markieren
// ---------------------------------------------------------------------------

export interface Segment {
  text: string;
  match: boolean;
}

/**
 * Der Text in Stücken, die Treffer markiert.
 *
 * Als Stücke und nicht als HTML: die Palette setzt sie als Text, und ein
 * Todo, das „<b>" heißt, bleibt „<b>".
 */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  if (text.length === 0) return [];
  if (terms.length === 0) return [{ text, match: false }];

  const { folded, origin } = fold(text);
  const hit = new Array<boolean>(text.length).fill(false);

  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      const start = origin[at];
      const end = origin[at + term.length - 1];
      for (let i = start; i <= end; i++) hit[i] = true;
      from = at + term.length;
    }
  }

  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === hit[i]) last.text += text[i];
    else segments.push({ text: text[i], match: hit[i] });
  }
  return segments;
}

/**
 * Ein Ausschnitt um den ersten Treffer — für Pläne, deren Treffer irgendwo
 * im dritten Absatz steht. Der ganze Absatz wäre zu lang, der Anfang des
 * Plans das Falsche.
 *
 * Wenig davor, mehr danach: die Zeile wird hinten abgeschnitten, wenn sie
 * nicht passt, und auf dem Telefon passen keine fünfzig Zeichen. Stünde der
 * Treffer in der Mitte, fiele er dort genau weg.
 */
export function snippet(text: string, terms: readonly string[], before = 24, after = 72): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (terms.length === 0) return flat.slice(0, before + after);

  const { folded, origin } = fold(flat);
  const at = folded.indexOf(terms[0]);
  if (at === -1) return flat.slice(0, before + after);

  const center = origin[at];
  const start = Math.max(0, center - before);
  const end = Math.min(flat.length, center + after);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

export interface TodoHit {
  kind: 'todo';
  todo: Todo;
  token: TitleToken | null;
  /** Erste Zeile, ohne Präfix — so, wie sie in der Liste steht. */
  title: string;
  score: number;
}

/** Offen vor erledigt vor archiviert: gesucht wird meist, was noch ansteht. */
function todoRank(todo: Todo): number {
  if (todo.archivedAt !== null) return 2;
  return todo.completed ? 1 : 0;
}

export function searchTodos(todos: readonly Todo[], query: Query): TodoHit[] {
  const hits: Array<TodoHit & { index: number }> = [];

  todos.forEach((todo, index) => {
    const { token, text } = splitTitle(todo.title);
    if (query.token !== null && token !== query.token) return;

    const title = text.split('\n')[0].trim();
    const inText = score(text, query.terms);
    if (inText === null) return;

    // Treffer in der ersten Zeile wiegen mehr als in den Notizen darunter.
    const inTitle = score(title, query.terms);
    hits.push({
      kind: 'todo',
      todo,
      token,
      title,
      score: inText + (inTitle !== null && query.terms.length > 0 ? 2 : 0),
      index,
    });
  });

  return hits
    .sort(
      (a, b) =>
        todoRank(a.todo) - todoRank(b.todo) || b.score - a.score || a.index - b.index,
    )
    .map(({ index: _index, ...hit }) => hit);
}

// ---------------------------------------------------------------------------
// Pläne
// ---------------------------------------------------------------------------

export interface PlanHit {
  kind: 'plan';
  plan: Plan;
  /** Wo der Treffer im Inhalt steht — null, wenn schon der Titel passt. */
  snippet: string | null;
  score: number;
}

/** Markdown-Auszeichnung weg: gesucht wird, was man liest, nicht was gespeichert ist. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => alias ?? target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`|\*)/g, '');
}

/** Aller Text eines Plans, Block für Block, in Lesereihenfolge. */
export function blockTexts(blocks: readonly PlanBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
      case 'heading':
      case 'quote':
        out.push(plainText(block.text));
        break;
      case 'list':
        for (const item of block.items) out.push(plainText(item.text));
        break;
      case 'table':
        out.push(block.columns.map(plainText).join(' · '));
        for (const row of block.rows) out.push(row.map(plainText).join(' · '));
        break;
      case 'code':
        out.push(block.code);
        break;
      case 'group':
        out.push(plainText(block.title));
        out.push(...blockTexts(block.blocks));
        break;
      // Diagramme sind Quelltext für eine Grafik, Trennlinien sind nichts.
      case 'diagram':
      case 'divider':
        break;
    }
  }
  return out.filter((text) => text.trim().length > 0);
}

export function searchPlans(plans: readonly Plan[], query: Query): PlanHit[] {
  // Ein Präfix filtert Todos; Pläne haben keins.
  if (query.token !== null) return [];

  const hits: PlanHit[] = [];
  for (const plan of plans) {
    const inTitle = score(plan.title, query.terms);
    if (inTitle !== null) {
      hits.push({ kind: 'plan', plan, snippet: null, score: inTitle + 4 });
      continue;
    }

    // Im Inhalt: ein Block, in dem alle Begriffe stehen. Über Blockgrenzen
    // hinweg zu suchen fände „Bozen" im einen und „Zug" im anderen Absatz,
    // und der Ausschnitt könnte keinen der beiden zeigen.
    for (const text of blockTexts(plan.content)) {
      const inBlock = score(text, query.terms);
      if (inBlock === null) continue;
      hits.push({ kind: 'plan', plan, snippet: snippet(text, query.terms), score: inBlock });
      break;
    }
  }

  return hits.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Ordner
// ---------------------------------------------------------------------------

export interface FolderHit {
  kind: 'folder';
  label: Label;
  score: number;
}

export function searchFolders(labels: readonly Label[], query: Query): FolderHit[] {
  if (query.token !== null || query.terms.length === 0) return [];

  const hits: FolderHit[] = [];
  for (const label of labels) {
    const s = score(label.name, query.terms);
    if (s !== null) hits.push({ kind: 'folder', label, score: s });
  }
  return hits.sort((a, b) => b.score - a.score);
}
