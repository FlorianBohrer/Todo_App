import { findLinks, type LinkMatch } from '../shared/links';

/**
 * Kleines, bewusst begrenztes Inline-Markup für Plan-Texte — die Teilmenge,
 * die beim Schreiben tatsächlich benutzt wird: Code, fett, kursiv,
 * unterstrichen, durchgestrichen, Obsidian-Wikilinks und Web-Links.
 *
 * Sicherheit: Es wird IMMER zuerst escaped und erst danach die erlaubte
 * Auszeichnung eingesetzt. Aus Nutzertext kann so kein Markup entstehen.
 */

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
   * Wikilinks und Web-Links als Verweis darstellen.
   *
   * In Tabellenzellen nicht: dort faengt der Klick die Zelle zum Bearbeiten
   * ab. Ein Wort, das aussieht wie ein Verweis und beim Klick ein Textfeld
   * oeffnet, ist ein Versprechen, das nicht eingeloest wird — dann lieber
   * „[[Name]]" so stehen lassen, wie es getippt wurde.
   */
  links?: boolean;
}

/**
 * Ein Web-Link. Eine nackte Adresse steht im Feld so, wie sie getippt wurde —
 * der Editor liest den Text zurück. Ein Markdown-Link zeigt seine Beschriftung;
 * data-md sagt scanRich, dass er als „[Text](Adresse)" zurückgeschrieben wird.
 */
function anchorHtml(link: LinkMatch): string {
  const href = escapeHtml(link.href);
  const md = link.label === null ? '' : ' data-md=""';
  const text = escapeHtml(link.label ?? link.href);
  return `<a class="plan-link" href="${href}" title="${href}"${md} target="_blank" rel="noopener noreferrer">${text}</a>`;
}

/**
 * Formatiert eine Zeile zu sicherem HTML.
 *
 * Code-Spans werden zuerst herausgetrennt, damit ihr Inhalt wörtlich bleibt —
 * sonst würde `**` innerhalb von Code als Fettschrift gelesen.
 */
export function formatInline(raw: string, options: InlineOptions = {}): string {
  if (!raw) return '';
  const { links = true } = options;

  return raw
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        return `<code class="plan-code">${escapeHtml(part.slice(1, -1))}</code>`;
      }

      // Web-Links zuerst heraus und am Ende wieder hinein: Sternchen oder
      // Unterstriche in einer Adresse sind keine Auszeichnung.
      const anchors: string[] = [];
      let text = part;
      if (links) {
        text = '';
        let last = 0;
        for (const link of findLinks(part)) {
          text += `${part.slice(last, link.index)}\u0000${anchors.length}\u0000`;
          anchors.push(anchorHtml(link));
          last = link.index + link.length;
        }
        text += part.slice(last);
      }

      let out = escapeHtml(text);

      // Wikilinks vor den Betonungen: der Titel darf Sternchen enthalten.
      if (links) {
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

      return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => anchors[Number(i)] ?? '');
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
