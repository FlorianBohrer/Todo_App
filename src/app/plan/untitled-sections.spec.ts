import { PlanBlock } from './plan.model';
import {
  contentKey,
  findUntitledSections,
  needsHeading,
  MIN_SECTION_CHARS,
} from './untitled-sections';

const LONG = 'x'.repeat(MIN_SECTION_CHARS);
const SHORT = 'zu kurz';

function text(id: string, value = LONG): PlanBlock {
  return { id, type: 'text', text: value };
}
function heading(id: string, value = 'Eine Überschrift'): PlanBlock {
  return { id, type: 'heading', level: 1, text: value };
}
function group(id: string, title: string, blocks: PlanBlock[]): PlanBlock {
  return { id, type: 'group', title, collapsed: false, blocks };
}

describe('findUntitledSections', () => {
  it('finds a paragraph that stands before any heading', () => {
    const blocks = [text('a'), heading('h'), text('b')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['a']);
  });

  it('covers only the block directly under a heading, not the ones after it', () => {
    // Die Regel ist das UNMITTELBAR vorherige Element. Absatz b folgt auf a,
    // nicht auf die Ueberschrift — er braucht also eine eigene.
    const blocks = [heading('h'), text('a'), text('b'), text('c')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('counts a titled toggle as a heading for the block that follows it', () => {
    const blocks = [group('g', 'Ein Titel', []), text('after'), text('later')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['later']);
  });

  it('treats a document without any heading as untitled throughout', () => {
    const blocks = [text('a'), text('b')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('ignores an empty heading — it names nothing', () => {
    const blocks = [heading('h', '   '), text('a')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['a']);
  });

  it('skips paragraphs too short to deserve a tab', () => {
    const blocks = [text('a', SHORT), text('b', LONG)];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['b']);
  });

  it('reads a list as its items', () => {
    const blocks: PlanBlock[] = [
      {
        id: 'l',
        type: 'list',
        variant: 'bullet',
        items: [{ text: LONG, checked: false }],
      },
    ];
    const found = findUntitledSections(blocks);
    expect(found.map((s) => s.id)).toEqual(['l']);
    expect(found[0].text).toBe(LONG);
  });

  it('passes over blocks that carry their own label', () => {
    const blocks: PlanBlock[] = [
      { id: 'c', type: 'code', language: 'ts', code: LONG },
      { id: 'd', type: 'divider' },
      { id: 't', type: 'table', columns: ['a'], rows: [[LONG]] },
      { id: 'g', type: 'diagram', code: LONG },
    ];
    expect(findUntitledSections(blocks)).toEqual([]);
  });

  it('looks inside a toggle — its first block has no predecessor there', () => {
    const blocks = [group('g', 'Ein Titel', [text('inner')])];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['inner']);
  });

  it('applies the same rule inside a toggle', () => {
    const blocks = [group('g', '', [heading('h'), text('first'), text('second')])];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['second']);
  });

  it('returns the text the model gets to see', () => {
    const blocks = [text('a', '  Ein Absatz über etwas Bestimmtes. '.padEnd(120, '.'))];
    const found = findUntitledSections(blocks);
    expect(found[0].text.startsWith('Ein Absatz')).toBe(true);
    expect(found[0].text.endsWith('.')).toBe(true);
  });
});

describe('needsHeading', () => {
  it('says yes when the element right above is not a heading', () => {
    const blocks = [text('a'), text('b')];
    expect(needsHeading(blocks, 'b')).toBe(true);
  });

  it('says no when a heading sits directly above', () => {
    const blocks = [heading('h'), text('a')];
    expect(needsHeading(blocks, 'a')).toBe(false);
  });

  it('says yes for the very first block — there is nothing above it', () => {
    expect(needsHeading([text('a')], 'a')).toBe(true);
  });

  it('says no for a paragraph too short to name', () => {
    const blocks = [text('a', SHORT), text('b', SHORT)];
    expect(needsHeading(blocks, 'b')).toBe(false);
  });

  it('finds a block nested inside a toggle', () => {
    const blocks = [group('g', 'Titel', [text('x'), text('y')])];
    expect(needsHeading(blocks, 'y')).toBe(true);
    expect(needsHeading(blocks, 'x')).toBe(true); // erster im Toggle, kein Vorgaenger
  });

  it('says no for a block that is not there', () => {
    expect(needsHeading([text('a')], 'weg')).toBe(false);
  });
});

describe('contentKey', () => {
  it('is stable for the same text', () => {
    expect(contentKey('hallo welt')).toBe(contentKey('hallo welt'));
  });

  it('changes when the text changes', () => {
    expect(contentKey('hallo welt')).not.toBe(contentKey('hallo Welt'));
    expect(contentKey('a')).not.toBe(contentKey('b'));
  });

  it('survives an empty string', () => {
    expect(typeof contentKey('')).toBe('string');
  });
});
