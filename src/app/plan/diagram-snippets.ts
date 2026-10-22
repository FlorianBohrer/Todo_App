/**
 * Schreibhilfen für den Quelltext eines Diagramms.
 *
 * Mermaid ist schnell geschrieben, wenn man die Syntax kennt — und eine
 * Suchmaschine entfernt, wenn nicht. Über dem Quelltext stehen darum die
 * Bausteine, die man für die jeweilige Art Diagramm am häufigsten braucht:
 * ein Klick setzt sie unter die Zeile, in der der Cursor steht, eingerückt
 * wie diese. Dazu Tab zum Einrücken, wie in jedem Code-Editor — vorher sprang
 * Tab aus dem Feld heraus.
 *
 * Reine Funktionen auf Text und Cursorposition.
 */
import { DiagramKind } from './diagram-theme';

export interface DiagramSnippet {
  label: string;
  /** Ohne Einrückung; die kommt von der Zeile, unter die er gesetzt wird. */
  code: string;
}

export const DIAGRAM_SNIPPETS: Readonly<Record<DiagramKind, readonly DiagramSnippet[]>> = {
  flowchart: [
    { label: 'Node', code: 'id[Label]' },
    { label: 'Arrow', code: 'a --> b' },
    { label: 'Labelled arrow', code: 'a -->|label| b' },
    { label: 'Database', code: 'db[(Database)]' },
    { label: 'Group', code: 'subgraph Name\n  a\nend' },
  ],
  sequence: [
    { label: 'Message', code: 'A->>B: request' },
    { label: 'Reply', code: 'B-->>A: response' },
    { label: 'Note', code: 'Note over A,B: note' },
    { label: 'Loop', code: 'loop Every minute\n  A->>B: ping\nend' },
    { label: 'Alternative', code: 'alt Success\n  B-->>A: ok\nelse Failure\n  B-->>A: error\nend' },
  ],
  data: [
    { label: 'Entity', code: 'ENTITY {\n  uuid id PK\n  string name\n}' },
    { label: 'One to many', code: 'A ||--o{ B : has' },
    { label: 'One to one', code: 'A ||--|| B : owns' },
  ],
  classes: [
    { label: 'Class', code: 'class Name {\n  +field string\n  +method() void\n}' },
    { label: 'Inherits', code: 'Base <|-- Child' },
    { label: 'Uses', code: 'A --> B' },
    { label: 'Implements', code: 'Interface <|.. Impl' },
  ],
  states: [
    { label: 'Start', code: '[*] --> First' },
    { label: 'Transition', code: 'A --> B: event' },
    { label: 'End', code: 'Last --> [*]' },
    { label: 'Composite', code: 'state Name {\n  [*] --> Inner\n}' },
  ],
  other: [],
};

/** Wo die Syntax jeder Art nachzulesen ist. */
export function diagramDocs(kind: DiagramKind): string {
  const page = {
    flowchart: 'flowchart',
    sequence: 'sequenceDiagram',
    data: 'entityRelationshipDiagram',
    classes: 'classDiagram',
    states: 'stateDiagram',
    other: 'examples',
  }[kind];
  return `https://mermaid.js.org/syntax/${page}.html`;
}

const INDENT = '  ';

/**
 * Setzt einen Baustein als neue Zeile(n) unter die Zeile mit dem Cursor,
 * eingerückt wie diese — bei der ersten Zeile (dem Diagrammtyp) eine Stufe
 * tiefer. Der Cursor steht danach am Ende des Eingefügten.
 */
export function insertSnippet(code: string, caret: number, snippet: string): { code: string; caret: number } {
  const at = Math.max(0, Math.min(caret, code.length));
  const lineStart = code.lastIndexOf('\n', at - 1) + 1;
  const lineEndIndex = code.indexOf('\n', at);
  const lineEnd = lineEndIndex === -1 ? code.length : lineEndIndex;
  const line = code.slice(lineStart, lineEnd);

  let indent = /^\s*/.exec(line)?.[0] ?? '';
  // Unter der Kopfzeile („flowchart TB") und unter einem Block-Anfang
  // („subgraph", „loop", „{") eine Stufe tiefer.
  if (lineStart === 0 || /(\{|^\s*(subgraph|loop|alt|else|opt|par|rect|state .*\{).*)$/.test(line)) indent += INDENT;
  // Ein leerer Quelltext: der Baustein ist die erste Zeile.
  if (!code.trim()) indent = '';

  const block = snippet
    .split('\n')
    .map((l) => indent + l)
    .join('\n');
  const before = code.slice(0, lineEnd);
  const after = code.slice(lineEnd);
  const glue = before.length ? '\n' : '';

  return { code: before + glue + block + after, caret: before.length + glue.length + block.length };
}

/**
 * Tab im Quelltext: ohne Auswahl zwei Leerzeichen an den Cursor; mit Auswahl
 * jede berührte Zeile eine Stufe ein- oder (mit Umschalt) ausrücken.
 */
export function indentLines(
  code: string,
  start: number,
  end: number,
  outdent: boolean,
): { code: string; start: number; end: number } {
  if (start === end && !outdent) {
    return { code: code.slice(0, start) + INDENT + code.slice(end), start: start + 2, end: start + 2 };
  }

  const first = code.lastIndexOf('\n', start - 1) + 1;
  const lastBreak = code.indexOf('\n', end > start && code[end - 1] === '\n' ? end - 1 : end);
  const last = lastBreak === -1 ? code.length : lastBreak;
  const lines = code.slice(first, last).split('\n');

  let shiftFirst = 0;
  let shiftTotal = 0;
  const changed = lines.map((line, i) => {
    if (outdent) {
      const remove = line.startsWith(INDENT) ? 2 : line.startsWith(' ') ? 1 : 0;
      if (i === 0) shiftFirst = -remove;
      shiftTotal -= remove;
      return line.slice(remove);
    }
    if (i === 0) shiftFirst = INDENT.length;
    shiftTotal += INDENT.length;
    return INDENT + line;
  });

  return {
    code: code.slice(0, first) + changed.join('\n') + code.slice(last),
    start: Math.max(first, start + shiftFirst),
    end: Math.max(first, end + shiftTotal),
  };
}
