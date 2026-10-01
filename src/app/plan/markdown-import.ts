/**
 * Markdown als Plan einlesen — der Weg zurueck.
 *
 * Der Export ist billig, weil der Inhalt schon Markdown IST. Der Import ist
 * es nicht: aus Zeilen muessen wieder Bloecke werden, und zwar aus Zeilen, die
 * irgendein anderes Programm geschrieben hat. Deshalb liest das hier mehr, als
 * der Export je schreibt — vier Leerzeichen Einrueckung genauso wie zwei,
 * `*` und `+` als Aufzaehlungszeichen, Ueberschriften auch unterstrichen
 * (Setext), Tabellen mit und ohne fuehrenden Strich.
 *
 * Was nicht zurueckkommt, kann nicht zurueckkommen: ein Toggle war im Export
 * eine Ueberschrift, und eine Ueberschrift bleibt es. Dasselbe gilt fuer die
 * Verknuepfung eines Checklisten-Punktes mit einem echten Todo — die lebt in
 * der Datenbank, nicht im Text.
 *
 * Alles, was sich nicht einordnen laesst, wird ein Absatz. Ein Import, der
 * lieber nichts anlegt als das Falsche, waere hier der schlechtere: der Text
 * ist da, und er soll ankommen.
 *
 * Derselbe Leser bedient auch das Einfuegen aus der Zwischenablage, ueber
 * markdownToBlocks weiter unten: ein Ausschnitt statt einer Datei, also ohne
 * Dateikopf und ohne Titel. Dafuer gab es frueher einen zweiten, schwaecheren
 * Leser — und darum wurde eine eingefuegte Tabelle eine Reihe von Absaetzen
 * voller Striche.
 */
import type { PlanBlock, PlanListItem } from './plan.model';

// Die abschliessenden Rauten sind nur welche, wenn ein Leerzeichen davor
// steht — „## C#" ist eine Ueberschrift ueber C#, nicht ueber C.
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/;
const RULE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const SETEXT = /^ {0,3}(=+|-+)\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TODO = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
/** Eine Zelle der Trennzeile: Striche, hoechstens mit Doppelpunkt. */
const TABLE_DASHES = /^:?-+:?$/;

type Variant = 'bullet' | 'number' | 'todo';

export interface ImportedPlan {
  title: string;
  /** Der Ordnername aus dem Dateikopf — zugeordnet wird er draussen. */
  folder: string | null;
  content: PlanBlock[];
}

/**
 * Eine Tabellenzeile in Zellen.
 *
 * Der Export maskiert den Strich und ersetzt den Umbruch; beides wird hier
 * wieder aufgehoben, sonst stuende „\|" als Text in der Zelle.
 */
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\' && inner[i + 1] === '|') {
      current += '|';
      i++;
    } else if (inner[i] === '|') {
      out.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  out.push(current);

  return out.map((cell) => cell.trim().replace(/<br\s*\/?>/gi, '\n'));
}

/**
 * Ist das der Kopf einer Tabelle? Dann wie viele Spalten hat sie.
 *
 * Die aeusseren Striche duerfen fehlen — so schreiben es viele Editoren.
 * Genau das macht die Erkennung heikel: „Zwischentitel" ueber „---" ist eine
 * unterstrichene Ueberschrift, keine Tabelle. Unterschieden wird an der
 * Spaltenzahl, denn eine Tabelle ohne Rand braucht in beiden Zeilen gleich
 * viele Zellen, und ein Unterstrich hat gar keine.
 */
function tableWidth(header: string, rule: string): number {
  if (!header.includes('|')) return 0;

  const columns = cells(header);
  const bordered = /^\s*\|/.test(header);
  if (columns.length < (bordered ? 1 : 2)) return 0;

  const parts = cells(rule);
  if (parts.length !== columns.length || !parts.every((part) => TABLE_DASHES.test(part))) return 0;

  return columns.length;
}

