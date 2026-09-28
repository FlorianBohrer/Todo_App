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

// ---- Wieder auf ----
//
// Geschrieben wird nur ohne Kompression; gelesen werden muss auch mit. Ein
// Archiv, das der Nutzer hereinreicht, kommt aus irgendeinem Programm, und
// die packen alle. Das Auspacken selbst macht der Browser: „deflate-raw"
// ist genau das Verfahren, das ZIP als Nummer 8 fuehrt.

export class ZipError extends Error {}

/** Das Ende zuerst: dort steht, wo das Verzeichnis liegt. */
function findEnd(view: DataView): number {
  // Der Abschluss ist 22 Bytes lang und darf einen Kommentar bis 64 KB
  // hinter sich haben — weiter zurueck als das muss nicht gesucht werden.
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let at = view.byteLength - 22; at >= earliest; at--) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  throw new ZipError('Not a zip archive');
}

/**
 * Auspacken durch den Browser.
 *
 * Bewusst ohne Blob und ohne Response: beide koennen das zwar, sind aber
 * jeweils ein weiteres Stueck Umgebung, das vorhanden sein muss. Ein
 * ReadableStream und ein Leser reichen, und die gibt es ueberall, wo es
 * DecompressionStream gibt.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      // Die Kopie loest den Ausschnitt aus dem grossen Puffer heraus; der
      // Strom will einen eigenen, nicht geteilten Speicher.
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });

  const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Die Textdateien aus einem Archiv.
 *
 * Ordnereintraege und die Beilagen, die macOS mitschickt, fallen weg — sie
 * traegen keinen Inhalt, den jemand importieren wollte.
 */
export async function readZip(data: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > data.length || view.getUint32(at, true) !== 0x02014b50) {
      throw new ZipError('Damaged zip archive');
    }

    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (
      name.endsWith('/') ||
      name.startsWith('__MACOSX/') ||
      name.split('/').pop()?.startsWith('.')
    ) {
      continue;
    }
    if (offset + 30 > data.length || view.getUint32(offset, true) !== 0x04034b50) {
      throw new ZipError('Damaged zip archive');
    }

    // Der lokale Kopf hat eigene Laengen — die des Verzeichnisses gelten hier
    // nicht, manche Packer schreiben an beiden Stellen Verschiedenes.
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    const raw = data.subarray(start, start + size);

    let bytes: Uint8Array;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = await inflate(raw);
    else throw new ZipError(`Unsupported compression in ${name}`);

    // Die Pruefsumme steht nicht zur Zierde da. Beschaedigt liest sich eine
    // Textdatei nicht als Fehler, sondern als Text — nur eben als falscher.
    if (crc32(bytes) !== crc) throw new ZipError(`Damaged file in archive: ${name}`);

    out.push({ name, text: decoder.decode(bytes) });
  }

  return out;
}
