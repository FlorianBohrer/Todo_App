/**
 * Die Bruecke zwischen dem, was gespeichert wird (Markdown), und dem, was im
 * Feld steht (formatierter Text).
 *
 * Bisher war der Editor nach Obsidian-Art gebaut: ein Block zeigt formatierten
 * Text und wird beim Anklicken zum Rohtext-Feld. Notion macht es anders und
 * besser — dort gibt es nie Rohtext. Man tippt „**fett**", und in dem Moment,
 * in dem die zweiten Sternchen stehen, sind sie weg und das Wort ist fett. Das
 * Dokument sieht beim Schreiben aus wie beim Lesen.
 *
 * Dafuer schreibt man in ein contenteditable statt in ein textarea. Gespeichert
 * wird trotzdem Markdown: es ist les- und versionierbar, und alles andere im
 * Plan (Einfuegen, Suche, Wikilinks, die KI-Ueberschriften) arbeitet darauf.
 * Also braucht es beide Richtungen — und, weil der Cursor beim Umschreiben
 * nicht springen darf, die Position gleich mit.
 */
import { formatBlock } from './inline-format';

/** Auszeichnungen, die als Zeichenpaar um ihren Inhalt stehen. */
const WRAPPERS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  u: '__',
  s: '~~',
  strike: '~~',
  del: '~~',
  code: '`',
};

/** Elemente, die eine eigene Zeile aufmachen, wenn der Browser doch eins baut. */
const BLOCKISH = new Set(['div', 'p', 'li', 'blockquote']);

/**
 * Ein Zeichen ohne Breite als Halt fuer den Cursor.
 *
 * Steht der Cursor direkt hinter einem <strong>, schreibt Chrome den naechsten
 * Buchstaben HINEIN — auch dann, wenn die Auswahl nachweislich ausserhalb
 * liegt und selbst dann, wenn dort schon ein gewoehnlicher Textknoten steht
 * (nachgemessen, alle Varianten). Aus „**fett**" wuerde beim Weitertippen
 * „**fettX**", und man kaeme aus der Auszeichnung nicht mehr heraus.
 *
 * Ein eigener Textknoten mit diesem Zeichen loest das: er ist echter Text,
 * also schreibt der Browser dort hinein, und sichtbar ist er nicht. Beim Lesen
 * wird er wieder entfernt, im Markdown taucht er nie auf.
 */
export const ANCHOR = '​';

function isWrapped(node: Node | null): boolean {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  return WRAPPERS[el.tagName.toLowerCase()] !== undefined || el.dataset?.['plan'] !== undefined;
}

/** Stellenzahl im DOM-Text, die der Position im gelesenen Text entspricht. */
function domOffsetFor(raw: string, stripped: number): number {
  let seen = 0;
  let i = 0;
  while (i < raw.length && seen < stripped) {
    if (raw[i] !== ANCHOR) seen++;
    i++;
  }
  // Hinter fuehrende Anker ruecken: der Cursor gehoert hinter sie, sonst
  // faenge das Problem von vorn an.
  while (i < raw.length && raw[i] === ANCHOR) i++;
  return i;
}

/** Ein Textknoten und seine Stelle im Markdown. */
interface Spot {
  node: Text;
  start: number;
  length: number;
}

/** Eine Luecke zwischen zwei Kindknoten — dort kann der Cursor auch stehen. */
interface Edge {
  parent: Node;
  index: number;
  at: number;
}

export interface RichScan {
  md: string;
  spots: Spot[];
  edges: Edge[];
}

/**
 * Liest den Inhalt eines Editors als Markdown und merkt sich dabei, welche
 * Stelle im Text zu welchem Knoten gehoert.
 *
 * Das Mitschreiben der Positionen ist der Grund, warum das hier ein eigener
 * Durchgang ist und nicht `innerHTML` plus Regex: ohne die Zuordnung liesse
 * sich der Cursor nach dem Neuzeichnen nicht wieder hinsetzen, und ein Editor,
 * der den Cursor verliert, ist keiner.
 */
