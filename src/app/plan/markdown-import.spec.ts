import { markdownToBlocks, markdownToPlan, titleFromFileName } from './markdown-import';
import { planToMarkdown } from './plan-markdown';
import type { Plan, PlanBlock } from './plan.model';

/** Zaehlende Ids: im Test soll man sehen, was gemeint ist. */
function ids() {
  let n = 0;
  return () => `b${++n}`;
}

function parse(md: string, name = 'Datei') {
  return markdownToPlan(md, name, ids());
}

describe('markdownToPlan', () => {
  it('reads the kinds of block that markdown knows', () => {
    const { content } = parse(
      ['## Aufbau', '', 'Ein Absatz mit **fett**.', '', '> Zwei', '> Zeilen', '', '---'].join('\n'),
    );

    expect(content).toEqual([
      { id: 'b1', type: 'heading', level: 2, text: 'Aufbau' },
      { id: 'b2', type: 'text', text: 'Ein Absatz mit **fett**.' },
      { id: 'b3', type: 'quote', text: 'Zwei\nZeilen' },
      { id: 'b4', type: 'divider' },
    ]);
  });

  it('keeps a paragraph together and splits it at the empty line', () => {
    const { content } = parse('Erste Zeile\nnoch dieselbe\n\nNeuer Absatz');

    expect(content).toEqual([
      { id: 'b1', type: 'text', text: 'Erste Zeile\nnoch dieselbe' },
      { id: 'b2', type: 'text', text: 'Neuer Absatz' },
    ]);
  });

  it('counts indentation in steps, not in spaces', () => {
    // Vier Leerzeichen meinen dieselbe eine Stufe wie zwei.
    const { content } = parse(['- eins', '    - darunter', '- zwei'].join('\n'));

    expect(content).toEqual([
      {
        id: 'b1',
        type: 'list',
        variant: 'bullet',
        items: [
          { text: 'eins', checked: false },
          { text: 'darunter', checked: false, level: 1 },
          { text: 'zwei', checked: false },
        ],
      },
    ]);
  });

  it('reads a checklist and its ticks', () => {
    const { content } = parse(['- [ ] offen', '- [x] fertig', '* [X] auch fertig'].join('\n'));

    expect(content).toEqual([
      {
        id: 'b1',
        type: 'list',
        variant: 'todo',
        items: [
          { text: 'offen', checked: false },
          { text: 'fertig', checked: true },
          { text: 'auch fertig', checked: true },
        ],
      },
    ]);
  });

  it('starts a new block when the kind of list changes', () => {
    const { content } = parse(['- Punkt', '1. Schritt'].join('\n'));

    expect(content.map((b) => b.type === 'list' && b.variant)).toEqual(['bullet', 'number']);
  });

  it('holds a list together across a blank line', () => {
    // „Lose" Liste: zwischen den Punkten steht eine Leerzeile.
    const { content } = parse(['- eins', '', '- zwei'].join('\n'));

    expect(content).toHaveLength(1);
    expect(content[0].type === 'list' && content[0].items).toHaveLength(2);
  });

  it('separates a fence from a diagram', () => {
    const { content } = parse(
      ['```ts', 'const a = 1;', '```', '', '```mermaid', 'flowchart TD', '```'].join('\n'),
    );

    expect(content).toEqual([
      { id: 'b1', type: 'code', language: 'ts', code: 'const a = 1;' },
      { id: 'b2', type: 'diagram', code: 'flowchart TD' },
    ]);
  });

  it('keeps backticks that stand inside a wider fence', () => {
    const { content } = parse(['````', 'Zaun ``` im Code', '````'].join('\n'));

    expect(content).toEqual([{ id: 'b1', type: 'code', language: '', code: 'Zaun ``` im Code' }]);
  });

  it('reads a table and undoes what the export escaped', () => {
    const { content } = parse(
      [
        '| Was | Warum |',
        '| --- | --- |',
        '| MQTT | Strich \\| drin |',
        '| HTTP | Zwei<br>Zeilen |',
      ].join('\n'),
    );

    expect(content).toEqual([
      {
        id: 'b1',
        type: 'table',
        columns: ['Was', 'Warum'],
        rows: [
          ['MQTT', 'Strich | drin'],
          ['HTTP', 'Zwei\nZeilen'],
        ],
      },
    ]);
  });

  it('squares off a table with ragged rows', () => {
    const { content } = parse(['| A | B |', '| - | - |', '| nur eins |'].join('\n'));

    expect(content[0].type === 'table' && content[0].rows).toEqual([['nur eins', '']]);
  });

  it('reads a table that has no outer pipes', () => {
    // So schreiben viele Editoren sie; der eigene Export tut es nicht.
    const { content } = parse(['Was | Warum', '--- | ---', 'A | B'].join('\n'));

    expect(content).toEqual([
      { id: 'b1', type: 'table', columns: ['Was', 'Warum'], rows: [['A', 'B']] },
    ]);
  });

  it('is not fooled by a line that merely contains pipes', () => {
    expect(parse('a | b | c').content).toEqual([{ id: 'b1', type: 'text', text: 'a | b | c' }]);
    // Ohne passende Spaltenzahl bleibt der Unterstrich eine Ueberschrift.
    expect(parse('Titel | mit Strich\n---').content[0]).toEqual({
      id: 'b1',
      type: 'heading',
      level: 2,
      text: 'Titel | mit Strich',
    });
  });

  it('reads an underlined heading, but a bare rule stays a divider', () => {
    // „===" ist die erste Ebene — ganz oben ist das der Titel und steht
    // deshalb nicht noch einmal im Inhalt.
    expect(parse('Titel\n=====\n\nText').title).toBe('Titel');
    expect(parse('Zwischentitel\n---').content[0]).toEqual({
      id: 'b1',
      type: 'heading',
      level: 2,
      text: 'Zwischentitel',
    });
    expect(parse('Text\n\n---').content[1]).toEqual({ id: 'b2', type: 'divider' });
  });

  it('does not read a sharp as a closing hash', () => {
    expect(parse('## C#').content[0]).toEqual({ id: 'b1', type: 'heading', level: 2, text: 'C#' });
    expect(parse('## Fertig ##').content[0]).toEqual({
      id: 'b1',
      type: 'heading',
      level: 2,
      text: 'Fertig',
    });
  });

  it('flattens the levels the editor does not have', () => {
    // Der Editor kennt drei Groessen; markdown kennt sechs.
    expect(parse('##### tief').content[0]).toEqual({
      id: 'b1',
      type: 'heading',
      level: 3,
      text: 'tief',
    });
  });

  describe('the title', () => {
    it('comes from the front matter, and the heading below it goes', () => {
      const result = parse(
        [
          '---',
          'title: "Mein Plan"',
          'folder: "Arbeit"',
          '---',
          '',
          '# Mein Plan',
          '',
          'Text.',
        ].join('\n'),
      );

      expect(result.title).toBe('Mein Plan');
      expect(result.folder).toBe('Arbeit');
      expect(result.content).toEqual([{ id: 'b2', type: 'text', text: 'Text.' }]);
    });

    it('comes from the first heading when there is no front matter', () => {
      const result = parse('# Aus der Überschrift\n\nText.');

      expect(result.title).toBe('Aus der Überschrift');
      expect(result.content).toEqual([{ id: 'b2', type: 'text', text: 'Text.' }]);
    });

    it('comes from the file name when the text has none', () => {
      expect(parse('Nur Text.', 'Notiz vom Montag').title).toBe('Notiz vom Montag');
    });

    it('keeps a heading that is not the title', () => {
      const result = parse(['---', 'title: "Eins"', '---', '', '# Zwei'].join('\n'));

      expect(result.title).toBe('Eins');
      expect(result.content).toHaveLength(1);
    });

    it('does not mistake a divider at the top for a front matter', () => {
      const result = parse('---\n\nText.');

      expect(result.title).toBe('Datei');
      expect(result.content[0].type).toBe('divider');
    });
  });
});

