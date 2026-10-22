/**
 * Kräftebasiertes Layout für die Graph-Ansicht (Fruchterman-Reingold).
 *
 * Bewusst ohne Bibliothek und ohne Animationsschleife: das Layout wird einmal
 * fertig gerechnet und danach statisch gezeichnet. Bei der Zahl an Plänen, um
 * die es hier geht, ist das in wenigen Millisekunden erledigt — und es gibt
 * keine laufende Schleife, die man wieder abräumen müsste.
 *
 * Der Start liegt auf einem Kreis statt zufällig, damit dasselbe Netz immer
 * gleich aussieht. Ein Graph, der bei jedem Öffnen anders liegt, ist nicht
 * wiedererkennbar.
 */

export interface GraphNodeInput {
  id: string;
  label: string;
  /** Farbklasse o. Ä. — wird unverändert durchgereicht. */
  tone?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphNode extends GraphNodeInput {
  x: number;
  y: number;
  /** Anzahl der Verbindungen — steuert die Punktgröße. */
  degree: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function layoutGraph(
  nodeInput: readonly GraphNodeInput[],
  edgeInput: readonly GraphEdge[],
  width: number,
  height: number,
  iterations = 260,
): GraphLayout {
  const count = nodeInput.length;
  if (count === 0) return { nodes: [], edges: [] };

  // Die Beschriftung steht mittig unter dem Punkt und ist bis zu 22 Zeichen
  // breit. Mit einem gleichmaessigen Rand von 28px stand ein Punkt am
  // Seitenrand und sein Name halb ausserhalb („ojekt Website").
  const marginX = Math.min(80, width / 5);
  const marginTop = Math.min(28, height / 8);
  const marginBottom = Math.min(44, height / 6);
  const indexOf = new Map<string, number>();
  nodeInput.forEach((n, i) => indexOf.set(n.id, i));

  // Nur Kanten zwischen bekannten, verschiedenen Knoten. Eine Kante ins Leere
  // wuerde die Kraefte verzerren.
  const edges = edgeInput.filter((e) => {
    const a = indexOf.get(e.source);
    const b = indexOf.get(e.target);
    return a !== undefined && b !== undefined && a !== b;
  });

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const positions = nodeInput.map((node, i) => {
    const angle = (2 * Math.PI * i) / count;
    return {
      x: width / 2 + Math.cos(angle) * (width / 3),
      y: height / 2 + Math.sin(angle) * (height / 3),
    };
  });

  if (count === 1) {
    positions[0] = { x: width / 2, y: height / 2 };
  }

  // Der Wunschabstand zweier Punkte. Gedeckelt: bei drei Plaenen waere er
  // sonst so gross, dass sie sich bis in die Ecken stiessen.
  const k = Math.min(Math.sqrt((width * height) / count), 150);
  // Zug zur Mitte. Ohne ihn haelt nur der Rand das Netz zusammen, und
  // unverbundene Punkte landen genau dort — in den Ecken.
  const gravity = 0.35;
  const cx = width / 2;
  const cy = height / 2;
  let temperature = width / 10;
  const cooling = temperature / (iterations + 1);

  for (let step = 0; step < iterations; step++) {
    const push = positions.map(() => ({ x: 0, y: 0 }));

    // Abstossung zwischen allen Paaren.
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / distance;
        const ux = dx / distance;
        const uy = dy / distance;
        push[i].x += ux * force;
        push[i].y += uy * force;
        push[j].x -= ux * force;
        push[j].y -= uy * force;
      }
    }

    // Anziehung entlang der Kanten.
    for (const edge of edges) {
      const a = indexOf.get(edge.source)!;
      const b = indexOf.get(edge.target)!;
      const dx = positions[a].x - positions[b].x;
      const dy = positions[a].y - positions[b].y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const force = (distance * distance) / k;
      const ux = dx / distance;
      const uy = dy / distance;
      push[a].x -= ux * force;
      push[a].y -= uy * force;
      push[b].x += ux * force;
      push[b].y += uy * force;
    }

    for (let i = 0; i < count; i++) {
      const dx = positions[i].x - cx;
      const dy = positions[i].y - cy;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.01) continue;
      const force = (gravity * distance * distance) / k;
      push[i].x -= (dx / distance) * force;
      push[i].y -= (dy / distance) * force;
    }

    // Schrittweite sinkt mit der Temperatur, sonst schwingt das Netz endlos.
    for (let i = 0; i < count; i++) {
      const length = Math.hypot(push[i].x, push[i].y) || 0.01;
      const limited = Math.min(length, temperature);
      positions[i].x = clamp(
        positions[i].x + (push[i].x / length) * limited,
        marginX,
        width - marginX,
      );
      positions[i].y = clamp(
        positions[i].y + (push[i].y / length) * limited,
        marginTop,
        height - marginBottom,
      );
    }

    temperature = Math.max(0, temperature - cooling);
  }

  return {
    nodes: nodeInput.map((node, i) => ({
      ...node,
      x: positions[i].x,
      y: positions[i].y,
      degree: degree.get(node.id) ?? 0,
    })),
    edges,
  };
}
