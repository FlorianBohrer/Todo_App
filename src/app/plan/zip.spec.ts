import { zipBytes } from './zip';

/**
 * Ein winziger Leser, um das Geschriebene wieder auseinanderzunehmen.
 *
 * Er geht denselben Weg wie ein echtes Entpackprogramm: Abschluss suchen,
 * Verzeichnis lesen, von dort in die Dateien springen. Damit prueft der Test
 * das FORMAT und nicht bloss, dass die Funktion dieselben Bytes liefert wie
 * beim letzten Mal.
 *
 * Gegen `unzip` selbst ist es ausserdem geprueft — das kann eine Testumgebung
 * ohne Dateisystem nicht, und deshalb steht es hier nur als Hinweis: ein
 * Archiv aus dieser Funktion laesst sich mit unzip und Pythons zipfile oeffnen.
 */
function readZip(bytes: Uint8Array): { name: string; text: string }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  // Abschluss steht am Ende (ohne Kommentar: die letzten 22 Bytes).
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const out: { name: string; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    const size = view.getUint32(at + 24, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // Am lokalen Kopf haengen die Daten.
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const localName = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + extra;

    out.push({ name, text: decoder.decode(bytes.subarray(start, start + size)) });
    at += 46 + nameLength;
  }
  return out;
}

describe('makeZip', () => {
  it('writes an archive that can be read back', async () => {
    const entries = [
      { name: 'Eins.md', text: '# Eins\n\nText.\n' },
      { name: 'Zwei.md', text: '- [x] fertig\n' },
    ];

    expect(readZip(await zipBytes(entries))).toEqual(entries);
  });

  it('keeps umlauts in names and in content', async () => {
    // Ohne das UTF-8-Kennzeichen (Bit 11) liest Windows „Größe" als Salat.
    const entries = [{ name: 'Größe & Länge.md', text: 'Fußnote: 30 °C\n' }];
    expect(readZip(await zipBytes(entries))).toEqual(entries);
  });

  it('handles an empty file and an empty archive', async () => {
    expect(readZip(await zipBytes([{ name: 'leer.md', text: '' }]))).toEqual([
      { name: 'leer.md', text: '' },
    ]);
    expect(readZip(await zipBytes([]))).toEqual([]);
  });

  it('starts with the signature every tool looks for', async () => {
    const bytes = await zipBytes([{ name: 'a.md', text: 'a' }]);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('marks the names as UTF-8', async () => {
    const bytes = await zipBytes([{ name: 'a.md', text: 'a' }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('never writes a date before 1980 — the format has none', async () => {
    const bytes = await zipBytes([{ name: 'a.md', text: 'a' }], new Date('1970-01-01T00:00:00Z'));
    const view = new DataView(bytes.buffer);
    const day = view.getUint16(12, true);
    expect(day >> 9).toBe(0); // Jahr 1980
  });
});
