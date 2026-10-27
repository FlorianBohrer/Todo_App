/**
 * Abschnitte in einem Ordner: „Diese Woche", „Warten auf", „Später".
 *
 * Ein Abschnitt ist eine Zeile wie ein Todo, nur mit dem Präfix „/section"
 * — dieselbe Idee wie „/sub" für Schritte: die Gliederung steht im Titel und
 * in der Reihenfolge, das Backend muss nichts davon wissen. Alles, was einem
 * Abschnitt folgt, gehört zu ihm, bis der nächste beginnt. Was vor dem ersten
 * steht, ist der Bereich ohne Überschrift (wie der Eingang einer Liste).
 *
 * Ein Abschnitt ist keine Aufgabe: kein Haken, kein Datum, nicht in Zählern,
 * Woche, Suche oder XP. Das sortiert der TodoService heraus (isSection).
 */

const PREFIX = '/section';

export function isSection(title: string): boolean {
  const t = title.trimStart();
  return t.toLowerCase().startsWith(PREFIX) && /\s/.test(t.charAt(PREFIX.length));
}

/** Der Name ohne Präfix. */
export function sectionName(title: string): string {
  return title.trimStart().slice(PREFIX.length).trim();
}

/** So wird ein Abschnitt gespeichert. */
export function sectionTitle(name: string): string {
  return `${PREFIX} ${name.trim()}`;
}

/** Index der Abschnittszeile, zu der `index` gehört; -1 = vor dem ersten. */
export function sectionStartOf(items: readonly { title: string }[], index: number): number {
  for (let i = index; i >= 0; i--) if (isSection(items[i].title)) return i;
  return -1;
}

/** Erste Zeile hinter dem Abschnitt, in dem `index` liegt (oder der dort beginnt). */
export function sectionEndOf(items: readonly { title: string }[], index: number): number {
  for (let i = index + 1; i < items.length; i++) if (isSection(items[i].title)) return i;
  return items.length;
}

/**
 * Abschnitte ohne Inhalt fallen weg — für Filter wie „Done" oder eine Suche,
 * wo eine leere Überschrift nur sagt, dass hier nichts passt. Unter „Active"
 * und „All" bleiben sie stehen: dort will man in sie hinein anlegen.
 */
export function pruneEmptySections<T extends { title: string }>(items: readonly T[]): T[] {
  return items.filter((item, i) => {
    if (!isSection(item.title)) return true;
    const next = items[i + 1];
    return next !== undefined && !isSection(next.title);
  });
}

/**
 * Ein Todo samt seinen Schritten ans Ende eines Abschnitts (null: ans Ende
 * des Bereichs vor dem ersten Abschnitt). `isStep` sagt, ob eine Zeile ein
 * Schritt ist — hier nicht noch einmal gelesen, um keinen Kreis zwischen den
 * Modulen zu bauen.
 */
export function moveToSection<T extends { id: string; title: string }>(
  items: readonly T[],
  movedId: string,
  sectionId: string | null,
  isStep: (title: string) => boolean,
): T[] {
  const from = items.findIndex((i) => i.id === movedId);
  if (from === -1 || isSection(items[from].title)) return [...items];

  let end = from + 1;
  while (end < items.length && isStep(items[end].title)) end++;
  const block = items.slice(from, end);
  const rest = [...items.slice(0, from), ...items.slice(end)];

  let at: number;
  if (sectionId === null) {
    const first = rest.findIndex((i) => isSection(i.title));
    at = first === -1 ? rest.length : first;
  } else {
    const start = rest.findIndex((i) => i.id === sectionId);
    if (start === -1) return [...items];
    at = sectionEndOf(rest, start);
  }
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
