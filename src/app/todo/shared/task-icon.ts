/**
 * Ein Bild je Aufgabe, in einer Kachel vor dem Titel.
 *
 * Eine Liste aus lauter gleich aussehenden Zeilen liest man Wort für Wort.
 * Mit einem Bild davor findet das Auge „Zahnarzt" am Zahn, bevor es das Wort
 * gelesen hat. Gespeichert wird dafür nichts: steht vorn im Titel ein Emoji,
 * gilt das; sonst rät die App aus dem Text, und wenn sie nichts findet, steht
 * der erste Buchstabe da.
 *
 * Gezeichnet wird nicht das Emoji selbst, sondern ein Bild aus einem Guss
 * (task-glyphs.ts, Phosphor Duotone) in der Farbe des Ordners. System-Emoji
 * sahen auf jedem Gerät anders aus und standen bunt gegen die Ordnerfarbe.
 * Das Emoji bleibt der Schlüssel: Stichwörter, Vorschläge und ein selbst
 * vorangestelltes Emoji funktionieren wie bisher. Nur eins, für das es kein
 * Bild gibt (🎉), steht als Emoji da. Die Bilder selbst lädt TaskGlyph
 * nach (task-glyph.ts) — hier steht nur, welche Emoji eins haben.
 */

import { stripBold } from './rich-title';

/** Ein Emoji am Anfang, samt Variantenwahl und ZWJ-Folgen (🧑‍💻, ✈️). */
const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

export interface TaskIcon {
  /** Das Emoji, oder der erste Buchstabe, wenn keins passt. */
  glyph: string;
  /** true, wenn `glyph` ein Buchstabe ist und kein Bild. */
  initial: boolean;
  /** Gibt es zu `glyph` ein gezeichnetes Bild? Dann zeigt TaskGlyph das statt des Emoji. */
  drawn: boolean;
}

/** Ein Emoji ohne Variantenwähler (U+FE0F): „✈" und „✈️" sind dasselbe Bild. */
export function bareEmoji(emoji: string): string {
  return emoji.replace(/\uFE0F/g, '');
}

/**
 * Stichwörter → Emoji, Deutsch und Englisch. Die erste passende Zeile
 * gewinnt, deshalb steht Spezielles vor Allgemeinem: „Zahnarzt" vor „Arzt",
 * „Pflanzen gießen" vor „Wasser".
 *
 * Ab fünf Buchstaben passt ein Stichwort auch mitten im Wort — deutsche
 * Komposita: „Wocheneinkauf", „Steuererklärung". Kürzere nur als ganzes
 * Wort, sonst fände „run" sich in „Grund" und „auto" in „Automatisierung".
 */
const KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['🦷', ['zahnarzt', 'zahn', 'dentist', 'dental']],
  ['🪴', ['pflanze', 'gießen', 'giessen', 'houseplant', 'plants']],
  ['💧', ['wasser', 'trinken', 'water', 'drink']],
  ['💊', ['medikament', 'tablette', 'pille', 'pills', 'medicine', 'apotheke', 'pharmacy']],
  ['🩺', ['arzttermin', 'arztbesuch', 'arzt', 'doctor', 'praxis', 'vorsorge', 'checkup', 'check-up']],
  ['🛒', ['einkauf', 'einkaufen', 'supermarkt', 'groceries', 'grocery', 'shopping', 'rewe', 'edeka', 'aldi', 'lidl']],
  ['🧺', ['wäsche', 'waesche', 'laundry', 'bügeln']],
  ['🧹', ['putzen', 'aufräumen', 'aufraeumen', 'staubsaug', 'tidy', 'clean', 'saugen']],
  ['🍽️', ['kochen', 'cook', 'essen', 'dinner', 'mittagessen', 'lunch', 'frühstück', 'breakfast', 'meal']],
  ['🏋️', ['gym', 'training', 'workout', 'fitness', 'sport']],
  ['🏃', ['joggen', 'laufen', 'running', 'run']],
  ['🧘', ['yoga', 'meditation', 'meditier', 'atmen', 'breathe']],
  ['🚶', ['spazier', 'walk', 'gassi']],
  ['📧', ['e-mail', 'email', 'mail', 'inbox', 'postfach']],
  ['📞', ['anrufen', 'telefon', 'phone', 'call']],
  ['🗓️', ['meeting', 'besprechung', 'termin', 'plan the week', 'wochenplan', 'planen', 'planning']],
  ['📊', ['präsentation', 'praesentation', 'presentation', 'folien', 'slides', 'excel', 'auswertung', 'quartal', 'report']],
  ['📝', ['bericht', 'schreiben', 'write', 'notiz', 'notes', 'dokument', 'doku', 'protokoll', 'entwurf', 'draft']],
  ['💻', ['programm', 'deploy', 'release', 'refactor', 'code', 'coden', 'bug', 'fix', 'api', 'server', 'mqtt', 'review', 'pr']],
  ['📚', ['lesen', 'buch', 'lernen', 'studium', 'study', 'learn', 'read', 'book', 'kurs', 'course']],
  ['💰', ['rechnung', 'steuer', 'überweis', 'ueberweis', 'bezahl', 'invoice', 'tax', 'bank', 'budget', 'pay']],
  ['🎁', ['geschenk', 'geburtstag', 'gift', 'birthday']],
  ['🐶', ['hund', 'dog', 'tierarzt', 'vet']],
  ['🐱', ['katze', 'cat']],
  ['🚗', ['tanken', 'werkstatt', 'reifen', 'auto', 'car']],
  ['✈️', ['flug', 'urlaub', 'reise', 'koffer', 'flight', 'travel', 'trip', 'packen']],
  ['📦', ['paket', 'versand', 'package', 'parcel', 'post']],
  ['🏠', ['wohnung', 'umzug', 'miete', 'haus', 'move']],
  ['🧾', ['formular', 'antrag', 'behörde', 'behoerde', 'vertrag', 'kündig']],
  ['✂️', ['friseur', 'haare', 'haircut']],
  ['🛏️', ['schlafen', 'sleep', 'bett']],
  ['🎵', ['musik', 'music', 'gitarre', 'klavier', 'piano', 'üben']],
  ['🧠', ['brainstorm', 'nachdenken', 'idee', 'ideen', 'think', 'idea']],
  ['🎯', ['deep work', 'fokus', 'focus', 'konzentr']],
];

const LONG = 5;

/** Wortanfang: am Anfang oder hinter einem Zeichen, das kein Buchstabe ist. */
function startsWord(text: string, at: number): boolean {
  return at === 0 || !/\p{L}/u.test(text.charAt(at - 1));
}

function matches(text: string, keyword: string): boolean {
  if (keyword.length >= LONG) return text.includes(keyword);
  let at = text.indexOf(keyword);
  while (at !== -1) {
    const end = at + keyword.length;
    if (startsWord(text, at) && (end === text.length || !/\p{L}/u.test(text.charAt(end)))) return true;
    at = text.indexOf(keyword, at + 1);
  }
  return false;
}

/** Das Emoji, das zu einem Text passt, oder null. */
export function guessEmoji(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [emoji, words] of KEYWORDS) {
    if (words.some((w) => matches(lower, w))) return emoji;
  }
  return null;
}

/**
 * Ein Emoji vorn im Text, und der Text ohne es. So steht es in der Zeile:
 * das Bild im Kreis, die Worte daneben.
 */
export function splitLeadingEmoji(text: string): { emoji: string | null; rest: string } {
  const m = LEADING_EMOJI.exec(text);
  if (!m || m[0].length === text.length) return { emoji: null, rest: text };
  return { emoji: m[1], rest: text.slice(m[0].length) };
}

/**
 * Das Bild einer Aufgabe — aus ihrem Anzeigetext (ohne Präfixe).
 * Leer bleibt der Kreis nie: notfalls steht der erste Buchstabe da.
 */
export function taskIcon(text: string): TaskIcon {
  // Fett gesetzt (rich-title.ts) ist dasselbe Bild: „**🦷 Zahnarzt**" wie „🦷 Zahnarzt".
  const { emoji, rest } = splitLeadingEmoji(stripBold(text).trim());
  const found = emoji ?? guessEmoji(rest);
  if (found) return { glyph: found, initial: false, drawn: DRAWN.has(bareEmoji(found)) };
  const letter = /\p{L}|\p{N}/u.exec(rest)?.[0] ?? '•';
  return { glyph: letter.toUpperCase(), initial: true, drawn: false };
}

/** Jedes Emoji, das die App aus Stichwörtern vergibt. Für jedes gibt es ein Bild (task-icon.spec.ts prüft es). */
export const KEYWORD_EMOJIS: readonly string[] = KEYWORDS.map(([emoji]) => emoji);
const DRAWN = new Set(KEYWORD_EMOJIS.map(bareEmoji));
