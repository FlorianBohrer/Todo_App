import { PlanBlock } from './plan.model';
import { contentKey, findUntitledSections, MIN_SECTION_CHARS } from './untitled-sections';

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

  it('leaves everything after a heading alone — that section is already listed', () => {
    const blocks = [heading('h'), text('a'), text('b'), text('c')];
    expect(findUntitledSections(blocks)).toEqual([]);
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

  it('counts a titled toggle as covering its contents', () => {
    const blocks = [group('g', 'Ein Titel', [text('inner')])];
    expect(findUntitledSections(blocks)).toEqual([]);
  });

  it('looks inside a toggle that has no title', () => {
    const blocks = [group('g', '  ', [text('inner')])];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['inner']);
  });

  it('lets a titled toggle cover what follows it, like a heading', () => {
    const blocks = [group('g', 'Ein Titel', []), text('after')];
    expect(findUntitledSections(blocks)).toEqual([]);
  });

  it('keeps a heading inside a toggle from covering the document after it', () => {
    // Die Überschrift gehört zum Toggle; danach beginnt wieder die obere Ebene.
    const blocks = [group('g', '', [heading('h'), text('inner')]), text('after')];
    expect(findUntitledSections(blocks).map((s) => s.id)).toEqual(['after']);
  });

  it('returns the text the model gets to see', () => {
    const blocks = [text('a', '  Ein Absatz über etwas Bestimmtes. '.padEnd(120, '.'))];
    const found = findUntitledSections(blocks);
    expect(found[0].text.startsWith('Ein Absatz')).toBe(true);
    expect(found[0].text.endsWith('.')).toBe(true);
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
