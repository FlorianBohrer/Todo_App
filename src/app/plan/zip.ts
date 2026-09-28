/**
 * Ein ZIP-Archiv, von Hand geschrieben.
 *
 * Dafuer ein Paket zu laden hiesse, hundert Kilobyte in jedes Bundle zu
 * nehmen, damit ein Knopf gelegentlich ein paar Textdateien buendelt. Ohne
 * Kompression ist das Format klein genug, um es hinzuschreiben: je Datei ein
 * lokaler Kopf, danach das zentrale Verzeichnis, am Ende ein Abschluss. Die
 * Kompression waere der aufwendige Teil — und bei Markdown, das gleich danach
 * ausgepackt wird, der ueberfluessige.
 *
 * Geprueft gegen `unzip`, nicht nur gegen die eigene Vorstellung vom Format.
 */

/** CRC32, wie das Format es verlangt. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Datum und Uhrzeit im MS-DOS-Format von 1980 — das Format kennt nichts anderes. */
function dosStamp(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export interface ZipEntry {
  name: string;
  text: string;
}

interface Prepared {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

class Writer {
  private readonly parts: Uint8Array[] = [];
  private length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  get size(): number {
    return this.length;
  }

  /** Kopf fester Laenge, Felder in Little Endian. */
  header(spec: [size: 1 | 2 | 4, value: number][]): Uint8Array {
    const total = spec.reduce((n, [size]) => n + size, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    let at = 0;
    for (const [size, value] of spec) {
      if (size === 1) view.setUint8(at, value);
      else if (size === 2) view.setUint16(at, value, true);
      else view.setUint32(at, value >>> 0, true);
      at += size;
    }
    return out;
  }

  toBlob(): Blob {
    return new Blob(this.parts as BlobPart[], { type: 'application/zip' });
  }
}

/**
 * Baut das Archiv.
 *
 * Alle Eintraege liegen unkomprimiert („stored"), und der Name wird als UTF-8
 * gekennzeichnet — sonst liest Windows Umlaute in Dateinamen als Zeichensalat.
 */
export function makeZip(entries: readonly ZipEntry[], now = new Date()): Blob {
  const encoder = new TextEncoder();
  const { time, day } = dosStamp(now);
  const out = new Writer();
  const prepared: Prepared[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);
    const offset = out.size;

    out.push(
      out.header([
        [4, 0x04034b50], // lokaler Kopf
        [2, 20], // benoetigte Version
        [2, 0x0800], // Bit 11: Name ist UTF-8
        [2, 0], // Verfahren: gespeichert
        [2, time],
        [2, day],
        [4, crc],
        [4, data.length], // komprimiert = unkomprimiert
        [4, data.length],
        [2, name.length],
        [2, 0], // kein Zusatzfeld
      ]),
    );
    out.push(name);
    out.push(data);

    prepared.push({ name, data, crc, offset });
  }

  const directoryStart = out.size;
  for (const file of prepared) {
    out.push(
      out.header([
        [4, 0x02014b50], // Verzeichniseintrag
        [2, 20], // erzeugt von
        [2, 20], // benoetigte Version
        [2, 0x0800],
        [2, 0],
        [2, time],
        [2, day],
        [4, file.crc],
        [4, file.data.length],
        [4, file.data.length],
        [2, file.name.length],
        [2, 0], // Zusatzfeld
        [2, 0], // Kommentar
        [2, 0], // Datentraeger
        [2, 0], // interne Attribute
        [4, 0], // externe Attribute
        [4, file.offset],
      ]),
    );
    out.push(file.name);
  }

  const directorySize = out.size - directoryStart;
  out.push(
    out.header([
      [4, 0x06054b50], // Abschluss
      [2, 0], // Datentraeger
      [2, 0],
      [2, prepared.length],
      [2, prepared.length],
      [4, directorySize],
      [4, directoryStart],
      [2, 0], // kein Kommentar
    ]),
  );

  return out.toBlob();
}

/** Nur fuer die Pruefung: dieselben Bytes ohne Blob. */
export function zipBytes(entries: readonly ZipEntry[], now = new Date()): Promise<Uint8Array> {
  return makeZip(entries, now)
    .arrayBuffer()
    .then((buffer) => new Uint8Array(buffer));
}
