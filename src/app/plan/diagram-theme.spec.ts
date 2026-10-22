import { describe, expect, it } from 'vitest';

import { DIAGRAM_PALETTE, diagramConfig, diagramKind, fittedWidth } from './diagram-theme';
import { DIAGRAM_TEMPLATES } from './architecture-blocks';

describe('diagramKind', () => {
  it('names every architecture template', () => {
    expect(diagramKind(DIAGRAM_TEMPLATES.system)).toEqual({ kind: 'flowchart', label: 'Flowchart' });
    expect(diagramKind(DIAGRAM_TEMPLATES.sequence)).toEqual({ kind: 'sequence', label: 'Sequence' });
    expect(diagramKind(DIAGRAM_TEMPLATES.data)).toEqual({ kind: 'data', label: 'Data model' });
    expect(diagramKind(DIAGRAM_TEMPLATES.classes)).toEqual({ kind: 'classes', label: 'Classes' });
    expect(diagramKind(DIAGRAM_TEMPLATES.states)).toEqual({ kind: 'states', label: 'States' });
  });

  it('looks past comments, blank lines and a front-matter block', () => {
    expect(diagramKind('\n%% Bestellung\n\ngraph TD\n a --> b').kind).toBe('flowchart');
    expect(diagramKind('---\ntitle: Orders\n---\nsequenceDiagram\n A->>B: hi').kind).toBe('sequence');
  });

  it('knows the other Mermaid types by name and falls back to "Diagram"', () => {
    expect(diagramKind('gantt\n title Plan').label).toBe('Timeline');
    expect(diagramKind('mindmap\n root').label).toBe('Mind map');
    expect(diagramKind('C4Context\n title x').label).toBe('C4');
    expect(diagramKind('').label).toBe('Diagram');
    expect(diagramKind('nonsense').label).toBe('Diagram');
  });
});

describe('fittedWidth', () => {
  it('keeps a diagram that fits at its own size — it never grows', () => {
    expect(fittedWidth(400, 600)).toBe(400);
  });

  it('shrinks a wider one onto the column while the labels stay readable', () => {
    expect(fittedWidth(700, 560)).toBe(560);
    expect(fittedWidth(1000, 600)).toBe(600);
  });

  it('lets one that would become unreadable keep its size and scroll', () => {
    expect(fittedWidth(1076, 315)).toBe(1076);
  });

  it('does nothing without a measurable size', () => {
    expect(fittedWidth(0, 500)).toBe(0);
    expect(fittedWidth(800, 0)).toBe(800);
    expect(fittedWidth(Number.NaN, 500)).toBeNaN();
  });
});

describe('diagramConfig', () => {
  const config = diagramConfig({ ...DIAGRAM_PALETTE, accent: '#DE8A98' });

  it('keeps the source sanitised', () => {
    expect(config.securityLevel).toBe('strict');
  });

  it('gives data-model rows dark backgrounds — the default made every other row light grey on white', () => {
    const vars = config.themeVariables as Record<string, string>;
    expect(vars['rowOdd']).toBe(DIAGRAM_PALETTE.node);
    expect(vars['rowEven']).toMatch(/^#[0-9A-F]{6}$/i);
    expect(vars['attributeBackgroundColorOdd']).toBe(DIAGRAM_PALETTE.node);
  });

  it('draws in the app font and the chosen accent', () => {
    expect(config.fontFamily).toContain('Figtree');
    expect(config.sequence?.actorFontFamily).toContain('Figtree');
    // Mermaid setzt sonst 16px — auch in der Abfolge, deren eigene Größen
    // diese Zahl überschreibt.
    expect(config.fontSize).toBe(14);
    expect(config.themeCSS).toContain('#DE8A98');
  });

  it('never shrinks a diagram to the column — it scrolls instead', () => {
    for (const kind of ['flowchart', 'sequence', 'er', 'class', 'state'] as const) {
      expect(config[kind]?.useMaxWidth).toBe(false);
    }
  });
});
