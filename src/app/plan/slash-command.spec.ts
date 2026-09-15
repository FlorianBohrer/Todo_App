import { detectSlashToken } from './slash-command';

describe('detectSlashToken', () => {
  it('finds a command at the start of a block', () => {
    expect(detectSlashToken('/head', 5)).toEqual({ start: 0, query: 'head' });
  });

  it('finds a command in the middle of a line, after a space', () => {
    expect(detectSlashToken('some notes /table', 17)).toEqual({ start: 11, query: 'table' });
  });

  it('finds a command at the start of a later line', () => {
    expect(detectSlashToken('first\n/code', 11)).toEqual({ start: 6, query: 'code' });
  });

  it('reports an empty query right after typing the slash', () => {
    expect(detectSlashToken('text /', 6)).toEqual({ start: 5, query: '' });
  });

  it('ignores a slash glued to a word, so paths do not open the menu', () => {
    expect(detectSlashToken('src/app', 7)).toBeNull();
    expect(detectSlashToken('12/2026', 7)).toBeNull();
  });

  it('closes once a space follows the command', () => {
    expect(detectSlashToken('/table now', 10)).toBeNull();
  });

  it('returns nothing without a slash', () => {
    expect(detectSlashToken('plain text', 10)).toBeNull();
  });

  it('only looks left of the caret', () => {
    // Cursor steht vor dem „/" — das Kommando gehoert noch nicht dazu.
    expect(detectSlashToken('a /code', 2)).toBeNull();
  });

  it('survives a caret beyond the text', () => {
    expect(detectSlashToken('/x', 99)).toEqual({ start: 0, query: 'x' });
  });
});
