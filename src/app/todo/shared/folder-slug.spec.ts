import { describe, expect, it } from 'vitest';

import { folderForSlug, folderMatches, folderSlug, folderSlugs, slugFromPath } from './folder-slug';

const labels = [
  { id: 'c1', name: 'Work' },
  { id: 'c2', name: 'Holiday planning for the summer' },
  { id: 'c3', name: 'Küche & Haushalt' },
  { id: 'c4', name: 'projekt: Bozen Live' },
  { id: 'c5', name: 'work!' },
  { id: 'c6', name: '🎉' },
];

describe('folderSlug', () => {
  it('makes a readable, typeable address from a name', () => {
    expect(folderSlug('Work')).toBe('work');
    expect(folderSlug('Holiday planning for the summer')).toBe('holiday-planning-for-the-summer');
    expect(folderSlug('  Spaces   everywhere  ')).toBe('spaces-everywhere');
  });

  it('writes umlauts the way one types them without a German keyboard', () => {
    expect(folderSlug('Küche & Haushalt')).toBe('kueche-haushalt');
    expect(folderSlug('Größe')).toBe('groesse');
    expect(folderSlug('Café Crème')).toBe('cafe-creme');
  });

  it('never contains a dot, so it can never look like a file', () => {
    expect(folderSlug('v1.2 release')).toBe('v1-2-release');
    expect(folderSlug('favicon.ico')).not.toContain('.');
  });

  it('keeps a prefix as part of the address', () => {
    expect(folderSlug('projekt: Bozen Live')).toBe('projekt-bozen-live');
  });

  it('is empty when nothing usable is left', () => {
    expect(folderSlug('🎉')).toBe('');
  });
});

describe('folderSlugs', () => {
  it('gives every folder its own address, in folder order', () => {
    const slugs = folderSlugs(labels);

    expect(slugs.get('c1')).toBe('work');
    expect(slugs.get('c5')).toBe('work-2');
    expect(slugs.get('c6')).toBe('folder-c6');
    expect(new Set(slugs.values()).size).toBe(labels.length);
  });
});

describe('folderForSlug', () => {
  it('reads generously: case, spaces and the id all lead to the folder', () => {
    expect(folderForSlug('work', labels)).toBe('c1');
    expect(folderForSlug('Work', labels)).toBe('c1');
    expect(folderForSlug('Holiday planning for the summer', labels)).toBe('c2');
    expect(folderForSlug('küche-haushalt', labels)).toBe('c3');
    expect(folderForSlug('c4', labels)).toBe('c4');
  });

  it('reaches the second of two folders with the same name', () => {
    expect(folderForSlug('work-2', labels)).toBe('c5');
  });

  it('finds folders by the short forms people actually type', () => {
    const real = [
      { id: 'w', name: 'Work' },
      { id: 'f', name: 'Free time' },
      { id: 'h', name: 'Holiday planning for the summer' },
      { id: 'p', name: 'projekt: Bozen Live' },
      { id: 'k', name: 'Haushalt' },
    ];

    expect(folderForSlug('freetime', real)).toBe('f'); // ohne Bindestrich
    expect(folderForSlug('Free Time', real)).toBe('f');
    expect(folderForSlug('bozen-live', real)).toBe('p'); // ohne Präfix
    expect(folderForSlug('holiday', real)).toBe('h'); // Anfang
    expect(folderForSlug('summer-holiday', real)).toBe('h'); // alle Wörter
    expect(folderForSlug('haus', real)).toBe('k');
  });

  it('does not guess between several folders', () => {
    // Kennungen wie echte (lang), damit /h nicht zufällig eine Kennung trifft.
    const real = [
      { id: 'id-holiday', name: 'Holiday' },
      { id: 'id-haushalt', name: 'Haushalt' },
    ];

    expect(folderMatches('h', real)).toEqual(['id-holiday', 'id-haushalt']);
    expect(folderForSlug('h', real)).toBeNull();
    expect(folderForSlug('ho', real)).toBe('id-holiday');
  });

  it('prefers the exact address over a longer folder it is the start of', () => {
    const real = [
      { id: 'a', name: 'Work stuff' },
      { id: 'b', name: 'Work' },
    ];

    expect(folderForSlug('work', real)).toBe('b');
  });

  it('returns null for an address that matches no folder', () => {
    expect(folderForSlug('nope', labels)).toBeNull();
    expect(folderForSlug('work', [])).toBeNull();
  });
});

describe('slugFromPath', () => {
  it('takes the first segment and decodes it', () => {
    expect(slugFromPath('/work')).toBe('work');
    expect(slugFromPath('/work/')).toBe('work');
    expect(slugFromPath('/work?view=week#top')).toBe('work');
    expect(slugFromPath('/K%C3%BCche')).toBe('Küche');
  });

  it('means "all folders" for the root', () => {
    expect(slugFromPath('')).toBeNull();
    expect(slugFromPath('/')).toBeNull();
  });

  it('survives broken encoding', () => {
    expect(slugFromPath('/%E0%A4%A')).toBe('%E0%A4%A');
  });
});
