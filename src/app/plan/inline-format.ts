/**
 * Kleines, bewusst begrenztes Inline-Markup für Plan-Texte — die Teilmenge,
 * die beim Schreiben tatsächlich benutzt wird: Code, fett, kursiv,
 * durchgestrichen und Obsidian-Wikilinks.
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

/**
 * Formatiert eine Zeile zu sicherem HTML.
 *
 * Code-Spans werden zuerst herausgetrennt, damit ihr Inhalt wörtlich bleibt —
 * sonst würde `**` innerhalb von Code als Fettschrift gelesen.
 */
export function formatInline(raw: string): string {
  if (!raw) return '';

  return raw
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        return `<code class="plan-code">${escapeHtml(part.slice(1, -1))}</code>`;
      }

      let out = escapeHtml(part);

      // Wikilinks vor den Betonungen: der Titel darf Sternchen enthalten.
      out = out.replace(
        /\[\[([^\[\]]+)\]\]/g,
        (_m, name: string) =>
          `<span class="plan-link" data-plan="${name.trim()}" role="link" tabindex="0">${name.trim()}</span>`,
      );

      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');

      return out;
    })
    .join('');
}

/** Mehrzeiliger Text: jede Zeile formatiert, Umbrüche bleiben erhalten. */
export function formatBlock(raw: string): string {
  return raw
    .split('\n')
    .map((line) => formatInline(line))
    .join('<br>');
}