/**
 * Der Dateikopf im YAML-Stil, so weit er hier gebraucht wird.
 *
 * Kein YAML-Leser: gelesen werden „schluessel: wert" der obersten Ebene, und
 * das ist genau das, was der Export schreibt. Alles andere wird uebergangen,
 * statt den Import an einer Verschachtelung scheitern zu lassen.
 */
function frontMatter(lines: string[]): { data: Map<string, string>; from: number } {
  const data = new Map<string, string>();
  if (lines[0]?.trim() !== '---') return { data, from: 0 };

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { data, from: i + 1 };
    }
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;

    const raw = match[2].trim();
    let value = raw;
    if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw) as string;
      } catch {
        value = raw.slice(1).replace(/"$/, '');
      }
    } else if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) {
      value = raw.slice(1, -1);
    }
    data.set(match[1].toLowerCase(), value);
  }

  // Kein schliessender Strich: dann war es keiner.
  return { data: new Map(), from: 0 };
}

/**
 * Die Einrücktiefe als Stufe.
 *
 * Gezaehlt werden nicht Leerzeichen, sondern Spruenge: wer mit vier
 * Leerzeichen einrueckt, meint dieselbe eine Stufe wie der, der zwei nimmt.
 */
class Levels {
  private readonly stack: number[] = [];

  reset(): void {
    this.stack.length = 0;
  }

  of(indent: number): number {
    while (this.stack.length && indent < this.stack[this.stack.length - 1]) this.stack.pop();
    if (!this.stack.length || indent > this.stack[this.stack.length - 1]) this.stack.push(indent);
    return this.stack.length - 1;
  }
}

/** Was eine Zeile als Listenpunkt hergibt. */
function listItem(line: string): { variant: Variant; indent: number; item: PlanListItem } | null {
  const todo = TODO.exec(line);
  if (todo) {
    return {
      variant: 'todo',
      indent: todo[1].length,
      item: { text: todo[3].trim(), checked: todo[2].toLowerCase() === 'x' },
    };
  }

  const bullet = BULLET.exec(line);
  if (bullet && !RULE.test(line)) {
    return {
      variant: 'bullet',
      indent: bullet[1].length,
      item: { text: bullet[2].trim(), checked: false },
    };
  }

  const numbered = NUMBERED.exec(line);
  if (numbered) {
    return {
      variant: 'number',
      indent: numbered[1].length,
      item: { text: numbered[2].trim(), checked: false },
    };
  }

  return null;
}

