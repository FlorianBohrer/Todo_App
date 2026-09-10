/**
 * Trennt einen Prefix wie "projekt:" vom eigentlichen Namen ab.
 *
 * "projekt: Bozen Live Impact Twin" wird sonst einzeilig abgeschnitten und
 * liest sich wie kaputter Text — als Chip plus Name bleibt beides erkennbar
 * und das Raster ruhig.
 */
export interface FolderNameParts {
  /** Kurzer Typ vor dem Doppelpunkt, sonst null. */
  prefix: string | null;
  name: string;
}

// Höchstens zwei Wörter und 14 Zeichen vor dem Doppelpunkt: ein Satz wie
// "Frage: warum …" soll kein Chip werden, "projekt: …" schon.
const PREFIX = /^\s*([\p{L}\d][\p{L}\d _-]{0,13}):\s*(\S.*)$/u;

export function splitFolderName(raw: string): FolderNameParts {
  const match = raw.match(PREFIX);
  if (!match) return { prefix: null, name: raw.trim() };
  const [, prefix, name] = match;
  if (prefix.trim().split(/\s+/).length > 2) return { prefix: null, name: raw.trim() };
  return { prefix: prefix.trim(), name: name.trim() };
}
