/**
 * Links in Todo-Titeln und Plantexten.
 *
 * Erkannt wird, was man tatsächlich hineinkopiert oder tippt: eine nackte
 * Adresse („https://github.com/…", „www.example.com") und der Markdown-Link
 * „[Text](https://…)". Gespeichert bleibt immer der Text, wie er getippt
 * wurde; nur die Anzeige wird zum Link.
 *
 * Angezeigt wird eine nackte Adresse kurz: ohne „https://" und „www.", mit
 * „…" statt der mittleren Pfadteile („github.com/…/pull/52"). Die volle
 * Adresse steht im Tooltip und hinter dem Link. Eine Adresse von hundert
 * Zeichen sprengte sonst jede Zeile und jede Karte, und lesen will sie niemand.
 *
 * Sicherheit: Es werden nur http- und https-Adressen zu Links, nie
 * „javascript:" oder „data:". Das Muster lässt nichts anderes zu, und
 * `safeHref` prüft das Ergebnis noch einmal mit dem URL-Parser.
 */

export interface FoundLink {
  /** Stelle im Text, an der der Treffer beginnt bzw. endet (exklusiv). */
  start: number;
  end: number;
  /** Der Treffer, wie er im Text steht. */
  raw: string;
  /** Die Adresse, immer mit http(s). */
  href: string;
  /** Der Text eines Markdown-Links; null bei einer nackten Adresse. */
  label: string | null;
}

/** Eine Adresse, wie sie hinter „[Text](" stehen darf: Klammerpaare erlaubt. */
const MD_TARGET = String.raw`(?:https?:\/\/|www\.)[^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*`;
const MD_LINK = String.raw`\[([^\[\]\n]+)\]\((${MD_TARGET})\)`;
const BARE = String.raw`(?:https?:\/\/|www\.)[^\s<>"'\`]+`;

function linkPattern(): RegExp {
  return new RegExp(`${MD_LINK}|${BARE}`, 'gi');
}

/** Vor einer Adresse darf kein Wortzeichen stehen: „foohttps://" ist keine. */
const GLUED_BEFORE = /[\p{L}\p{N}_@./:-]/u;

/** Zeichen, die am Ende einer Adresse zum Satz gehören, nicht zur Adresse. */
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '*', '_', '~', '…']);

function count(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

/**
 * Satzzeichen hinten abschneiden: „(siehe https://x.de/a)." meint
 * „https://x.de/a". Eine schliessende Klammer bleibt, wenn sie zu einer
 * öffnenden in der Adresse gehört (Wikipedia: „…/Angular_(web_framework)").
 * Sternchen, Unter- und Tildestriche sind Fett, Unterstrichen, Durchgestrichen
 * um die Adresse herum.
 */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    const head = url.slice(0, end);
    if (TRAILING.has(c)) end--;
    else if (c === ')' && count(head, '(') < count(head, ')')) end--;
    else if (c === ']' && count(head, '[') < count(head, ']')) end--;
    else break;
  }
  return url.slice(0, end);
}

/** Die Adresse mit Schema, oder null, wenn es keine http(s)-Adresse ist. */
export function safeHref(target: string): string | null {
  const withScheme = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return withScheme;
  } catch {
    return null;
  }
}

function looksLikeHost(href: string): boolean {
  const host = new URL(href).hostname.replace(/^www\./, '');
  return host === 'localhost' || /^[^.]+(\.[^.]+)+$/.test(host);
}

/** Alle Links eines Textes, von vorn nach hinten, ohne Überschneidung. */
export function findLinks(text: string): FoundLink[] {
  if (!text || !/https?:\/\/|www\./i.test(text)) return [];
  const found: FoundLink[] = [];
  for (const match of text.matchAll(linkPattern())) {
    const start = match.index ?? 0;
    if (match[1] !== undefined) {
      const href = safeHref(match[2]);
      if (href) found.push({ start, end: start + match[0].length, raw: match[0], href, label: match[1] });
      continue;
    }
    if (start > 0 && GLUED_BEFORE.test(text[start - 1])) continue;
    const raw = trimTrailing(match[0]);
    const href = safeHref(raw);
    // „https://" allein oder „www.ab" ist noch keine Adresse: der Host braucht
    // einen Punkt (oder ist localhost).
    if (href && looksLikeHost(href)) found.push({ start, end: start + raw.length, raw, href, label: null });
  }
  return found;
}

/** Steht im Text wenigstens ein Link? */
export function hasLink(text: string): boolean {
  return findLinks(text).length > 0;
}

/** Ein Text in Stücke zerlegt: Text dazwischen und die Links. */
export type LinkPiece = { text: string; link: null } | { text: string; link: FoundLink };