/** Markdown in Bloecke. Der Dateikopf bleibt aussen vor. */
function parseBlocks(lines: string[], from: number, newId: () => string): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  const levels = new Levels();

  // Absaetze sammeln sich, bis etwas anderes kommt: erst dann steht fest, ob
  // es ein Absatz war oder die Zeile ueber einem Unterstrich eine Ueberschrift.
  let paragraph: string[] = [];

  const flush = () => {
    const text = paragraph.join('\n').trim();
    paragraph = [];
    if (text) blocks.push({ id: newId(), type: 'text', text });
  };

  for (let i = from; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      continue;
    }

    // Unterstrichene Ueberschrift: gilt nur direkt unter einer Zeile Text.
    const setext = SETEXT.exec(line);
    if (setext && paragraph.length) {
      const text = paragraph.join('\n').trim();
      paragraph = [];
      blocks.push({ id: newId(), type: 'heading', level: setext[1][0] === '=' ? 1 : 2, text });
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const bar = fence[1][0];
      const width = fence[1].length;
      const language = fence[2].trim();
      const code: string[] = [];

      let end = i + 1;
      for (; end < lines.length; end++) {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[end]);
        if (close && close[1][0] === bar && close[1].length >= width) break;
        code.push(lines[end]);
      }
      i = end; // die schliessende Zeile ueberspringen

      // Mermaid ist kein Code, sondern ein Bild, das noch gezeichnet wird.
      if (language.toLowerCase() === 'mermaid') {
        blocks.push({ id: newId(), type: 'diagram', code: code.join('\n') });
      } else {
        blocks.push({ id: newId(), type: 'code', language, code: code.join('\n') });
      }
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ id: newId(), type: 'heading', level, text: heading[2].trim() });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ id: newId(), type: 'divider' });
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const text: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        text.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      i--;
      blocks.push({ id: newId(), type: 'quote', text: text.join('\n').trim() });
      continue;
    }

    // Tabelle: eine Zeile mit Strichen, darunter die Trennzeile. Ohne die
    // Trennzeile ist es keine Tabelle, sondern Text, in dem Striche stehen.
    if (tableWidth(line, lines[i + 1] ?? '')) {
      flush();
      const columns = cells(line);
      const rows: string[][] = [];

      let at = i + 2;
      for (; at < lines.length && lines[at].includes('|'); at++) {
        const row = cells(lines[at]);
        // Kurze Zeilen auffuellen, lange abschneiden: die Tabelle im Editor
        // ist rechteckig, und eine Zelle zu viel haette keine Spalte.
        rows.push(columns.map((_, c) => row[c] ?? ''));
      }
      i = at - 1;

      blocks.push({ id: newId(), type: 'table', columns, rows });
      continue;
    }

    const first = listItem(line);
    if (first) {
      flush();
      levels.reset();
      const items: PlanListItem[] = [];
      const variant = first.variant;

      let at = i;
      for (; at < lines.length; at++) {
        if (!lines[at].trim()) {
          // Eine Leerzeile beendet die Liste nur, wenn danach keine mehr kommt.
          let next = at + 1;
          while (next < lines.length && !lines[next].trim()) next++;
          if (listItem(lines[next] ?? '')?.variant !== variant) break;
          at = next - 1;
          continue;
        }

        const parsed = listItem(lines[at]);
        if (!parsed || parsed.variant !== variant) break;

        const level = levels.of(parsed.indent);
        items.push(level > 0 ? { ...parsed.item, level } : parsed.item);
      }
      i = at - 1;

      blocks.push({ id: newId(), type: 'list', variant, items });
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}

/**
 * Ein Stueck Markdown als Bloecke — ohne Dateikopf, ohne Titel.
 *
 * Das ist der Weg fuer das Einfuegen aus der Zwischenablage: dort kommt ein
 * Ausschnitt an und keine Datei. Vorher hatte das Einfuegen einen eigenen,
 * zweiten Leser (markdown-paste.ts), der weniger konnte — er kannte weder
 * Tabellen noch Diagramme noch Einrueckung. Eine Tabelle, die man
 * hineinkopierte, wurde eine Reihe von Absaetzen voller Striche.
 */
export function markdownToBlocks(
  source: string,
  newId: () => string = () => crypto.randomUUID(),
): PlanBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'), 0, newId);
}

/**
 * Eine Markdown-Datei als Plan.
 *
 * Der Titel steht im Dateikopf, sonst in der ersten Ueberschrift, sonst im
 * Dateinamen. Steht er im Kopf UND als Ueberschrift darunter — so schreibt es
 * der Export —, faellt die Ueberschrift weg: sonst stuende der Titel zweimal.
 */
export function markdownToPlan(
  source: string,
  fallbackTitle: string,
  newId: () => string = () => crypto.randomUUID(),
): ImportedPlan {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const { data, from } = frontMatter(lines);
  const content = parseBlocks(lines, from, newId);

  let title = data.get('title')?.trim() ?? '';
  const head = content[0];

  if (head?.type === 'heading' && head.level === 1) {
    if (!title) {
      title = head.text.trim();
      content.shift();
    } else if (head.text.trim() === title) {
      content.shift();
    }
  }

  return {
    title: title || fallbackTitle.trim() || 'Untitled',
    folder: data.get('folder')?.trim() || null,
    content,
  };
}

/** „Architektur 2026.md" → „Architektur 2026". */
export function titleFromFileName(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/\.(md|markdown|txt)$/i, '').trim();
}