/**
 * Beim Einfuegen aus der Zwischenablage liest derselbe Parser — ohne
 * Dateikopf und ohne Titel. Diese Faelle standen vorher in
 * markdown-paste.spec.ts und gehoeren weiter geprueft; der zweite Leser ist
 * weg, die Kanten sind dieselben geblieben.
 */
describe('markdownToBlocks (Einfuegen)', () => {
  const blocks = (md: string) => markdownToBlocks(md, ids());

  it('keeps a single line as one text block, so a normal paste stays normal', () => {
    expect(blocks('just some text')).toEqual([{ id: 'b1', type: 'text', text: 'just some text' }]);
  });

  it('does not eat a front matter — a snippet is not a file', () => {
    // markdownToPlan liest den Kopf weg; hier waere das falsch, denn was man
    // einfuegt, soll stehenbleiben. Was danach dasteht, ist gewoehnliches
    // Markdown: Trennlinie, und „title: x" mit „---" darunter ist eine
    // unterstrichene Ueberschrift. Nicht huebsch, aber nichts verschluckt.
    expect(blocks('---\ntitle: x\n---').map((b) => b.type)).toEqual(['divider', 'heading']);
  });

  it('turns a pasted table into a table', () => {
    const out = blocks(
      ['| Bereich | Status |', '| --- | --- |', '| ACL isolation | **tested locally** |'].join(
        '\n',
      ),
    );

    expect(out).toEqual([
      {
        id: 'b1',
        type: 'table',
        columns: ['Bereich', 'Status'],
        rows: [['ACL isolation', '**tested locally**']],
      },
    ]);
  });

  it('accepts both "1." and "1)"', () => {
    const out = blocks('1. one\n2) two');
    expect(out[0].type === 'list' && out[0].items.map((i) => i.text)).toEqual(['one', 'two']);
  });

  it('prefers the checklist over the bullet', () => {
    // „- [ ] " faengt auch mit „- " an.
    const out = blocks('- [ ] offen');
    expect(out[0].type === 'list' && out[0].variant).toBe('todo');
  });

  it('runs an unclosed fence to the end instead of losing the rest', () => {
    expect(blocks('```ts\nconst a = 1;')).toEqual([
      { id: 'b1', type: 'code', language: 'ts', code: 'const a = 1;' },
    ]);
  });

  it('ends a paragraph when the next block starts without a blank line', () => {
    expect(blocks('intro\n## Section')).toEqual([
      { id: 'b1', type: 'text', text: 'intro' },
      { id: 'b2', type: 'heading', level: 2, text: 'Section' },
    ]);
  });

  it('handles CRLF input', () => {
    expect(blocks('# Title\r\n- item')).toEqual([
      { id: 'b1', type: 'heading', level: 1, text: 'Title' },
      { id: 'b2', type: 'list', variant: 'bullet', items: [{ text: 'item', checked: false }] },
    ]);
  });

  it('returns nothing for empty or blank input', () => {
    expect(blocks('')).toEqual([]);
    expect(blocks('\n\n  \n')).toEqual([]);
  });

  it('walks a mixed document in order', () => {
    const types = blocks(
      ['# Title', 'Intro line', '', '## Keys', '- one', '- two', '', '> note', '', '---'].join(
        '\n',
      ),
    ).map((b) => b.type);

    expect(types).toEqual(['heading', 'text', 'heading', 'list', 'quote', 'divider']);
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and the path', () => {
    expect(titleFromFileName('Architektur 2026.md')).toBe('Architektur 2026');
    expect(titleFromFileName('Ordner/Größe & Länge.markdown')).toBe('Größe & Länge');
    expect(titleFromFileName('ohne-endung')).toBe('ohne-endung');
  });
});

