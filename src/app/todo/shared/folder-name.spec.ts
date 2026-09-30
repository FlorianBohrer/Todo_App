import { splitFolderName } from './folder-name';

describe('splitFolderName', () => {
  it('splits a short type off the front', () => {
    expect(splitFolderName('projekt: Bozen Live Impact Twin')).toEqual({
      prefix: 'projekt',
      name: 'Bozen Live Impact Twin',
    });
  });

  it('works when both halves are the same word', () => {
    // „privat: privat" stand oben als ein Zug da — genau der Fall.
    expect(splitFolderName('privat: privat')).toEqual({ prefix: 'privat', name: 'privat' });
  });

  it('leaves a name without a colon alone', () => {
    expect(splitFolderName('Einkaufen')).toEqual({ prefix: null, name: 'Einkaufen' });
  });

  it('does not turn a sentence into a chip', () => {
    // Ein Satz mit Doppelpunkt ist kein Typ. Zwei Grenzen halten ihn fern:
    // hoechstens zwei Woerter und hoechstens 14 Zeichen davor.
    expect(splitFolderName('Frage: warum eigentlich nicht')).toEqual({
      prefix: 'Frage',
      name: 'warum eigentlich nicht',
    });
    expect(splitFolderName('Das ist eine Frage: warum')).toEqual({
      prefix: null,
      name: 'Das ist eine Frage: warum',
    });
    expect(splitFolderName('einsehrlangerpräfix: Name')).toEqual({
      prefix: null,
      name: 'einsehrlangerpräfix: Name',
    });
  });

  it('needs something on both sides', () => {
    expect(splitFolderName('projekt:')).toEqual({ prefix: null, name: 'projekt:' });
    expect(splitFolderName(': Name')).toEqual({ prefix: null, name: ': Name' });
  });

  it('trims what it hands back', () => {
    expect(splitFolderName('  projekt :   Name  ')).toEqual({ prefix: 'projekt', name: 'Name' });
  });
});
