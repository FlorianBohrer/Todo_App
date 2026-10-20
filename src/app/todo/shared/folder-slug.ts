/**
 * Folder in der Adresse: my-todo.app/work öffnet den Folder „Work".
 *
 * Der Teil hinter dem Schrägstrich wird aus dem Namen gebildet, nicht aus der
 * Kennung: eine Adresse, die man lesen, tippen und weitersagen kann. Dafür
 * muss sie aus jedem Namen etwas Eindeutiges und URL-Taugliches machen.
 */

/** Umlaute so, wie man sie ohne Tastatur schreibt — „Küche" → „kueche". */
const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * „Holiday planning for the summer" → „holiday-planning-for-the-summer".
 *
 * Kleinbuchstaben, Ziffern und Bindestriche, sonst nichts — insbesondere kein
 * Punkt: Pfade mit Punkt sind Dateien (favicon.ico, main-….js), und die
 * Weiterleitung auf die App (vercel.json) lässt genau die aus.
 * Akzente fallen weg („Café" → „cafe"). Bleibt nichts übrig (ein Name nur aus
 * Emoji), ist das Ergebnis leer.
 */
export function folderSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => TRANSLIT[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Die Adresse jedes Folders, eindeutig.
 *
 * Gleich lautende Namen („Work" und „work!") bekommen in der Reihenfolge der
 * Folder ein -2, -3 angehängt; ein Name ohne verwertbare Zeichen die ersten
 * acht Stellen seiner Kennung. So hat jeder Folder eine Adresse, und keine
 * zeigt auf zwei.
 */
export function folderSlugs(labels: readonly { id: string; name: string }[]): Map<string, string> {
  const taken = new Set<string>();
  const slugs = new Map<string, string>();

  for (const label of labels) {
    const base = folderSlug(label.name) || `folder-${folderSlug(label.id).slice(0, 8)}`;
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    slugs.set(label.id, slug);
  }

  return slugs;
}

/**
 * Welcher Folder ist mit dieser Adresse gemeint? null, wenn keiner.
 *
 * Großzügig beim Lesen: „/Work", „/work", „/Holiday%20planning…" und die
 * Kennung selbst führen alle zum selben Folder.
 */
export function folderForSlug(
  segment: string,
  labels: readonly { id: string; name: string }[],
): string | null {
  const wanted = folderSlug(segment);
  if (!wanted) return labels.find((label) => label.id === segment)?.id ?? null;

  for (const [id, slug] of folderSlugs(labels)) {
    if (slug === wanted) return id;
  }
  return labels.find((label) => label.id === segment)?.id ?? null;
}

/**
 * Der Folder-Teil eines Pfads: „/work?x=1" → „work", „/" → null.
 *
 * Nur das erste Segment zählt; was danach kommt, ist für spätere Erweiterungen
 * frei. Prozent-Kodierung wird aufgelöst, kaputte Kodierung ignoriert.
 */
export function slugFromPath(path: string): string | null {
  const segment = path.split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
