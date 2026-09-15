import { detectMarkdownShortcut, detectWikiToken } from './editor-input';

describe('detectMarkdownShortcut', () => {
  it('maps the three heading levels, longest prefix first', () => {
    expect(detectMarkdownShortcut('# Title')).toEqual({ kind: 'heading1', rest: 'Title' });
    expect(detectMarkdownShortcut('## Title')).toEqual({ kind: 'heading2', rest: 'Title' });
    expect(detectMarkdownShortcut('### Title')).toEqual({ kind: 'heading3', rest: 'Title' });
  });

  it('recognises bulleted and numbered lists', () => {
    expect(detectMarkdownShortcut('- item')).toEqual({ kind: 'bullet', rest: 'item' });
    expect(detectMarkdownShortcut('* item')).toEqual({ kind: 'bullet', rest: 'item' });
    expect(detectMarkdownShortcut('1. step')).toEqual({ kind: 'number', rest: 'step' });
    expect(detectMarkdownShortcut('12. step')).toEqual({ kind: 'number', rest: 'step' });
  });

  it('prefers the checklist over the bullet, since "- [ ] " also starts with "- "', () => {
    expect(detectMarkdownShortcut('- [ ] task')).toEqual({ kind: 'todo', rest: 'task' });
    expect(detectMarkdownShortcut('[] task')).toEqual({ kind: 'todo', rest: 'task' });
    expect(detectMarkdownShortcut('- [x] task')).toEqual({ kind: 'todo', rest: 'task' });
  });

  it('recognises quote, code fence and divider', () => {
    expect(detectMarkdownShortcut('> cited')).toEqual({ kind: 'quote', rest: 'cited' });
    expect(detectMarkdownShortcut('```')).toEqual({ kind: 'code', rest: '' });
    expect(detectMarkdownShortcut('---')).toEqual({ kind: 'divider', rest: '' });
  });

  it('keeps the remaining text so nothing is lost on conversion', () => {
    expect(detectMarkdownShortcut('# A longer title here')).toEqual({
      kind: 'heading1',
      rest: 'A longer title here',
    });
  });

  it('ignores a marker that is not at the very start', () => {
    expect(detectMarkdownShortcut('text - item')).toBeNull();
    expect(detectMarkdownShortcut('see # 4')).toBeNull();
  });

  it('needs the separating space, so a word is left alone', () => {
    expect(detectMarkdownShortcut('#tag')).toBeNull();
    expect(detectMarkdownShortcut('-dash')).toBeNull();
  });

  it('does not fire on a partial fence or rule', () => {
    expect(detectMarkdownShortcut('``')).toBeNull();
    expect(detectMarkdownShortcut('--')).toBeNull();
    expect(detectMarkdownShortcut('---- ')).toBeNull();
  });
});

describe('detectWikiToken', () => {
  it('finds an open link and its query', () => {
    expect(detectWikiToken('see [[DB', 8)).toEqual({ start: 4, query: 'DB' });
  });

  it('reports an empty query right after the brackets', () => {
    expect(detectWikiToken('[[', 2)).toEqual({ start: 0, query: '' });
  });

  it('ignores a link that is already closed', () => {
    expect(detectWikiToken('[[Model]] and more', 18)).toBeNull();
  });

  it('stops at a line break', () => {
    expect(detectWikiToken('[[Model\nnext', 12)).toBeNull();
  });

  it('returns nothing without brackets', () => {
    expect(detectWikiToken('plain text', 10)).toBeNull();
  });

  it('only looks left of the caret', () => {
    expect(detectWikiToken('a [[Model', 1)).toBeNull();
  });
});
