import { describe, expect, it } from 'vitest';

import {
  DIAGRAM_TEMPLATES,
  PLAN_TEMPLATES,
  componentsTable,
  decisionRecord,
  diagramBlock,
  endpointsTable,
  risksTable,
  templateContent,
} from './architecture-blocks';
import { PlanBlock } from './plan.model';
import { blocksToMarkdown } from './plan-markdown';

function counter(): () => string {
  let n = 0;
  return () => `b${++n}`;
}

/** Alle Kennungen eines Dokuments, auch in Abschnitten. */
function ids(blocks: readonly PlanBlock[]): string[] {
  return blocks.flatMap((b) => (b.type === 'group' ? [b.id, ...ids(b.blocks)] : [b.id]));
}

const DAY = new Date(2026, 9, 22);

describe('diagram templates', () => {
  it('starts every diagram with the keyword Mermaid needs to pick the type', () => {
    expect(DIAGRAM_TEMPLATES.system.startsWith('flowchart')).toBe(true);
    expect(DIAGRAM_TEMPLATES.sequence.startsWith('sequenceDiagram')).toBe(true);
    expect(DIAGRAM_TEMPLATES.data.startsWith('erDiagram')).toBe(true);
    expect(DIAGRAM_TEMPLATES.classes.startsWith('classDiagram')).toBe(true);
    expect(DIAGRAM_TEMPLATES.states.startsWith('stateDiagram-v2')).toBe(true);
  });

  it('wraps a template in a diagram block', () => {
    expect(diagramBlock('d1', 'sequence')).toEqual({ id: 'd1', type: 'diagram', code: DIAGRAM_TEMPLATES.sequence });
  });
});

describe('tables', () => {
  it('give every row as many cells as there are columns', () => {
    for (const table of [componentsTable('t'), endpointsTable('t'), risksTable('t')]) {
      for (const row of table.rows) expect(row.length).toBe(table.columns.length);
    }
  });
});

describe('decision record', () => {
  it('is a section with status, date and the four parts of an ADR', () => {
    const adr = decisionRecord(counter(), DAY);

    expect(adr.type).toBe('group');
    expect(adr.title).toBe('Decision: ');
    const first = adr.blocks[0];
    expect(first.type === 'text' && first.text).toContain('**Status:** Proposed · **Date:** 2026-10-22');
    const headings = adr.blocks.flatMap((b) => (b.type === 'heading' ? [b.text] : []));
    expect(headings).toEqual(['Context', 'Decision', 'Consequences', 'Alternatives considered']);
  });
});

describe('plan templates', () => {
  it('offers system design, decision and API design', () => {
    expect(PLAN_TEMPLATES.map((t) => t.kind)).toEqual(['system-design', 'decision', 'api-design']);
  });

  for (const template of PLAN_TEMPLATES) {
    it(`builds “${template.label}” with unique ids and no empty sections`, () => {
      const content = templateContent(template.kind, counter(), DAY);
      const all = ids(content);

      expect(content.length).toBeGreaterThan(5);
      expect(new Set(all).size).toBe(all.length);
    });
  }

  it('gives a system design the questions an architecture has to answer', () => {
    const content = templateContent('system-design', counter(), DAY);
    const sections = content.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [b.text] : []));

    expect(sections).toEqual([
      'Goals',
      'Non-goals',
      'Requirements',
      'Architecture',
      'Components',
      'Data model',
      'Key flows',
      'APIs',
      'Decisions',
      'Risks',
      'Rollout',
      'Open questions',
    ]);
    expect(content.filter((b) => b.type === 'diagram')).toHaveLength(3);
  });

  it('exports as Markdown that other tools read: mermaid fences and pipe tables', () => {
    const markdown = blocksToMarkdown(templateContent('system-design', counter(), DAY));

    expect(markdown.match(/```mermaid/g)).toHaveLength(3);
    expect(markdown).toContain('| Component | Responsibility | Tech | Owner |');
    expect(markdown).toContain('## Open questions');
  });
});
