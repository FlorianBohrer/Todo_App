import { describe, expect, it } from 'vitest';

import { PlanBlock } from './plan.model';
import { copyBlocks, copyTitle } from './plan-copy';

function counter(): () => string {
  let n = 0;
  return () => `new${++n}`;
}

describe('copyBlocks', () => {
  const original: PlanBlock[] = [
    { id: 'a', type: 'text', text: 'Hallo' },
    { id: 'g', type: 'group', title: 'Details', collapsed: false, blocks: [
      { id: 'l', type: 'list', variant: 'todo', items: [
        { text: 'Linked', checked: true, todoId: 'todo-1' },
        { text: 'Plain', checked: false, level: 1 },
      ] },
    ] },
    { id: 't', type: 'table', columns: ['A'], rows: [['1']] },
  ];

  it('gives every block, also inside sections, a new id', () => {
    const copy = copyBlocks(original, counter());
    const ids = (bs: PlanBlock[]): string[] => bs.flatMap((b) => (b.type === 'group' ? [b.id, ...ids(b.blocks)] : [b.id]));

    expect(ids(copy)).toEqual(['new1', 'new2', 'new3', 'new4']);
  });

  it('keeps the content but drops links to real to-dos', () => {
    const copy = copyBlocks(original, counter());
    const group = copy[1];
    const list = group.type === 'group' ? group.blocks[0] : null;

    expect(list?.type === 'list' && list.items).toEqual([
      { text: 'Linked', checked: true },
      { text: 'Plain', checked: false, level: 1 },
    ]);
  });

  it('does not share arrays with the original', () => {
    const copy = copyBlocks(original, counter());
    const table = copy[2];
    if (table.type !== 'table') throw new Error('table expected');
    table.rows[0][0] = 'changed';

    const source = original[2];
    expect(source.type === 'table' && source.rows[0][0]).toBe('1');
  });
});

describe('copyTitle', () => {
  it('appends "(copy)" and counts further copies', () => {
    expect(copyTitle('Website', ['Website'])).toBe('Website (copy)');
    expect(copyTitle('Website', ['Website', 'Website (copy)'])).toBe('Website (copy 2)');
    expect(copyTitle('Website (copy)', ['Website', 'Website (copy)'])).toBe('Website (copy 2)');
  });
});
