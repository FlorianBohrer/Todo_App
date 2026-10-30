import { THEME_KEY, readThemeChoice, resolveTheme } from './theme.service';

describe('readThemeChoice', () => {
  afterEach(() => localStorage.removeItem(THEME_KEY));

  it('is dark when nothing was chosen', () => {
    expect(readThemeChoice()).toBe('dark');
  });

  it('reads light and system', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(readThemeChoice()).toBe('light');
    localStorage.setItem(THEME_KEY, 'system');
    expect(readThemeChoice()).toBe('system');
  });

  it('falls back to dark for anything else', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(readThemeChoice()).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('keeps an explicit choice, whatever the system says', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('follows the system when asked to', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});
