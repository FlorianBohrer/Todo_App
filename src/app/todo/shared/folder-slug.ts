/**
 * Folder in der Adresse: my-todo.app/work öffnet den Folder „Work".
 *
 * Der Teil hinter dem Schrägstrich wird aus dem Namen gebildet, nicht aus der
 * Kennung: eine Adresse, die man lesen, tippen und weitersagen kann. Dafür
 * muss sie aus jedem Namen etwas Eindeutiges und URL-Taugliches machen.
 */
import { splitFolderName } from './folder-name';

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

/** „free-time" und „freetime" sind für einen Menschen dasselbe Wort. */
const compact = (slug: string) => slug.replace(/-/g, '');

/**
 * Welche Folder kommen für diese Adresse in Frage?
 *
 * Großzügig beim Lesen, in dieser Reihenfolge — die erste Stufe mit einem
 * Treffer entscheidet:
 *
 * 1. genau die Adresse des Folders, oder seine Kennung
 * 2. dieselbe ohne Bindestriche: /freetime findet „Free time"
 * 3. der Name ohne Präfix: /bozen-live findet „projekt: Bozen Live"
 * 4. der Anfang: /holiday findet „Holiday planning for the summer"
 * 5. alle Wörter kommen vor: /summer-holiday findet denselben
 *
 * Mehr als ein Treffer heißt: die Adresse ist mehrdeutig — dann entscheidet
 * nicht die App, sondern der Mensch (siehe FolderRoute).
 */
export function folderMatches(
  segment: string,
  labels: readonly { id: string; name: string }[],
): string[] {
  const wanted = folderSlug(segment);
  const byId = labels.filter((label) => label.id === segment).map((label) => label.id);
  if (!wanted) return byId;

  const slugs = folderSlugs(labels);
  const entries = labels.map((label) => ({
    id: label.id,
    slug: slugs.get(label.id) ?? '',
    bare: folderSlug(splitFolderName(label.name).name),
  }));
  const words = wanted.split('-');

  const stages: ((entry: (typeof entries)[number]) => boolean)[] = [
    (e) => e.slug === wanted,
    (e) => compact(e.slug) === compact(wanted),
    (e) => e.bare === wanted || compact(e.bare) === compact(wanted),
    (e) => e.slug.startsWith(wanted) || compact(e.slug).startsWith(compact(wanted)),
    (e) => words.every((word) => e.slug.split('-').includes(word)),
  ];

  const exact = entries.filter(stages[0]).map((e) => e.id);
  if (exact.length > 0) return exact;
  if (byId.length > 0) return byId;

  for (const stage of stages.slice(1)) {
    const hits = entries.filter(stage).map((e) => e.id);
    if (hits.length > 0) return hits;
  }
  return [];
}

/** Der eine Folder zu dieser Adresse — null, wenn keiner oder mehrere passen. */
export function folderForSlug(
  segment: string,
  labels: readonly { id: string; name: string }[],
): string | null {
  const matches = folderMatches(segment, labels);
  return matches.length === 1 ? matches[0] : null;
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
