import {
  AUTO_REST_KEY,
  CUSTOM_REST_KEY,
  autoGroupToken,
  collectionNames,
  groupFolders,
  reorderSections,
  toGlobalMove,
} from './folder-groups';
import type { Label } from '../services/label.service';

let nextId = 0;

function folder(
  name: string,
  collection: string | null = null,
  color = 'rose',
): Label {
  return {
    id: `f${++nextId}`,
    name,
    color,
    icon: 'tag',
    favoritePosition: null,
    isFavorite: false,
    collection,
  };
}

describe('autoGroupToken', () => {
  it('takes the prefix before a colon', () => {
    expect(autoGroupToken('projekt: Bozen Live')).toBe('projekt');
  });

  it('falls back to the first word when there is no colon', () => {
    expect(autoGroupToken('Bozen Live Impact')).toBe('Bozen');
  });

  it('ignores words too short to name a section', () => {
    expect(autoGroupToken('A')).toBeNull();
    expect(autoGroupToken('KW 38')).toBeNull();
  });

  it('ignores articles, which say nothing about the content', () => {
    expect(autoGroupToken('Die Woche')).toBeNull();
    expect(autoGroupToken('The Big Idea')).toBeNull();
    // "Uni" ist genauso lang wie "Die" und trotzdem ein gutes Anfangswort.
    expect(autoGroupToken('Uni Mathe')).toBe('Uni');
  });

  it('strips punctuation around the word', () => {
    expect(autoGroupToken('„Uni" Semester')).toBe('Uni');
  });
});

describe('groupFolders — flat', () => {
  it('returns everything in one nameless section', () => {
    const labels = [folder('Work'), folder('Freetime')];
    const groups = groupFolders(labels, 'flat');

    expect(groups).toHaveLength(1);
    expect(groups[0].labels).toEqual(labels);
    expect(groups[0].title).toBe('');
  });
});

describe('groupFolders — auto', () => {
  it('puts folders that start with the same word together', () => {
    const groups = groupFolders(
      [folder('projekt: Bozen'), folder('Work'), folder('projekt: Meran')],
      'auto',
    );

    expect(groups.map((g) => g.title)).toEqual(['projekt', 'Other']);
    expect(groups[0].labels.map((l) => l.name)).toEqual([
      'projekt: Bozen',
      'projekt: Meran',
    ]);
  });

  it('does not open a section for a word that occurs once', () => {
    const groups = groupFolders([folder('Uni Mathe'), folder('Work')], 'auto');

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(AUTO_REST_KEY);
    expect(groups[0].labels).toHaveLength(2);
  });

  it('treats upper and lower case as the same word', () => {
    const groups = groupFolders([folder('Uni Mathe'), folder('uni Physik')], 'auto');

    expect(groups).toHaveLength(1);
    expect(groups[0].labels).toHaveLength(2);
    // Die Schreibweise des ersten Folders benennt den Abschnitt.
    expect(groups[0].title).toBe('Uni');
  });

  it('orders sections by the first folder in them, not by size', () => {
    const groups = groupFolders(
      [
        folder('Uni Mathe'),
        folder('projekt: A'),
        folder('projekt: B'),
        folder('projekt: C'),
        folder('Uni Physik'),
      ],
      'auto',
    );

    expect(groups.map((g) => g.title)).toEqual(['Uni', 'projekt']);
  });

  it('keeps the original order of the leftovers', () => {
    const groups = groupFolders(
      [folder('Solo Eins'), folder('projekt: A'), folder('Einzel Zwei'), folder('projekt: B')],
      'auto',
    );

    const other = groups.find((g) => g.rest);
    expect(other?.labels.map((l) => l.name)).toEqual(['Solo Eins', 'Einzel Zwei']);
  });

  it('leaves no rest section when every folder found a group', () => {
    const groups = groupFolders([folder('projekt: A'), folder('projekt: B')], 'auto');

    expect(groups).toHaveLength(1);
    expect(groups[0].rest).toBe(false);
  });
});

describe('groupFolders — custom', () => {
  it('groups by the assigned collection and collects the rest', () => {
    const groups = groupFolders(
      [
        folder('Acme', 'Clients'),
        folder('Notes'),
        folder('Globex', 'Clients'),
        folder('Taxes', 'Admin'),
      ],
      'custom',
    );

    expect(groups.map((g) => g.title)).toEqual(['Clients', 'Admin', 'Unsorted']);
    expect(groups[2].key).toBe(CUSTOM_REST_KEY);
    expect(groups[2].labels.map((l) => l.name)).toEqual(['Notes']);
  });

  it('keeps a collection with a single folder — it was set on purpose', () => {
    const groups = groupFolders([folder('Acme', 'Clients'), folder('Notes')], 'custom');

    expect(groups[0].title).toBe('Clients');
    expect(groups[0].labels).toHaveLength(1);
  });

  it('treats a blank collection as unassigned', () => {
    const groups = groupFolders([folder('Acme', '   ')], 'custom');

    expect(groups).toHaveLength(1);
    expect(groups[0].rest).toBe(true);
  });
});

