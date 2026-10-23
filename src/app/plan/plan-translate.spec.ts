import { describe, expect, it, vi } from 'vitest';

import { PlanBlock } from './plan.model';
import {
  applyTexts,
  batchTexts,
  collectTexts,
  guessLanguage,
  keepValidDiagrams,
  PlanTexts,
} from './plan-translate';

const plan: PlanTexts = {
  title: 'Urlaubsplanung',
  content: [
    { id: 'h', type: 'heading', level: 1, text: 'Ziele' },
    { id: 'p', type: 'text', text: 'Zwei Wochen ans **Meer**.' },
    { id: 'e', type: 'text', text: '   ' },
    { id: 'l', type: 'list', variant: 'todo', items: [
      { text: 'Flüge vergleichen', checked: false, todoId: 'todo-1' },
      { text: '', checked: false },
    ] },
    { id: 't', type: 'table', columns: ['Ort', 'Preis'], rows: [['Kreta', '1000 €']] },
    { id: 'c', type: 'code', language: 'text', code: 'Packliste: Pass' },
    { id: 'g', type: 'group', title: 'Budget', collapsed: false, blocks: [
      { id: 'q', type: 'quote', text: 'Reisen bildet.' },
    ] },
    { id: 'd', type: 'diagram', code: 'flowchart TB\n  a[Start] --> b[Ziel]' },
    { id: 'x', type: 'divider' },
  ] as PlanBlock[],
};

describe('collectTexts', () => {
  it('collects what one reads, in document order, and skips code and fields without letters', () => {
    expect(collectTexts(plan)).toEqual([
      { text: 'Urlaubsplanung', kind: 'text' },
      { text: 'Ziele', kind: 'text' },
      { text: 'Zwei Wochen ans **Meer**.', kind: 'text' },
      { text: 'Flüge vergleichen', kind: 'text' },
      { text: 'Ort', kind: 'text' },
      { text: 'Preis', kind: 'text' },
      { text: 'Kreta', kind: 'text' },
      { text: 'Budget', kind: 'text' },
      { text: 'Reisen bildet.', kind: 'text' },
      { text: 'flowchart TB\n  a[Start] --> b[Ziel]', kind: 'mermaid' },
    ]);
  });
});

describe('applyTexts', () => {
  it('puts every translation back where its text came from', () => {
    const english = [
      'Holiday planning', 'Goals', 'Two weeks by the **sea**.', 'Compare flights',
      'Place', 'Price', 'Crete', 'Budget', 'Travel educates.',
      'flowchart TB\n  a[Start] --> b[Goal]',
    ];
    const result = applyTexts(plan, english);

    expect(result.title).toBe('Holiday planning');
    expect(collectTexts(result).map((i) => i.text)).toEqual(english);
  });

  it('keeps everything that is not text: ids, links to to-dos, code, empty fields', () => {
    const result = applyTexts(plan, collectTexts(plan).map((i) => i.text.toUpperCase()));
    const list = result.content[3];
    const code = result.content[5];

    expect(result.content.map((b) => b.id)).toEqual(plan.content.map((b) => b.id));
    expect(list.type === 'list' && list.items[0].todoId).toBe('todo-1');
    expect(list.type === 'list' && list.items[1].text).toBe('');
    expect(code.type === 'code' && code.code).toBe('Packliste: Pass');
    expect(result.content[2].type === 'text' && result.content[2].text).toBe('   ');
  });
});

describe('guessLanguage', () => {
  it('tells German from English by their common words', () => {
    expect(guessLanguage('Wir wollen zwei Wochen ans Meer, und das Budget ist begrenzt.')).toBe('de');
    expect(guessLanguage('We want two weeks by the sea, and the budget is limited.')).toBe('en');
    expect(guessLanguage('Größe und Küche')).toBe('de');
  });
});

describe('keepValidDiagrams', () => {
  const items = [
    { text: 'Ziel', kind: 'text' as const },
    { text: 'flowchart TB\n  a[Start] --> b[Ziel]', kind: 'mermaid' as const },
    { text: 'flowchart TB\n  c[Plan]', kind: 'mermaid' as const },
  ];

  it('keeps the original diagram when the translated one does not parse', async () => {
    const translated = ['Goal', 'flowchart TB\n  a[Start] --> b[Goal', 'flowchart TB\n  c[Plan]'];
    const isValid = vi.fn(async (code: string) => !code.endsWith('[Goal'));

    expect(await keepValidDiagrams(items, translated, isValid)).toEqual([
      'Goal',
      'flowchart TB\n  a[Start] --> b[Ziel]',
      'flowchart TB\n  c[Plan]',
    ]);
    // Text und unveränderte Diagramme werden gar nicht erst geprüft.
    expect(isValid).toHaveBeenCalledTimes(1);
  });

  it('treats a checker that throws as a failed check', async () => {
    const translated = ['Goal', 'flowchart TB\n  a[Start] --> b[Goal]', 'flowchart TB\n  c[Plan]'];
    const result = await keepValidDiagrams(items, translated, () => Promise.reject(new Error('boom')));

    expect(result[1]).toBe(items[1].text);
  });
});

describe('batchTexts', () => {
  const item = (length: number) => ({ text: 'a'.repeat(length), kind: 'text' as const });

  it('keeps small plans in one request', () => {
    expect(batchTexts([item(10), item(20)])).toEqual([[0, 1]]);
  });

  it('splits by characters and by count', () => {
    expect(batchTexts([item(6000), item(6000), item(10)])).toEqual([[0], [1, 2]]);
    expect(batchTexts([item(1), item(1), item(1)], 10000, 2)).toEqual([[0, 1], [2]]);
  });
});
