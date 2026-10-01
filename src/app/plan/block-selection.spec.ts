import { neighbourAfterRemoval, rangeBetween, removeBlocks, siblingsOf } from './block-selection';
import type { PlanBlock } from './plan.model';

function text(id: string): PlanBlock {
  return { id, type: 'text', text: id };
}

function group(id: string, blocks: PlanBlock[]): PlanBlock {
  return { id, type: 'group', title: id, collapsed: false, blocks };
}

/**
 *  a
 *  g1 ─ b
 *       g2 ─ d
 *            e
 *       c
 *  f
 */
const TREE: PlanBlock[] = [
  text('a'),
  group('g1', [text('b'), group('g2', [text('d'), text('e')]), text('c')]),
  text('f'),
];

describe('siblingsOf', () => {
  it('finds the top level', () => {
    expect(siblingsOf(TREE, 'f')).toEqual({ ids: ['a', 'g1', 'f'], index: 2, parent: null });
  });

  it('finds a level inside a group and names the group', () => {
    expect(siblingsOf(TREE, 'b')).toEqual({ ids: ['b', 'g2', 'c'], index: 0, parent: 'g1' });
  });

  it('goes as deep as it has to', () => {
    expect(siblingsOf(TREE, 'e')).toEqual({ ids: ['d', 'e'], index: 1, parent: 'g2' });
  });

  it('treats a group as a block of its own level, not as its contents', () => {
    // „g2" steht neben b und c — nicht neben d und e.
    expect(siblingsOf(TREE, 'g2')?.ids).toEqual(['b', 'g2', 'c']);
  });

  it('gives nothing for an unknown id', () => {
    expect(siblingsOf(TREE, 'weg')).toBeNull();
  });
});

describe('rangeBetween', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('takes both ends with it', () => {
    expect(rangeBetween(ids, 'b', 'c')).toEqual(['b', 'c']);
  });

  it('does not care which way you dragged', () => {
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('is a single block when both ends are the same', () => {
    expect(rangeBetween(ids, 'c', 'c')).toEqual(['c']);
  });

  it('gives nothing when one end is not in the list', () => {
    // Quer durch zwei Ebenen: lieber nichts als die halbe Gruppe.
    expect(rangeBetween(ids, 'b', 'fremd')).toEqual([]);
  });
});

describe('neighbourAfterRemoval', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('hands the cursor to the block above', () => {
    expect(neighbourAfterRemoval(ids, ['b', 'c'])).toBe('a');
  });

  it('takes the one below when the selection started at the top', () => {
    expect(neighbourAfterRemoval(ids, ['a', 'b'])).toBe('c');
  });

  it('has nowhere to go when everything is gone', () => {
    expect(neighbourAfterRemoval(ids, ['a', 'b', 'c', 'd'])).toBeNull();
  });
});

describe('removeBlocks', () => {
  it('takes several siblings out at once', () => {
    expect(removeBlocks(TREE, ['a', 'f']).map((b) => b.id)).toEqual(['g1']);
  });

  it('reaches into a group', () => {
    const out = removeBlocks(TREE, ['b', 'c']);
    const g1 = out.find((b) => b.id === 'g1');
    expect(g1?.type === 'group' && g1.blocks.map((b) => b.id)).toEqual(['g2']);
  });

  it('takes a group with everything in it', () => {
    expect(removeBlocks(TREE, ['g1']).map((b) => b.id)).toEqual(['a', 'f']);
  });

  it('leaves the tree alone when nothing matches', () => {
    expect(removeBlocks(TREE, ['gibtsnicht'])).toEqual(TREE);
  });
});