export function scanRich(root: Node): RichScan {
  let md = '';
  const spots: Spot[] = [];
  const edges: Edge[] = [];

  const walkChildren = (parent: Node): void => {
    const kids = parent.childNodes;
    for (let i = 0; i < kids.length; i++) {
      edges.push({ parent, index: i, at: md.length });
      walk(kids[i], i === kids.length - 1);
    }
    edges.push({ parent, index: kids.length, at: md.length });
  };

  const walk = (node: Node, last: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Ein contenteditable setzt an Stellen, an denen ein normales Leerzeichen
      // zusammenfiele, ein geschuetztes. Gemeint ist immer ein Leerzeichen.
      // Die Cursor-Anker sind keine Schrift und gehen wieder heraus.
      const text = (node.nodeValue ?? '')
        .replace(/ /g, ' ')
        .replace(/​/g, '');
      spots.push({ node: node as Text, start: md.length, length: text.length });
      md += text;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      // Browser haengen an ein leeres contenteditable ein <br>, das niemand
      // getippt hat. Am Ende zaehlt es deshalb nicht mit — sonst waechst jeder
      // Block bei jedem Speichern um eine Leerzeile.
      if (!last) md += '\n';
      return;
    }

    // Wikilink: der Titel steht im Text, nicht im Attribut. Wer im Link
    // weiterschreibt, aendert damit das Ziel — und nicht nur die Anzeige.
    if (el.dataset?.['plan'] !== undefined) {
      const name = (el.textContent ?? '').trim();
      if (name) md += `[[${name}]]`;
      return;
    }

    const wrap = WRAPPERS[tag];
    if (!wrap) {
      // Absatzartige Elemente entstehen, wenn der Browser doch einmal selbst
      // umbricht. Der Umbruch gehoert erhalten, der Kasten drumherum nicht.
      if (BLOCKISH.has(tag) && md !== '' && !md.endsWith('\n')) md += '\n';
      walkChildren(el);
      return;
    }

    const before = md.length;
    md += wrap;
    walkChildren(el);
    // Leere Auszeichnung („****") waere im Markdown sichtbarer Muell.
    if (md.length === before + wrap.length) md = md.slice(0, before);
    else md += wrap;
  };

  walkChildren(root);
  return { md, spots, edges };
}

/** Wo im Markdown steht der Cursor, der im DOM auf (node, offset) sitzt? */
export function caretIn(scan: RichScan, node: Node | null, offset: number): number {
  if (!node) return -1;

  if (node.nodeType === Node.TEXT_NODE) {
    const spot = scan.spots.find((s) => s.node === node);
    if (!spot) return -1;
    // Anker zaehlen nicht mit: im gelesenen Text gibt es sie nicht.
    const upto = (node.nodeValue ?? '').slice(0, offset).replace(/​/g, '').length;
    return spot.start + Math.min(upto, spot.length);
  }

  const edge = scan.edges.find((e) => e.parent === node && e.index === offset);
  return edge ? edge.at : -1;
}

/** Und zurueck: welcher Knoten traegt die Markdown-Position? */
export function positionAt(
  scan: RichScan,
  at: number,
): { node: Node; offset: number } | null {
  for (const spot of scan.spots) {
    if (at >= spot.start && at <= spot.start + spot.length) {
      return {
        node: spot.node,
        offset: domOffsetFor(spot.node.nodeValue ?? '', at - spot.start),
      };
    }
  }

  // Kein Textknoten an der Stelle — etwa im leeren Block oder direkt hinter
  // einer Auszeichnung. Dann die letzte Luecke, die noch davor liegt.
  let best: Edge | null = null;
  for (const edge of scan.edges) {
    if (edge.at <= at && (!best || edge.at >= best.at)) best = edge;
  }
  return best ? { node: best.parent, offset: best.index } : null;
}

