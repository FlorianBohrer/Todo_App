import { describe, expect, it } from 'vitest';

import { DIAGRAM_SNIPPETS, diagramDocs, indentLines, insertSnippet } from './diagram-snippets';

describe('insertSnippet', () => {
  const code = 'flowchart TB\n  a --> b\n  b --> c';

  it('puts the snippet on a new line under the caret, indented like that line', () => {
    const caret = code.indexOf('b\n') + 1; // Ende der zweiten Zeile
    const result = insertSnippet(code, caret, 'x[New]');

    expect(result.code).toBe('flowchart TB\n  a --> b\n  x[New]\n  b --> c');
    expect(result.code.slice(0, result.caret).endsWith('x[New]')).toBe(true);
  });

  it('indents one level below the header line and below a block opener', () => {
    expect(insertSnippet('flowchart TB', 3, 'a --> b').code).toBe('flowchart TB\n  a --> b');
    expect(insertSnippet('sequenceDiagram\n  loop Poll', 25, 'A->>B: hi').code)
      .toBe('sequenceDiagram\n  loop Poll\n    A->>B: hi');
  });

  it('indents every line of a multi-line snippet', () => {
    const result = insertSnippet('flowchart TB', 0, 'subgraph Name\n  a\nend');
    expect(result.code).toBe('flowchart TB\n  subgraph Name\n    a\n  end');
  });

  it('starts an empty source with the snippet itself', () => {
    expect(insertSnippet('', 0, 'A --> B').code).toBe('A --> B');
  });
});

describe('indentLines', () => {
  it('inserts two spaces at the caret without a selection', () => {
    expect(indentLines('ab', 1, 1, false)).toEqual({ code: 'a  b', start: 3, end: 3 });
  });

  it('indents and outdents every selected line', () => {
    const code = 'x\na\nb\ny';
    const indented = indentLines(code, 2, 5, false); // „a\nb" markiert
    expect(indented.code).toBe('x\n  a\n  b\ny');

    const back = indentLines(indented.code, indented.start, indented.end, true);
    expect(back.code).toBe(code);
  });

  it('outdents the caret line with Shift+Tab', () => {
    expect(indentLines('  a --> b', 5, 5, true).code).toBe('a --> b');
  });
});

describe('snippets', () => {
  it('offer the common building blocks for every architecture diagram', () => {
    for (const kind of ['flowchart', 'sequence', 'data', 'classes', 'states'] as const) {
      expect(DIAGRAM_SNIPPETS[kind].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('link to the syntax page of the kind', () => {
    expect(diagramDocs('sequence')).toBe('https://mermaid.js.org/syntax/sequenceDiagram.html');
  });
});
