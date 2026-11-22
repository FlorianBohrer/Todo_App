/**
 * Links in Text: nackte Adressen („https://…") und Markdown-Links
 * („[Text](https://…)"), für Todos und Pläne dieselbe Regel.
 *
 * Nur http(s). Alles andere bleibt Text — ein „javascript:"-Link kann so gar
 * nicht erst entstehen.
 */
export interface LinkMatch {
  index: number;
  length: number;
  href: string;
  /** Bei Markdown-Links der Text in Klammern, sonst null. */
  label: string | null;
}

const LINK = /\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+)\)|https?:\/\/[^\s<>"'`]+/g;

/** Satzzeichen am Ende gehören zum Satz; „)" nur, wenn es in der Adresse keine offene „(" schließt. */
function trimEnd(url: string): string {
  const unbalanced = (u: string) => u.endsWith(')') && u.split(')').length > u.split('(').length;
  while (/[.,;:!?*_~]$/.test(url) || unbalanced(url)) url = url.slice(0, -1);
  return url;
}

export function findLinks(text: string): LinkMatch[] {
  const found: LinkMatch[] = [];
  for (const m of text.matchAll(LINK)) {
    const index = m.index ?? 0;
    if (m[2]) {
      found.push({ index, length: m[0].length, href: m[2], label: m[1].trim() });
      continue;
    }
    const href = trimEnd(m[0]);
    if (/^https?:\/\/\w/.test(href)) found.push({ index, length: href.length, href, label: null });
  }
  return found;
}

/** „https://www.github.com/a/b?x#y" → „github.com/a/b", lange Adressen gekürzt. */
export function shortUrl(href: string): string {
  const short = href
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
  return short.length > 40 ? `${short.slice(0, 39)}…` : short;
}