/**
 * Auszeichnungen, die als Paar geschrieben werden — geprueft wird IMMER am
 * Ende des Textes links vom Cursor.
 *
 * Reihenfolge ist Absicht: „***" vor „**" vor „*", sonst schnappt sich die
 * kuerzere Form die Enden der laengeren.
 */
const CLOSERS: RegExp[] = [
  /`[^`]+`$/,
  /\*\*\*[^*]+\*\*\*$/,
  /\*\*[^*]+\*\*$/,
  /__[^_]+__$/,
  /~~[^~]+~~$/,
  /(?:^|[^*])\*[^*\s][^*]*\*$/,
  /\[\[[^[\]]+\]\]$/,
];

/**
 * Hat der letzte Anschlag eine Auszeichnung geschlossen?
 *
 * Genau dann — und nur dann — wird der Block neu gezeichnet. Bei jedem
 * Tastendruck neu zu zeichnen waere einfacher zu schreiben und im Betrieb
 * schrecklich: der Browser verloere Cursor, Auswahl und seinen eigenen
 * Rueckgaengig-Stapel, und bei jeder Eingabe flackerte die Zeile.
 *
 * Solange die Auszeichnung offen ist, steht sie als Text da — auch das ist
 * Notion: man sieht, was man tippt, bis es fertig ist.
 */
export function justClosed(before: string): boolean {
  return CLOSERS.some((rule) => rule.test(before));
}

/** Markdown als HTML fuer den Editor. Dieselbe Ausgabe wie beim Lesen. */
export function renderRich(md: string): string {
  return formatBlock(md);
}

/**
 * Cursor auf eine Markdown-Position im Feld setzen.
 *
 * Landet er unmittelbar hinter einer Auszeichnung, bekommt er einen Anker —
 * sonst zoege der Browser das naechste Zeichen in die Auszeichnung hinein.
 */
export function placeCaret(el: HTMLElement, at: number | 'end'): void {
  const scan = scanRich(el);
  const target = at === 'end' ? scan.md.length : Math.max(0, Math.min(at, scan.md.length));
  const found = positionAt(scan, target);
  if (!found) return;

  const pos = anchored(found);
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Braucht diese Stelle einen Anker, damit der naechste Buchstabe frei bleibt? */
function anchored(pos: { node: Node; offset: number }): { node: Node; offset: number } {
  const parent = pos.node;
  if (parent.nodeType !== Node.ELEMENT_NODE || pos.offset === 0) return pos;
  if (!isWrapped(parent.childNodes[pos.offset - 1])) return pos;

  const following = parent.childNodes[pos.offset] ?? null;
  if (
    following &&
    following.nodeType === Node.TEXT_NODE &&
    (following.nodeValue ?? '').startsWith(ANCHOR)
  ) {
    return { node: following, offset: 1 };
  }

  const anchor = document.createTextNode(ANCHOR);
  parent.insertBefore(anchor, following);
  return { node: anchor, offset: 1 };
}

/** Feld anspringen und den Cursor setzen — der Weg von Block zu Block. */
export function focusRich(el: HTMLElement, at: number | 'end'): void {
  el.focus({ preventScroll: true });
  placeCaret(el, at);
  el.scrollIntoView({ block: 'nearest' });
}

/**
 * Ersetzt einen Abschnitt im Feld — ueber den Browser, nicht am DOM vorbei.
 *
 * `insertText` sieht umstaendlich aus, macht aber genau das Richtige: es
 * behaelt den Rueckgaengig-Stapel des Browsers, setzt den Cursor selbst und
 * loest ein input-Ereignis aus, sodass der Editor den neuen Stand aufnimmt.
 * Eigene DOM-Chirurgie kann das alles nicht.
 */
export function replaceRange(
  el: HTMLElement,
  from: number,
  to: number,
  text: string,
): void {
  const scan = scanRich(el);
  const start = positionAt(scan, from);
  const end = positionAt(scan, to);
  if (!start || !end) return;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  el.focus({ preventScroll: true });
  document.execCommand('insertText', false, text);
}
