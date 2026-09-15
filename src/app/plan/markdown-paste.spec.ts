import { parseMarkdownBlocks } from './markdown-paste';

describe('parseMarkdownBlocks', () => {
  it('keeps a single line as one text block, so a normal paste stays normal', () => {
    expect(parseMarkdownBlocks('just some text')).toEqual([
      { kind: 'text', text: 'just some text' },
    ]);
  });

  it('reads the three heading levels', () => {
    expect(parseMarkdownBlocks('# One\n## Two\n### Three')).toEqual([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 2, text: 'Two' },
      { kind: 'heading', level: 3, text: 'Three' },
    ]);
  });

  it('groups consecutive bullets into one list', () => {
    expect(parseMarkdownBlocks('- one\n- two\n* three')).toEqual([
      {
        kind: 'list',
        variant: 'bullet',
        items: [
          { text: 'one', checked: false },
          { text: 'two', checked: false },
          { text: 'three', checked: false },
        ],
      },
    ]);
  });

  it('groups numbered items, accepting both "1." and "1)"', () => {
    expect(parseMarkdownBlocks('1. first\n2) second')).toEqual([
      {
        kind: 'list',
        variant: 'number',
        items: [
          { text: 'first', checked: false },
          { text: 'second', checked: false },
        ],
      },
    ]);
  });

  it('reads checklists and their ticked state', () => {
    expect(parseMarkdownBlocks('- [ ] open\n- [x] done\n[] bare')).toEqual([
      {
        kind: 'list',
        variant: 'todo',
        items: [
          { text: 'open', checked: false },
          { text: 'done', checked: true },
          { text: 'bare', checked: false },
        ],
      },
    ]);
  });

  it('prefers the checklist over the bullet, since "- [ ] " also starts with "- "', () => {
    const [block] = parseMarkdownBlocks('- [ ] task');
    expect(block.kind).toBe('list');
    expect(block).toMatchObject({ variant: 'todo' });
  });

  it('joins consecutive quote lines into one block', () => {
    expect(parseMarkdownBlocks('> first\n> second')).toEqual([
      { kind: 'quote', text: 'first\nsecond' },
    ]);
  });

  it('reads a fenced code block with its language', () => {
    expect(parseMarkdownBlocks('```bash\nnpm ci\nng build\n```')).toEqual([
      { kind: 'code', language: 'bash', code: 'npm ci\nng build' },
    ]);
  });

  it('runs an unclosed fence to the end instead of losing the rest', () => {
    expect(parseMarkdownBlocks('```\nstill code')).toEqual([
      { kind: 'code', language: '', code: 'still code' },
    ]);
  });

  it('treats "---" as a divider, not as an empty bullet', () => {
    expect(parseMarkdownBlocks('a\n\n---\n\nb')).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'divider' },
      { kind: 'text', text: 'b' },
    ]);
  });

  it('splits paragraphs on blank lines and keeps wrapped lines together', () => {
    expect(parseMarkdownBlocks('one\nstill one\n\ntwo')).toEqual([
      { kind: 'text', text: 'one\nstill one' },
      { kind: 'text', text: 'two' },
    ]);
  });

  it('ends a paragraph when the next block starts without a blank line', () => {
    expect(parseMarkdownBlocks('intro\n## Section')).toEqual([
      { kind: 'text', text: 'intro' },
      { kind: 'heading', level: 2, text: 'Section' },
    ]);
  });

  it('handles CRLF input', () => {
    expect(parseMarkdownBlocks('# Title\r\n- item')).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'list', variant: 'bullet', items: [{ text: 'item', checked: false }] },
    ]);
  });

  it('returns nothing for empty or blank input', () => {
    expect(parseMarkdownBlocks('')).toEqual([]);
    expect(parseMarkdownBlocks('\n\n  \n')).toEqual([]);
  });

  it('walks a mixed document in order', () => {
    const kinds = parseMarkdownBlocks(
      ['# Title', 'Intro line', '', '## Keys', '- one', '- two', '', '> note', '', '---'].join('\n'),
    ).map((b) => b.kind);

    expect(kinds).toEqual(['heading', 'text', 'heading', 'list', 'quote', 'divider']);
  });
});
