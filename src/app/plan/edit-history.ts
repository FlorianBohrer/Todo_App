/**
 * Wann ist Tippen noch derselbe Zug?
 *
 * Jeder Tastendruck aendert das Dokument, also kaeme jeder Tastendruck auf den
 * Rueckgaengig-Stapel. Ein Rueckgaengig, das einen Buchstaben zurueckholt, ist
 * aber keins — man will den Satz zurueck, nicht das „n".
 *
 * Zusammengefasst wird deshalb, solange drei Dinge stimmen: es ist dieselbe
 * Stelle, es kam ohne laengere Pause, und der Fluss laeuft noch nicht ewig. Die
 * Pause ist das eigentliche Signal: wer absetzt, hat einen Gedanken beendet.
 * Die Obergrenze verhindert nur, dass ein Absatz am Stueck ein einziger Zug
 * wird — sonst nimmt ein Rueckgaengig zehn Minuten Arbeit mit.
 */
export interface TypingRun {
  /** Welche Stelle geschrieben wird — Block, Listeneintrag, Tabellenzelle. */
  key: string | null;
  /** Letzter Anschlag. */
  at: number;
  /** Beginn des Flusses. */
  since: number;
}

/** Pause, nach der Tippen als neuer Zug zaehlt. */
export const TYPING_GAP = 700;
/** Und spaetestens dann, damit ein langer Fluss nicht ein einziger Zug wird. */
export const TYPING_RUN = 4000;

export function continuesRun(
  run: TypingRun | null,
  key: string | null,
  now: number,
): boolean {
  if (key === null || run === null || run.key !== key) return false;
  return now - run.at < TYPING_GAP && now - run.since < TYPING_RUN;
}