describe('groupFolders — section colour', () => {
  it('takes the colour its folders share', () => {
    const groups = groupFolders(
      [folder('projekt: A', null, 'teal'), folder('projekt: B', null, 'teal')],
      'auto',
    );

    expect(groups[0].color).toBe('teal');
  });

  it('takes the colour that wins the count, not the one standing first', () => {
    const groups = groupFolders(
      [
        folder('projekt: A', null, 'rose'),
        folder('projekt: B', null, 'sky'),
        folder('projekt: C', null, 'sky'),
      ],
      'auto',
    );

    expect(groups[0].color).toBe('sky');
  });

  it('breaks a tie with the folder the user put first', () => {
    const groups = groupFolders(
      [folder('projekt: A', null, 'amber'), folder('projekt: B', null, 'violet')],
      'auto',
    );

    expect(groups[0].color).toBe('amber');
  });

  it('leaves the leftovers neutral — they are not a group', () => {
    const groups = groupFolders(
      [folder('Solo Eins', null, 'teal'), folder('Einzel Zwei', null, 'teal')],
      'auto',
    );

    expect(groups[0].rest).toBe(true);
    expect(groups[0].color).toBeNull();
  });

  it('colours a custom collection the same way', () => {
    const groups = groupFolders(
      [folder('Acme', 'Clients', 'sky'), folder('Globex', 'Clients', 'sky')],
      'custom',
    );

    expect(groups[0].color).toBe('sky');
  });
});

describe('collectionNames', () => {
  it('lists each name once, alphabetically', () => {
    const names = collectionNames([
      folder('a', 'Work'),
      folder('b', 'Admin'),
      folder('c', 'work'),
      folder('d'),
    ]);

    expect(names).toEqual(['Admin', 'Work']);
  });
});

describe('toGlobalMove', () => {
  // [A, B, C, D] insgesamt, der Abschnitt zeigt nur A, C, D.
  const all = [folder('A'), folder('B'), folder('C'), folder('D')];
  const group = [all[0], all[2], all[3]];

  it('maps a move down inside the section onto the full list', () => {
    expect(toGlobalMove(all, group, 0, 2)).toEqual({
      previousIndex: 0,
      currentIndex: 3,
    });
  });

  it('maps a move up inside the section onto the full list', () => {
    expect(toGlobalMove(all, group, 2, 0)).toEqual({
      previousIndex: 3,
      currentIndex: 0,
    });
  });

  it('reports nothing to do when the folder stays put', () => {
    expect(toGlobalMove(all, group, 1, 1)).toBeNull();
  });

  it('reports nothing to do for an index outside the section', () => {
    expect(toGlobalMove(all, group, 0, 9)).toBeNull();
  });
});

describe('reorderSections', () => {
  it('moves a whole section and returns the new full order', () => {
    const sections = groupFolders(
      [
        folder('Uni Mathe'),
        folder('Uni Physik'),
        folder('projekt: A'),
        folder('projekt: B'),
      ],
      'auto',
    );

    const ids = reorderSections(sections, 1, 0);

    // Die projekt-Folder stehen jetzt vorn, jeder genau einmal.
    expect(ids).toEqual([
      sections[1].labels[0].id,
      sections[1].labels[1].id,
      sections[0].labels[0].id,
      sections[0].labels[1].id,
    ]);
  });

  it('keeps every folder exactly once — the order must stay complete', () => {
    const labels = [
      folder('Uni Mathe'),
      folder('projekt: A'),
      folder('Uni Physik'),
      folder('projekt: B'),
    ];
    const sections = groupFolders(labels, 'auto');
    const ids = reorderSections(sections, 0, 1);

    expect(ids).toHaveLength(labels.length);
    expect(new Set(ids).size).toBe(labels.length);
    expect([...(ids ?? [])].sort()).toEqual(labels.map((l) => l.id).sort());
  });

  it('reports nothing to do when the section stays put', () => {
    const sections = groupFolders([folder('projekt: A'), folder('projekt: B')], 'auto');
    expect(reorderSections(sections, 0, 0)).toBeNull();
  });

  it('reports nothing to do for an index outside the list', () => {
    const sections = groupFolders([folder('projekt: A'), folder('projekt: B')], 'auto');
    expect(reorderSections(sections, 0, 5)).toBeNull();
  });
});
