/**
 * Zellen, die mehr sind als Text.
 *
 * In einer API-Tabelle steht in jeder Zeile „GET" oder „POST", in einer
 * Risikotabelle „High" oder „Low". Als Fließtext liest man das Wort für Wort;
 * als farbige Marke erfasst man die ganze Spalte mit einem Blick — so, wie es
 * jede API-Dokumentation und jedes Ticketsystem längst zeigt. Pfade wie
 * „/orders/:id" sind Code und stehen darum in Schreibmaschinenschrift.
 *
 * Erkannt wird nur, was die GANZE Zelle ist: „GET the list" bleibt Text.
 * Gespeichert wird weiter der Text — die Marke ist nur, wie er aussieht.
 */

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

const LEVELS: Readonly<Record<string, 'high' | 'medium' | 'low'>> = {
  critical: 'high',
  kritisch: 'high',
  high: 'high',
  hoch: 'high',
  medium: 'medium',
  mittel: 'medium',
  low: 'low',
  niedrig: 'low',
  gering: 'low',
};

// Nur Zeichen, die in HTML nichts bedeuten: der Pfad geht ungefiltert hinein.
const PATH = /^\/[\w\-.~:/{}*?=@%+,]*$/;

/** Die Zelle als Marke, oder null, wenn sie einfach Text ist. */
export function cellChip(text: string): string | null {
  const value = text.trim();
  const lower = value.toLowerCase();

  if (METHODS.has(lower)) {
    return `<span class="cell-chip cell-method cell-method--${lower}">${lower.toUpperCase()}</span>`;
  }

  // HTTP-Status: die Klasse (2xx, 4xx …) sagt mehr als die Zahl.
  if (/^[1-5]\d\d$/.test(value)) {
    return `<span class="cell-chip cell-method cell-status--${value[0]}xx">${value}</span>`;
  }

  const level = LEVELS[lower];
  if (level) {
    return `<span class="cell-chip cell-level cell-level--${level}"><i aria-hidden="true"></i>${value}</span>`;
  }

  if (PATH.test(value)) return `<code class="cell-path">${value}</code>`;

  return null;
}
