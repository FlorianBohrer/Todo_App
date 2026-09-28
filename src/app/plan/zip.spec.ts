import { readZip, ZipError, zipBytes } from './zip';

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
function readByHand(bytes: Uint8Array): { name: string; text: string }[] {
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

    expect(readByHand(await zipBytes(entries))).toEqual(entries);
  });

  it('keeps umlauts in names and in content', async () => {
    // Ohne das UTF-8-Kennzeichen (Bit 11) liest Windows „Größe" als Salat.
    const entries = [{ name: 'Größe & Länge.md', text: 'Fußnote: 30 °C\n' }];
    expect(readByHand(await zipBytes(entries))).toEqual(entries);
  });

  it('handles an empty file and an empty archive', async () => {
    expect(readByHand(await zipBytes([{ name: 'leer.md', text: '' }]))).toEqual([
      { name: 'leer.md', text: '' },
    ]);
    expect(readByHand(await zipBytes([]))).toEqual([]);
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

/**
 * Ein gepacktes Archiv, wie es andere Programme schreiben.
 *
 * Eigene Eintraege liegen unkomprimiert; jedes andere Packprogramm nimmt
 * Verfahren 8. Damit dieser Weg nicht ungeprueft bleibt, baut der Test hier
 * selbst eines — mit eigener Pruefsumme, die damit gleich die Tabelle in
 * zip.ts gegenrechnet.
 */
async function packedZip(name: string, text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const plain = encoder.encode(text);
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(plain);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new CompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const packed = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  chunks.reduce((at, chunk) => (packed.set(chunk, at), at + chunk.length), 0);

  let crc = 0xffffffff;
  for (const byte of plain) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const out = new Uint8Array(30 + nameBytes.length + packed.length + 46 + nameBytes.length + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => (view.setUint16(at, v, true), (at += 2));
  const u32 = (v: number) => (view.setUint32(at, v >>> 0, true), (at += 4));

  u32(0x04034b50);
  u16(20);
  u16(0x0800);
  u16(8);
  u16(0);
  u16(0);
  u32(crc);
  u32(packed.length);
  u32(plain.length);
  u16(nameBytes.length);
  u16(0);
  out.set(nameBytes, at);
  at += nameBytes.length;
  out.set(packed, at);
  at += packed.length;

  const directory = at;
  u32(0x02014b50);
  u16(20);
  u16(20);
  u16(0x0800);
  u16(8);
  u16(0);
  u16(0);
  u32(crc);
  u32(packed.length);
  u32(plain.length);
  u16(nameBytes.length);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(0);
  u32(0);
  out.set(nameBytes, at);
  at += nameBytes.length;

  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(1);
  u16(1);
  u32(at - directory);
  u32(directory);
  u16(0);
  return out;
}

describe('readZip', () => {
  it('reads back what makeZip wrote', async () => {
    const entries = [
      { name: 'Eins.md', text: '# Eins\n\nText.\n' },
      { name: 'Größe & Länge.md', text: 'Fußnote: 30 °C\n' },
    ];

    expect(await readZip(await zipBytes(entries))).toEqual(entries);
  });

  it('unpacks what another program packed', async () => {
    const text = '# Lang\n\n' + 'derselbe Satz, damit sich das Packen lohnt.\n'.repeat(40);
    const bytes = await packedZip('Gepackt.md', text);

    // Wirklich gepackt, nicht bloss abgelegt.
    expect(bytes.length).toBeLessThan(text.length);
    expect(await readZip(bytes)).toEqual([{ name: 'Gepackt.md', text }]);
  });

  it('leaves out folders and the litter macOS adds', async () => {
    const bytes = await zipBytes([
      { name: 'Ordner/', text: '' },
      { name: '__MACOSX/._Eins.md', text: 'Müll' },
      { name: 'Ordner/.DS_Store', text: 'Müll' },
      { name: 'Ordner/Eins.md', text: 'Da.' },
    ]);

    expect(await readZip(bytes)).toEqual([{ name: 'Ordner/Eins.md', text: 'Da.' }]);
  });

  it('says so instead of returning nonsense', async () => {
    await expect(readZip(new TextEncoder().encode('Das ist kein Archiv.'))).rejects.toBeInstanceOf(
      ZipError,
    );

    // Ein gekipptes Byte im Inhalt: die Pruefsumme faellt darauf nicht herein.
    // Der Inhalt beginnt hinter dem lokalen Kopf (30) und dem Namen (4).
    const damaged = await zipBytes([{ name: 'a.md', text: 'abc' }]);
    expect(damaged[34]).toBe(0x61); // „a" aus „abc"
    damaged[34] = 0x78;
    await expect(readZip(damaged)).rejects.toBeInstanceOf(ZipError);
  });
});
