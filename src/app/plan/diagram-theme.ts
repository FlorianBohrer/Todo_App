/**
 * Wie Diagramme aussehen.
 *
 * Mermaids eigene Themes sehen aus wie 2015: dicke Kästen, Gitter in jeder
 * Entität, Schrift aus „Open Sans", und im Datenmodell standen jede zweite
 * Zeile hellgrau auf weiß — schlicht nicht zu lesen. Hier bekommt jedes
 * Diagramm dieselbe Sprache wie die App: ruhige Flächen, die sich mit einem
 * weichen Schatten vom gepunkteten Grund abheben, feine Linien, abgerundete
 * Ecken, die App-Schrift, und die Akzentfarbe nur dort, wo sie etwas bedeutet —
 * Entitätsnamen, Schlüssel, Grenzen, die Nummern einer Abfolge.
 *
 * Die Gestaltung steht in `themeCSS`, nicht im Stylesheet der Komponente:
 * Mermaid setzt sie in die SVG, BEVOR es die Beschriftungen vermisst. Von
 * außen gesetzt kämen Schriftgrößen und -stärken erst nach der Vermessung —
 * „PRODUCT" stand dann als „PRODUC" in einem zu schmalen Kasten. Und sie
 * gilt auch in einer exportierten SVG.
 *
 * Reine Funktionen: die Farben kommen von außen (PlansView liest sie aus den
 * Tokens), damit eine andere Akzentfarbe auch die Diagramme umfärbt.
 */
import type { MermaidConfig } from 'mermaid';

export interface DiagramPalette {
  /** Der Grund, auf dem das Diagramm steht. */
  canvas: string;
  /** Kästen. */
  node: string;
  /** Angehobene Flächen: Aktivierungen, Kopf zusammengesetzter Zustände. */
  raised: string;
  border: string;
  ink: string;
  muted: string;
  subtle: string;
  /** Kanten und Pfeile: leiser als Text, deutlicher als Rahmen. */
  wire: string;
  accent: string;
  font: string;
}