export function splitLinks(text: string): LinkPiece[] {
  const pieces: LinkPiece[] = [];
  let last = 0;
  for (const link of findLinks(text)) {
    if (link.start > last) pieces.push({ text: text.slice(last, link.start), link: null });
    pieces.push({ text: linkText(link), link });
    last = link.end;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), link: null });
  return pieces;
}

/**
 * Eine Adresse in ihre sichtbaren Teile zerlegt. Zusammengesetzt ergeben sie
 * genau den Text, wie er dasteht — der Planungsmodus zeigt die Teile im Feld
 * und blendet beim Lesen nur einige aus (inline-format.ts).
 *
 *   https://www.github.com/FlorianBohrer/Todo_App/pull/52?tab=files
 *   scheme  www  host      mid                   tail     rest
 *
 * `mid` sind die Pfadteile vor den letzten beiden; die letzten beiden sagen
 * meist am meisten („pull/52", „wiki/Angular").
 */
export interface UrlParts {
  scheme: string;
  www: string;
  host: string;
  mid: string;
  tail: string;
  rest: string;
}

/** Längster Pfad, der hinter dem Host noch ganz steht. */
const TAIL_MAX = 30;
/** Längster einzelner Pfadteil in der Kurzform. */
const SEGMENT_MAX = 24;

export function urlParts(raw: string): UrlParts {
  const m = /^(https?:\/\/)?(www\.)?([^/?#]*)([^?#]*)(.*)$/i.exec(raw);
  if (!m) return { scheme: '', www: '', host: raw, mid: '', tail: '', rest: '' };
  const [, scheme = '', www = '', host, path, rest] = m;
  const trimmed = path.replace(/\/+$/, '');
  const trailing = path.slice(trimmed.length);
  const segments = trimmed.split('/').slice(1);
  // Die letzten beiden Teile, wenn sie zusammen kurz genug sind, sonst nur
  // der letzte: „docs.google.com/…/edit" statt einer Dokument-Kennung von
  // vierzig Zeichen.
  const lastTwo = segments.slice(-2).join('/').length + 1;
  const keep = segments.length >= 2 && lastTwo <= TAIL_MAX ? 2 : 1;
  if (segments.length <= keep) return { scheme, www, host, mid: '', tail: path, rest };
  return {
    scheme,
    www,
    host,
    mid: '/' + segments.slice(0, -keep).join('/'),
    tail: '/' + segments.slice(-keep).join('/') + trailing,
    rest,
  };
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Die Kurzform einer Adresse: „github.com/…/pull/52". Ohne Schema, „www.",
 * Abfrage und Anker; der Host klein, Prozent-Kodierung lesbar gemacht.
 */
export function shortUrl(raw: string): string {
  const { host, mid, tail } = urlParts(raw);
  let path = decode(tail.replace(/\/+$/, ''));
  if (path.length > TAIL_MAX) {
    // Auch der letzte Teil allein ist zu lang: gekürzt.
    const cut = path.lastIndexOf('/') + 1;
    let last = path.slice(cut);
    if (last.length > SEGMENT_MAX) last = last.slice(0, SEGMENT_MAX - 1) + '…';
    path = path.slice(0, cut) + last;
  }
  return `${host.toLowerCase()}${mid ? '/…' : ''}${path}`;
}

/** Was von einem Link zu lesen ist: sein Text, sonst die Kurzform. */
export function linkText(link: FoundLink): string {
  return link.label ?? shortUrl(link.raw);
}

/** Der Text mit Links als lesbarer Klartext — für Tooltips, Meldungen, Vorlesen. */
export function stripLinks(text: string): string {
  return splitLinks(text)
    .map((piece) => piece.text)
    .join('');
}

/**
 * Eine Adresse über markierten Text einfügen macht einen Link daraus:
 * „Angebot" markiert, „https://…" eingefügt → „[Angebot](https://…)". So
 * machen es Notion, Slack und GitHub. Ohne Markierung oder wenn das
 * Eingefügte keine einzelne Adresse ist: null, eingefügt wird wie immer.
 */
export function linkOverSelection(selected: string, pasted: string): string | null {
  const url = pasted.trim();
  const label = selected.trim();
  if (!label || /[\n\[\]]/.test(label) || /\s/.test(url)) return null;
  const links = findLinks(url);
  if (links.length !== 1 || links[0].raw !== url || links[0].label !== null) return null;
  // Ist die Markierung selbst schon eine Adresse, bleibt es beim Ersetzen.
  if (hasLink(label)) return null;
  return `[${label}](${url})`;
}
