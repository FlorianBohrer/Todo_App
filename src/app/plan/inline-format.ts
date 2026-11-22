/**
 * Kleines, bewusst begrenztes Inline-Markup für Plan-Texte — die Teilmenge,
 * die beim Schreiben tatsächlich benutzt wird: Code, fett, kursiv,
 * unterstrichen, durchgestrichen, Obsidian-Wikilinks und Links
 * (shared/links.ts).
 *
 * Sicherheit: Es wird IMMER zuerst escaped und erst danach die erlaubte
 * Auszeichnung eingesetzt. Aus Nutzertext kann so kein Markup entstehen.
 * Links werden vorher als Platzhalter herausgenommen und danach als fertiges,
 * escaptes HTML eingesetzt; als Ziel kommen nur http(s)-Adressen in Frage.
 */
import { type FoundLink, findLinks, urlParts } from '../shared/links';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Wikilink-Ziele eines Textes — für Backlinks und das Auflösen von Klicks. */
export function wikiLinkTargets(raw: string): string[] {
  return [...raw.matchAll(/\[\[([^\[\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean);
}

export interface InlineOptions {
  /**
   * Wikilinks als Verweis darstellen.
   *
   * In Tabellenzellen nicht: dort faengt der Klick die Zelle zum Bearbeiten
   * ab. Ein Wort, das aussieht wie ein Verweis und beim Klick ein Textfeld
   * oeffnet, ist ein Versprechen, das nicht eingeloest wird — dann lieber
   * „[[Name]]" so stehen lassen, wie es getippt wurde.
   */
  wikiLinks?: boolean;
}

/**
 * Ein Link als HTML.
 *
 * Eine nackte Adresse steht im Feld vollständig, aufgeteilt in Stücke, die
 * zusammen genau den getippten Text ergeben: so liest der Editor sie als den
 * Text zurück, der dasteht (rich-text.ts). Beim Lesen blendet das Stylesheet
 * Schema, „www.", die mittleren Pfadteile und die Abfrage aus
 * („github.com/…/pull/52"); beim Schreiben steht alles da.
 *
 * Ein Markdown-Link zeigt seinen Text; die Adresse steht im data-href, damit
 * der Editor „[Text](Adresse)" zurückschreiben kann.
 */
function renderLink(link: FoundLink): string {
  const attrs =
    `class="plan-url" href="${escapeHtml(link.href)}" title="${escapeHtml(link.href)}"` +
    ` target="_blank" rel="noopener noreferrer"`;
  if (link.label !== null) {
    const target = link.raw.slice(link.label.length + 3, -1);
    return `<a ${attrs} data-href="${escapeHtml(target)}">${escapeHtml(link.label)}</a>`;
  }
  const { scheme, www, host, mid, tail, rest } = urlParts(link.raw);
  // <wbr> nach jedem „/": eine lange Adresse bricht an ihren Teilen um,
  // nicht mitten im Wort. Der Editor liest es nicht mit (kein Text).
  const piece = (text: string, cls?: string) => {
    if (!text) return '';
    const html = escapeHtml(text).replace(/\/(?=.)/g, '/<wbr>');
    return cls ? `<span class="${cls}">${html}</span>` : html;
  };
  return (
    `<a ${attrs}>` +
    piece(scheme + www, 'plan-url__hide') +
    piece(host) +
    piece(mid, 'plan-url__mid') +
    piece(tail, 'plan-url__tail') +
    piece(rest, 'plan-url__hide') +
    '</a>'
  );
}

/** Platzhalter für Links: Zeichen aus dem privaten Bereich, die niemand tippt. */
const HOLD_OPEN = '';
const HOLD_CLOSE = '';
const HOLD = /(\d+)/g;

/**
 * Formatiert eine Zeile zu sicherem HTML.
 *
 * Code-Spans werden zuerst herausgetrennt, damit ihr Inhalt wörtlich bleibt —
 * sonst würde `**` innerhalb von Code als Fettschrift gelesen. Links danach:
 * „__" oder „*" in einer Adresse sind keine Auszeichnung.
 */
export function formatInline(raw: string, options: InlineOptions = {}): string {
  if (!raw) return '';
  const { wikiLinks = true } = options;

  return raw
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        return `<code class="plan-code">${escapeHtml(part.slice(1, -1))}</code>`;
      }

      // Eine Adresse in „[[…]]" ist der Name eines Plans, kein Link.
      const named = wikiLinks ? [...part.matchAll(/\[\[[^\[\]]+\]\]/g)] : [];
      const links = findLinks(part).filter(
        ({ start }) => !named.some((m) => start > m.index! && start < m.index! + m[0].length),
      );
      let held = part;
      for (let i = links.length - 1; i >= 0; i--) {
        const { start, end } = links[i];
        held = held.slice(0, start) + HOLD_OPEN + i + HOLD_CLOSE + held.slice(end);
      }

      let out = escapeHtml(held);

      // Wikilinks vor den Betonungen: der Titel darf Sternchen enthalten.
      if (wikiLinks) {
        out = out.replace(
          /\[\[([^\[\]]+)\]\]/g,
          (_m, name: string) =>
            `<span class="plan-link" data-plan="${name.trim()}" role="link" tabindex="0">${name.trim()}</span>`,
        );
      }

      // Fett UND kursiv zuerst: sonst nimmt die Fett-Regel die beiden ersten
      // Sternchen und laesst ein einzelnes stehen, aus dem nichts mehr wird.
      out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Unterstreichen. Markdown kennt es nicht, also braucht es eine eigene
      // Schreibweise. __ statt _, weil einzelne Unterstriche mitten in
      // gewoehnlichem Text vorkommen (datei_name, snake_case) und dort nichts
      // unterstreichen sollen.
      out = out.replace(/__([^_]+)__/g, '<u>$1</u>');
      out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');

      return links.length ? out.replace(HOLD, (_m, i: string) => renderLink(links[Number(i)])) : out;
    })
    .join('');
}

/** Mehrzeiliger Text: jede Zeile formatiert, Umbrüche bleiben erhalten. */
export function formatBlock(raw: string, options: InlineOptions = {}): string {
  return raw
    .split('\n')
    .map((line) => formatInline(line, options))
    .join('<br>');
}