export const DIAGRAM_PALETTE: DiagramPalette = {
  canvas: '#121822',
  node: '#1A2130',
  raised: '#222B3A',
  border: '#334055',
  ink: '#ECF0F6',
  muted: '#A8B4C8',
  subtle: '#8C9AB0',
  wire: '#5E6C84',
  accent: '#5CC7BC',
  font: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif',
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function diagramConfig(p: DiagramPalette): MermaidConfig {
  // Jede zweite Zeile einer Entität: kaum heller, gerade genug zum Folgen.
  const rowEven = '#1D2534';

  return {
    startOnLoad: false,
    // 'strict' laesst Mermaid die erzeugte SVG durch DOMPurify schicken —
    // der Quelltext kommt schliesslich aus einem Eingabefeld.
    securityLevel: 'strict',
    theme: 'base',
    look: 'classic',
    fontFamily: p.font,
    // Gilt auch für die Abfolge: dort überschreibt diese Zahl die eigenen
    // Schriftgrößen der Teilnehmer und Nachrichten (Mermaid-Standard 16).
    fontSize: 14,
    themeCSS: diagramCss(p),
    themeVariables: {
      darkMode: true,
      background: p.canvas,
      fontFamily: p.font,
      fontSize: '14px',

      primaryColor: p.node,
      primaryTextColor: p.ink,
      primaryBorderColor: p.border,
      secondaryColor: p.raised,
      secondaryTextColor: p.ink,
      secondaryBorderColor: p.border,
      tertiaryColor: p.raised,
      tertiaryTextColor: p.ink,
      tertiaryBorderColor: p.border,
      mainBkg: p.node,
      nodeBorder: p.border,
      nodeTextColor: p.ink,
      textColor: p.ink,
      titleColor: p.muted,
      lineColor: p.wire,
      edgeLabelBackground: p.canvas,
      clusterBkg: 'rgba(255, 255, 255, 0.025)',
      clusterBorder: p.border,

      // Abfolge
      actorBkg: p.node,
      actorBorder: p.border,
      actorTextColor: p.ink,
      actorLineColor: p.border,
      signalColor: p.muted,
      signalTextColor: p.ink,
      labelBoxBkgColor: p.node,
      labelBoxBorderColor: p.border,
      labelTextColor: p.ink,
      loopTextColor: p.muted,
      noteBkgColor: p.raised,
      noteBorderColor: p.border,
      noteTextColor: p.ink,
      activationBkgColor: p.raised,
      activationBorderColor: p.accent,
      sequenceNumberColor: p.canvas,

      // Datenmodell
      attributeBackgroundColorOdd: p.node,
      attributeBackgroundColorEven: rowEven,
      rowOdd: p.node,
      rowEven,

      // Zustände
      labelColor: p.ink,
      altBackground: p.raised,
      compositeBackground: 'rgba(255, 255, 255, 0.025)',
      compositeTitleBackground: p.raised,
      specialStateColor: p.accent,
      innerEndBackground: p.accent,
      transitionColor: p.wire,
      transitionLabelColor: p.muted,
      stateLabelColor: p.ink,

      // Klassen
      classText: p.ink,

      // Zeitplan
      activeTaskBkgColor: p.accent,
    },
    // Ohne useMaxWidth: false staucht Mermaid die Zeichnung auf jede Breite —
    // am Handy werden die Beschriftungen dann unleserlich. Wie weit
    // verkleinert wird, entscheidet MermaidDiagram (fitDiagram): bis zur
    // Lesegrenze, danach wird waagerecht gerollt.
    flowchart: {
      // SVG-Text statt foreignObject: vorhersagbar gestylt und kopierbar.
      htmlLabels: false,
      curve: 'basis',
      padding: 14,
      nodeSpacing: 36,
      rankSpacing: 44,
      useMaxWidth: false,
    },
    sequence: {
      useMaxWidth: false,
      mirrorActors: false,
      // Schmalere Teilnehmer: vier passen so in eine Textspalte.
      width: 120,
      actorMargin: 44,
      boxMargin: 8,
      actorFontFamily: p.font,
      actorFontWeight: 500,
      messageFontFamily: p.font,
      messageFontWeight: 400,
      noteFontFamily: p.font,
    },
    er: { useMaxWidth: false, entityPadding: 12, minEntityWidth: 120 },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
  };
}

/** Was die Theme-Variablen nicht ausdrücken können. */
export function diagramCss(p: DiagramPalette): string {
  return `
    .node { filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 8px 18px rgb(0 0 0 / 0.22)); }
    .node rect { rx: 10px; ry: 10px; }

    .cluster rect { rx: 14px; ry: 14px; stroke-dasharray: 5 5; }
    .cluster-label text, .cluster-label tspan {
      fill: ${p.accent}; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
    }

    .flowchart-link, path.transition, .relationshipLine { stroke-width: 1.25px; }
    .edgeLabel rect { rx: 6px; ry: 6px; }
    .edgeLabel text, .edgeLabel tspan { fill: ${p.muted}; font-size: 12.5px; }
    .edgeLabel p, .edgeLabel span { color: ${p.muted}; font-size: 12.5px; }

    rect.actor { rx: 10px; ry: 10px; }
    .actor-line { stroke-dasharray: 2 5; stroke-linecap: round; }
    .actor-man circle, .actor-man line { stroke: ${p.muted}; }
    marker[id$="sequencenumber"] circle { fill: ${p.accent}; stroke: none; }
    marker[id*="_er-zero"] circle { fill: ${p.canvas}; stroke: ${p.wire}; }
    text.sequenceNumber { fill: ${p.canvas}; font-size: 11px; font-weight: 700; }
    rect.note { rx: 8px; ry: 8px; }

    .label.name p { color: ${p.accent}; font-weight: 650; letter-spacing: 0.02em; }
    .label.attribute-type p { color: ${p.subtle}; font-family: ${MONO}; font-size: 12px; }
    .label.attribute-keys p { color: ${p.accent}; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
    .label.attribute-comment p { color: ${p.subtle}; font-size: 12px; }
    .divider.is-vertical { display: none; }
  `;
}

/**
 * Was auch CSS nicht kann: im Datenmodell die senkrechten Trenner zwischen
 * Typ, Name und Schlüssel erkennen. Mermaid gibt ihnen dieselbe Klasse wie den
 * waagerechten — ohne sie liest sich eine Entität wie eine Liste, nicht wie
 * eine Tabellenkalkulation.
 */
export function polishDiagram(svg: SVGSVGElement | null): void {
  if (!svg) return;

  const role = svg.getAttribute('aria-roledescription');

  if (role === 'er') {
    for (const divider of svg.querySelectorAll<SVGGraphicsElement>('.node .divider')) {
      const box = divider.getBBox();
      if (box.width < 1 && box.height > 1) divider.classList.add('is-vertical');
    }
  }

  // Ohne gespiegelte Teilnehmer unten endet die Zeichnung an der letzten
  // Nachricht — deren Nummer stand halb unter dem Rand.
  if (role === 'sequence') {
    const box = svg.viewBox.baseVal;
    const height = Number(svg.getAttribute('height'));
    if (box && box.height > 0 && height > 0) {
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height + 14}`);
      svg.setAttribute('height', String(height + 14));
    }
  }

  // Der Name einer Grenze („Backend") steht oben links in ihrer Ecke, wie in
  // jedem Architekturdiagramm — mittig oben lief genau dort die Kante hinein,
  // die von außen in die Grenze führt, quer durch das Wort.
  for (const cluster of svg.querySelectorAll('.cluster')) {
    const rect = cluster.querySelector('rect');
    const label = cluster.querySelector<SVGGraphicsElement>('.cluster-label');
    const at = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(label?.getAttribute('transform') ?? '');
    if (!rect || !label || !at) continue;

    const left = Number(rect.getAttribute('x')) + 14 - label.getBBox().x;
    label.setAttribute('transform', `translate(${left}, ${at[2]})`);
  }
}

/**
 * Kleiner als 60 % wird nicht gezeichnet: 14px-Beschriftungen stuenden dann
 * unter 9px. Was so nicht passt, behaelt seine Groesse und rollt.
 */
export const MIN_DIAGRAM_SCALE = 0.6;

/**
 * Wie breit eine Zeichnung auf `available` Pixeln steht: natürlich, wenn sie
 * passt; eingepasst, solange sie lesbar bleibt; sonst natürlich und zum
 * Rollen. Rollen ist die schlechtere Wahl — man sieht nie das Ganze —, aber
 * besser als eine Zeichnung, die man nicht lesen kann.
 */
export function fittedWidth(natural: number, available: number): number {
  if (!(natural > 0) || !(available > 0) || natural <= available) return natural;
  return available / natural >= MIN_DIAGRAM_SCALE ? available : natural;
}

/**
 * Eingepasst im Vollbild: ganz zu sehen, in beiden Richtungen, mit etwas Luft
 * zum Rand. Kleine Zeichnungen dürfen wachsen — bis anderthalbfach, darüber
 * wirken drei Kästen auf einem großen Schirm wie ein Versehen.
 */
export function screenFit(natural: number, naturalHeight: number, width: number, height: number): number {
  const across = width / natural;
  const down = naturalHeight > 0 && height > 0 ? height / naturalHeight : across;
  return Math.min(across, down, 1.5 / 0.92) * 0.92;
}

const ZOOM_STOPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/** Die nächste Zoomstufe — von dem aus, was gerade zu sehen ist. */
export function nextZoom(current: number, step: 1 | -1): number {
  if (step > 0) return ZOOM_STOPS.find((z) => z > current + 0.01) ?? ZOOM_STOPS[ZOOM_STOPS.length - 1];
  return [...ZOOM_STOPS].reverse().find((z) => z < current - 0.01) ?? ZOOM_STOPS[0];
}

// ---------------------------------------------------------------------------
// Art des Diagramms
// ---------------------------------------------------------------------------

export type DiagramKind = 'flowchart' | 'sequence' | 'data' | 'classes' | 'states' | 'other';

const KINDS: readonly (readonly [RegExp, DiagramKind, string])[] = [
  [/^(flowchart|graph)\b/, 'flowchart', 'Flowchart'],
  [/^sequenceDiagram\b/, 'sequence', 'Sequence'],
  [/^erDiagram\b/, 'data', 'Data model'],
  [/^classDiagram(-v2)?\b/, 'classes', 'Classes'],
  [/^stateDiagram(-v2)?\b/, 'states', 'States'],
  [/^architecture(-beta)?\b/, 'other', 'Architecture'],
  [/^C4\w*/, 'other', 'C4'],
  [/^(gantt|timeline)\b/, 'other', 'Timeline'],
  [/^mindmap\b/, 'other', 'Mind map'],
  [/^journey\b/, 'other', 'User journey'],
  [/^gitGraph\b/, 'other', 'Git graph'],
  [/^pie\b/, 'other', 'Pie chart'],
  [/^(xychart|quadrantChart)(-beta)?\b/, 'other', 'Chart'],
  [/^block(-beta)?\b/, 'other', 'Blocks'],
  [/^sankey(-beta)?\b/, 'other', 'Sankey'],
];

/**
 * Welche Art Diagramm ein Quelltext beschreibt — für die Beschriftung über der
 * Zeichnung. Kommentare (%%), Leerzeilen und ein Kopfblock (---) zählen nicht.
 */
export function diagramKind(code: string): { kind: DiagramKind; label: string } {
  let lines = code.split('\n').map((l) => l.trim());
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    lines = end > 0 ? lines.slice(end + 1) : lines;
  }
  const first = lines.find((l) => l && !l.startsWith('%%')) ?? '';

  for (const [pattern, kind, label] of KINDS) {
    if (pattern.test(first)) return { kind, label };
  }
  return { kind: 'other', label: 'Diagram' };
}
