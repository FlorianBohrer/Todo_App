import { describe, expect, it } from 'vitest';

import { PlanBlock } from './plan.model';
import { editedLabel, planSummary } from './plan-summary';

describe('planSummary', () => {
  it('starts with the first sentence, without markdown', () => {
    const content: PlanBlock[] = [
      { id: 'h', type: 'heading', level: 1, text: 'Ziele' },
      { id: 'p', type: 'text', text: 'Zwei **Wochen** ans Meer, siehe [[Budget]] und `Packliste`.' },
    ];
    expect(planSummary(content).snippet).toBe('Zwei Wochen ans Meer, siehe Budget und Packliste.');
  });

  it('counts to-dos, diagrams and tables, also inside sections', () => {
    const content: PlanBlock[] = [
      { id: 'l', type: 'list', variant: 'todo', items: [
        { text: 'A', checked: true }, { text: 'B', checked: false },
      ] },
      { id: 'g', type: 'group', title: 'Details', collapsed: false, blocks: [
        { id: 'l2', type: 'list', variant: 'todo', items: [{ text: 'C', checked: true }] },
        { id: 'd', type: 'diagram', code: 'flowchart TB' },
        { id: 't', type: 'table', columns: ['a'], rows: [['1']] },
      ] },
      { id: 'b', type: 'list', variant: 'bullet', items: [{ text: 'not a to-do', checked: false }] },
    ];
    const summary = planSummary(content);

    expect(summary.todos).toEqual({ done: 2, total: 3 });
    expect(summary.diagrams).toBe(1);
    expect(summary.tables).toBe(1);
  });

  it('falls back to list items, then to the first heading', () => {
    expect(planSummary([{ id: 'l', type: 'list', variant: 'bullet', items: [
      { text: 'Milch', checked: false }, { text: 'Brot', checked: false },
    ] }]).snippet).toBe('Milch · Brot');
    expect(planSummary([{ id: 'h', type: 'heading', level: 2, text: 'Nur ein Titel' }]).snippet).toBe('Nur ein Titel');
    expect(planSummary([]).snippet).toBe('');
  });

  it('shortens a long beginning at a word', () => {
    const snippet = planSummary([{ id: 'p', type: 'text', text: 'word '.repeat(60) }]).snippet;
    expect(snippet.length).toBeLessThanOrEqual(140);
    expect(snippet.endsWith('…')).toBe(true);
  });
});

describe('editedLabel', () => {
  const now = new Date(2026, 9, 22, 15, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('gets coarser the longer ago it was', () => {
    expect(editedLabel(ago(20_000), now)).toBe('Edited just now');
    expect(editedLabel(ago(5 * 60_000), now)).toBe('Edited 5 min ago');
    expect(editedLabel(ago(3 * 3_600_000), now)).toBe('Edited 3 h ago');
    expect(editedLabel(new Date(2026, 9, 21, 9, 0).toISOString(), now)).toBe('Edited yesterday');
    expect(editedLabel(new Date(2026, 9, 18, 9, 0).toISOString(), now)).toBe('Edited 4 days ago');
    expect(editedLabel(new Date(2026, 8, 3).toISOString(), now)).toBe('Edited Sep 3');
    expect(editedLabel(new Date(2025, 11, 24).toISOString(), now)).toBe('Edited Dec 24, 2025');
  });

  it('says nothing for a broken date', () => {
    expect(editedLabel('nonsense', now)).toBe('');
  });
});
