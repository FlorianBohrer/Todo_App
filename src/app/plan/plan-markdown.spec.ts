import { blocksToMarkdown, fileNameFor, planToMarkdown, uniqueNames } from './plan-markdown';
import type { Plan, PlanBlock } from './plan.model';

function plan(content: PlanBlock[], title = 'Mein Plan'): Plan {
  return {
    id: 'p1',
    title,
    categoryId: null,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  };
}

/** Der Rumpf ohne Kopf — der Kopf wird eigens geprueft. */
function body(md: string): string {
  return md.split('---\n\n')[1] ?? md;
}

describe('planToMarkdown', () => {
  it('writes the kinds of block that markdown knows', () => {
    const md = body(
      planToMarkdown(
        plan([
          { id: '1', type: 'heading', level: 2, text: 'Aufbau' },
          { id: '2', type: 'text', text: 'Ein Absatz mit **fett**.' },
          { id: '3', type: 'quote', text: 'Zwei\nZeilen' },
          { id: '4', type: 'divider' },
        ]),
      ),
    );

    expect(md).toContain('## Aufbau');
    expect(md).toContain('Ein Absatz mit **fett**.');
    expect(md).toContain('> Zwei\n> Zeilen');
    expect(md).toContain('\n---\n');
  });

  it('numbers each level of a list on its own', () => {
    const md = planToMarkdown(
      plan([
        {
          id: '1',
          type: 'list',
          variant: 'number',
          items: [
            { text: 'eins', checked: false },
            { text: 'darunter', checked: false, level: 1 },
            { text: 'auch', checked: false, level: 1 },
            { text: 'zwei', checked: false },
          ],
        },
      ]),
    );

    expect(md).toContain('1. eins\n  1. darunter\n  2. auch\n2. zwei');
  });

  it('keeps a checklist checkable', () => {
    const md = planToMarkdown(
      plan([
        {
          id: '1',
          type: 'list',
          variant: 'todo',
          items: [
            { text: 'offen', checked: false },
            // Verknuepft mit einem echten Todo — im Text bleibt davon nichts,
            // der Haken aber schon.
            { text: 'erledigt', checked: true, todoId: 'abc' },
          ],
        },
      ]),
    );

    expect(md).toContain('- [ ] offen');
    expect(md).toContain('- [x] erledigt');
    expect(md).not.toContain('abc');
  });

  it('fences code and diagrams, and steps out of the way of backticks', () => {
    const md = planToMarkdown(
      plan([
        { id: '1', type: 'code', language: 'ts', code: 'const a = 1;' },
        { id: '2', type: 'diagram', code: 'flowchart TD\n  a --> b' },
        { id: '3', type: 'code', language: '', code: 'Zaun ``` im Code' },
      ]),
    );

    expect(md).toContain('```ts\nconst a = 1;\n```');
    expect(md).toContain('```mermaid\nflowchart TD\n  a --> b\n```');
    expect(md).toContain('````\nZaun ``` im Code\n````');
  });

  it('writes a table that stays a table', () => {
    const md = planToMarkdown(
      plan([
        {
          id: '1',
          type: 'table',
          columns: ['Was', 'Warum'],
          rows: [
            ['MQTT', 'Protokoll | mit Strich'],
            ['HTTP', 'Zwei\nZeilen'],
          ],
        },
      ]),
    );

    expect(md).toContain('| Was | Warum |\n| --- | --- |');
    // Strich und Umbruch wuerden die Tabelle sonst zerreissen.
    expect(md).toContain('| MQTT | Protokoll \\| mit Strich |');
    expect(md).toContain('| HTTP | Zwei<br>Zeilen |');
  });

  it('turns a toggle into a heading with its content below it', () => {
    // Markdown kennt kein Aufklappen. Einruecken waere falsch: vier
    // Leerzeichen machen aus dem Inhalt einen Codeblock.
    const md = body(
      planToMarkdown(
        plan([
          {
            id: 'g',
            type: 'group',
            title: 'Firestore',
            collapsed: true,
            blocks: [
              { id: 'c1', type: 'text', text: 'Dokumente statt Tabellen.' },
              { id: 'c2', type: 'heading', level: 1, text: 'Grenzen' },
            ],
          },
        ]),
      ),
    );

    expect(md).toContain('## Firestore');
    expect(md).toContain('Dokumente statt Tabellen.');
    // Die Ueberschrift im Toggle rueckt eine Stufe nach: sie steht darunter.
    expect(md).toContain('## Grenzen');
    expect(md).not.toMatch(/^ {4}/m);
  });

  it('puts the title in a heading and in the front matter', () => {
    const md = planToMarkdown(plan([], 'Titel mit "Anführung"'), 'Arbeit');
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('title: "Titel mit \\"Anführung\\""');
    expect(md).toContain('folder: "Arbeit"');
    expect(md).toContain('updated: 2026-02-02T00:00:00.000Z');
    expect(md).toContain('# Titel mit "Anführung"');
  });

  it('leaves no run of empty lines behind', () => {
    const md = planToMarkdown(
      plan([
        { id: '1', type: 'text', text: '' },
        { id: '2', type: 'text', text: 'Da.' },
        { id: '3', type: 'text', text: '   ' },
      ]),
    );

    expect(md).not.toContain('\n\n\n');
  });
});

describe('blocksToMarkdown', () => {
  it('writes a selection without any wrapper', () => {
    // Fuer die Zwischenablage: kein Dateikopf, kein Titel — das hier wird
    // woanders eingefuegt.
    const md = blocksToMarkdown([
      { id: '1', type: 'heading', level: 2, text: 'Aufbau' },
      { id: '2', type: 'text', text: 'Ein Absatz.' },
    ]);

    expect(md).toBe('## Aufbau\n\nEin Absatz.');
    expect(md).not.toContain('---');
  });

  it('is empty for an empty selection', () => {
    expect(blocksToMarkdown([])).toBe('');
  });
});

describe('fileNameFor', () => {
  it('keeps what a file system keeps', () => {
    expect(fileNameFor('Architektur 2026')).toBe('Architektur 2026.md');
    expect(fileNameFor('Größe/Länge: A*B?')).toBe('Größe-Länge- A-B-.md');
  });

  it('never returns just an extension', () => {
    expect(fileNameFor('')).toBe('untitled.md');
    expect(fileNameFor('   ')).toBe('untitled.md');
    expect(fileNameFor('...')).toBe('untitled.md');
  });

  it('does not end on a dot or a space', () => {
    // Windows schneidet beides ab und macht daraus einen anderen Namen.
    expect(fileNameFor('Plan.')).toBe('Plan.md');
    expect(fileNameFor('Plan ')).toBe('Plan.md');
  });
});

describe('uniqueNames', () => {
  it('numbers repeats instead of overwriting them', () => {
    expect(uniqueNames(['Plan', 'Plan', 'Anderes', 'plan'])).toEqual([
      'Plan.md',
      'Plan (2).md',
      'Anderes.md',
      'plan (3).md',
    ]);
  });
});
