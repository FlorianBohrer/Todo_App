import { describe, expect, it } from 'vitest';

import { breakListAt, joinFollowingList } from './list-break';
import { PlanBlock, PlanListBlock, PlanTextBlock } from './plan.model';

const para = (text = ''): PlanTextBlock => ({ id: 'para', type: 'text', text });

const list = (id = 'list', variant: PlanListBlock['variant'] = 'bullet'): PlanListBlock => ({
  id,
  type: 'list',
  variant,
  items: [
    { text: 'Apfel', checked: false },
    { text: 'Birne', checked: true, todoId: 'todo-7' },
    { text: 'Kirsche', checked: false, level: 1 },
  ],
});

const shape = (blocks: readonly PlanBlock[]) =>
  blocks.map((b) =>
    b.type === 'list'
      ? `${b.id}:[${b.items.map((i) => i.text).join(',')}]`
      : b.type === 'text'
        ? `${b.id}:"${b.text}"`
        : b.id,
  );

describe('breakListAt', () => {
  it('puts the paragraph exactly where the item was, splitting the list', () => {
    const out = breakListAt([list()], 'list', 1, para('Birne'), 'list-2');

    expect(shape(out)).toEqual(['list:[Apfel]', 'para:"Birne"', 'list-2:[Kirsche]']);
  });

  it('keeps the variant and every item field in both halves', () => {
    const out = breakListAt([list('list', 'todo')], 'list', 0, para(), 'list-2');
    const rest = out[1] as PlanListBlock;

    expect(rest.variant).toBe('todo');
    // Haken und Verknuepfung zur Aufgabe wandern mit, unangetastet.
    expect(rest.items[0]).toEqual({ text: 'Birne', checked: true, todoId: 'todo-7' });
    expect(rest.items[1]).toEqual({ text: 'Kirsche', checked: false, level: 1 });
  });

  it('on the first item puts the paragraph before the list, which keeps its id', () => {
    const out = breakListAt([list()], 'list', 0, para(), 'list-2');

    expect(shape(out)).toEqual(['para:""', 'list:[Birne,Kirsche]']);
  });

  it('on the last item puts the paragraph after the list', () => {
    const out = breakListAt([list()], 'list', 2, para(), 'list-2');

    expect(shape(out)).toEqual(['list:[Apfel,Birne]', 'para:""']);
  });

  it('turns a one-item list into just the paragraph', () => {
    const single: PlanListBlock = { id: 'list', type: 'list', variant: 'number', items: [{ text: '', checked: false }] };

    expect(shape(breakListAt([single], 'list', 0, para(), 'list-2'))).toEqual(['para:""']);
  });

  it('leaves the blocks around it where they are', () => {
    const before: PlanBlock = { id: 'h', type: 'heading', level: 2, text: 'Obst' };
    const after: PlanBlock = { id: 'end', type: 'text', text: 'Ende' };

    const out = breakListAt([before, list(), after], 'list', 1, para(), 'list-2');

    expect(shape(out)).toEqual(['h', 'list:[Apfel]', 'para:""', 'list-2:[Kirsche]', 'end:"Ende"']);
  });

  it('finds a list inside a section', () => {
    const group: PlanBlock = { id: 'g', type: 'group', title: 'Einkauf', collapsed: false, blocks: [list()] };

    const out = breakListAt([group], 'list', 1, para(), 'list-2');

    expect(out[0].type).toBe('group');
    expect(shape((out[0] as Extract<PlanBlock, { type: 'group' }>).blocks)).toEqual([
      'list:[Apfel]',
      'para:""',
      'list-2:[Kirsche]',
    ]);
  });

  it('changes nothing for an unknown list or an index out of range', () => {
    const blocks = [list()];

    expect(shape(breakListAt(blocks, 'nope', 1, para(), 'x'))).toEqual(shape(blocks));
    expect(shape(breakListAt(blocks, 'list', 3, para(), 'x'))).toEqual(shape(blocks));
    expect(shape(breakListAt(blocks, 'list', -1, para(), 'x'))).toEqual(shape(blocks));
  });

  it('does not touch the input', () => {
    const blocks = [list()];
    const copy = structuredClone(blocks);

    breakListAt(blocks, 'list', 1, para(), 'list-2');

    expect(blocks).toEqual(copy);
  });

  it('starts the second list on the top level when the broken item had sub-items', () => {
    const nested: PlanListBlock = {
      id: 'list',
      type: 'list',
      variant: 'bullet',
      items: [
        { text: 'Obst', checked: false },
        { text: 'Apfel', checked: false, level: 1 },
        { text: 'Sorte', checked: false, level: 2 },
        { text: 'Birne', checked: false, level: 1 },
      ],
    };

    const out = breakListAt([nested], 'list', 0, para('Obst'), 'list-2');
    const rest = out[1] as PlanListBlock;

    // Kein Unterpunkt ohne Oberpunkt; was darunter hing, bleibt relativ so.
    expect(rest.items.map((i) => i.level ?? 0)).toEqual([0, 1, 1]);
  });
});

describe('joinFollowingList', () => {
  const part = (id: string, texts: string[], variant: PlanListBlock['variant'] = 'bullet'): PlanListBlock => ({
    id,
    type: 'list',
    variant,
    items: texts.map((text) => ({ text, checked: false })),
  });

  it('undoes breakListAt once the paragraph is gone', () => {
    const broken = breakListAt([list()], 'list', 1, para(), 'list-2');
    const withoutParagraph = broken.filter((b) => b.id !== 'para');

    expect(shape(joinFollowingList(withoutParagraph, 'list'))).toEqual(['list:[Apfel,Kirsche]']);
  });

  it('joins only a directly following list of the same kind', () => {
    const blocks = [part('a', ['1']), part('b', ['2'], 'number')];

    expect(shape(joinFollowingList(blocks, 'a'))).toEqual(['a:[1]', 'b:[2]']);
    expect(shape(joinFollowingList([part('a', ['1']), para('x'), part('b', ['2'])], 'a'))).toEqual([
      'a:[1]',
      'para:"x"',
      'b:[2]',
    ]);
  });

  it('works inside a section and never across its edge', () => {
    const group: PlanBlock = { id: 'g', type: 'group', title: 'G', collapsed: false, blocks: [part('a', ['1'])] };

    const out = joinFollowingList([group, part('b', ['2'])], 'a');

    expect(out).toHaveLength(2);
    expect(shape((out[0] as Extract<PlanBlock, { type: 'group' }>).blocks)).toEqual(['a:[1]']);
  });

  it('leaves the list alone when nothing follows it', () => {
    expect(shape(joinFollowingList([part('a', ['1'])], 'a'))).toEqual(['a:[1]']);
    expect(shape(joinFollowingList([part('a', ['1'])], 'nope'))).toEqual(['a:[1]']);
  });
});
