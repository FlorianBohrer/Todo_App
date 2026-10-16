import { formatFocus } from './focus-session.service';

describe('formatFocus', () => {
  it('stays short enough for a row', () => {
    expect(formatFocus(25 * 60)).toBe('25m');
    expect(formatFocus(80 * 60)).toBe('1h 20m');
    expect(formatFocus(120 * 60)).toBe('2h');
    expect(formatFocus(89)).toBe('1m');
  });
});