describe('export and import together', () => {
  it('brings a plan back the way it went out', () => {
    const content: PlanBlock[] = [
      { id: 'x1', type: 'heading', level: 2, text: 'Aufbau' },
      { id: 'x2', type: 'text', text: 'Ein Absatz mit **fett** und `Code`.' },
      {
        id: 'x3',
        type: 'list',
        variant: 'number',
        items: [
          { text: 'eins', checked: false },
          { text: 'darunter', checked: false, level: 1 },
          { text: 'zwei', checked: false },
        ],
      },
      {
        id: 'x4',
        type: 'list',
        variant: 'todo',
        items: [
          { text: 'offen', checked: false },
          { text: 'erledigt', checked: true },
        ],
      },
      { id: 'x5', type: 'quote', text: 'Merke:\nzwei Zeilen' },
      { id: 'x6', type: 'code', language: 'ts', code: 'const a = 1;' },
      { id: 'x7', type: 'diagram', code: 'flowchart TD\n  a --> b' },
      { id: 'x8', type: 'table', columns: ['Was', 'Warum'], rows: [['MQTT', 'Strich | drin']] },
      { id: 'x9', type: 'divider' },
    ];

    const plan: Plan = {
      id: 'p1',
      title: 'Hin und zurück',
      categoryId: null,
      content,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    };

    const back = markdownToPlan(planToMarkdown(plan, 'Arbeit'), 'egal', ids());

    expect(back.title).toBe('Hin und zurück');
    expect(back.folder).toBe('Arbeit');
    // Die Ids sind neu — verglichen wird der Inhalt.
    expect(back.content.map(({ id, ...rest }) => rest)).toEqual(
      content.map(({ id, ...rest }) => rest),
    );
  });

  it('turns a toggle into a heading — and says so by not pretending otherwise', () => {
    const plan: Plan = {
      id: 'p1',
      title: 'Mit Toggle',
      categoryId: null,
      content: [
        {
          id: 'g',
          type: 'group',
          title: 'Firestore',
          collapsed: true,
          blocks: [{ id: 'c1', type: 'text', text: 'Dokumente statt Tabellen.' }],
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    };

    const back = markdownToPlan(planToMarkdown(plan), 'egal', ids());

    // b1 war die Titelüberschrift und ist zum Titel geworden.
    expect(back.content).toEqual([
      { id: 'b2', type: 'heading', level: 2, text: 'Firestore' },
      { id: 'b3', type: 'text', text: 'Dokumente statt Tabellen.' },
    ]);
  });
});
