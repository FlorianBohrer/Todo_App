import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Plan } from '../plan.model';
import { planLinkTargets } from '../plan-links';
import { layoutGraph, GraphEdge } from '../graph-layout';
import { LabelService } from '../../todo/services/label.service';
import { folderColorClass } from '../../todo/shared/folder-color';

const WIDE = { width: 900, height: 520 };
// Hochkant fuer das Telefon: quer gezeichnet und auf 340px verkleinert war
// jede Beschriftung 4px hoch.
const TALL = { width: 420, height: 560 };

/**
 * Graph der Pläne: Punkte sind Pläne, Linien sind [[Wikilinks]].
 *
 * Der Graph lebt davon, dass verlinkt wird — ohne Verknüpfungen zeigt er nur
 * verstreute Punkte. Genau das sagt er dann auch, statt den Eindruck zu
 * erwecken, es sei etwas kaputt.
 */
@Component({
  selector: 'app-plan-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    @if (!plans().length) {
      <p class="rounded-xl border border-line bg-bg2 p-6 text-center text-muted">
        No plans yet. The graph fills up as you create and link them.
      </p>
    } @else {
      <!-- Dieselbe gepunktete Zeichenflaeche wie bei den Diagrammen. Zeigt
           man auf einen Plan, treten seine Verbindungen hervor und der Rest
           zurueck — so liest man ein Netz, ohne Linien zu verfolgen. -->
      <div class="graph-canvas" [class.is-focusing]="hovered() !== null">
        <svg
          [attr.viewBox]="'0 0 ' + size().width + ' ' + size().height"
          class="h-auto w-full"
          role="img"
          aria-label="Graph of plans and their links">
          <!-- Kanten zuerst, damit die Punkte darüber liegen. -->
          @for (line of graph().lines; track line.key) {
            <line
              [attr.x1]="line.x1" [attr.y1]="line.y1"
              [attr.x2]="line.x2" [attr.y2]="line.y2"
              class="graph-edge"
              [class.is-lit]="hovered() === line.source || hovered() === line.target" />
          }

          @for (node of graph().nodes; track node.id) {
            <g class="graph-node" [class.graph-node--active]="node.id === activeId()"
              [class.is-lit]="isLit(node.id)"
              (click)="open.emit(node.id)"
              (pointerenter)="hovered.set(node.id)"
              (pointerleave)="hovered.set(null)"
              (focus)="hovered.set(node.id)"
              (blur)="hovered.set(null)"
              role="button"
              tabindex="0"
              (keydown.enter)="open.emit(node.id)"
              (keydown.space)="open.emit(node.id)">
              <title>{{ node.label }}</title>
              <!-- Eine unsichtbare, groessere Flaeche: ein 5px-Punkt ist mit
                   dem Finger nicht zu treffen. -->
              <circle [attr.cx]="node.x" [attr.cy]="node.y" r="22" class="graph-hit" />
              <circle
                [attr.cx]="node.x" [attr.cy]="node.y" [attr.r]="radius(node.degree) + 6"
                [class]="node.tone + ' graph-halo'"
                fill="currentColor" />
              <circle
                [attr.cx]="node.x" [attr.cy]="node.y" [attr.r]="radius(node.degree)"
                [class]="node.tone + ' graph-dot'"
                fill="currentColor" />
              <text
                [attr.x]="node.x" [attr.y]="node.y + radius(node.degree) + 16"
                text-anchor="middle"
                class="graph-label">{{ shorten(node.label) }}</text>
            </g>
          }
        </svg>
      </div>

      @if (!graph().lines.length) {
        <p class="mt-3 text-center text-sm text-subtle">
          No links yet. Write <span class="font-mono text-muted">[[Plan title]]</span>
          in a plan to connect two of them.
        </p>
      }
    }
  `,
  styles: `
    .graph-canvas {
      overflow: hidden;
      border: 1px solid var(--color-line);
      border-radius: 1rem;
      background:
        radial-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1.25px) 0 0 / 18px 18px,
        radial-gradient(ellipse at center, rgb(255 255 255 / 0.03), transparent 70%),
        var(--color-bg3);
    }

    .graph-edge {
      stroke: rgb(255 255 255 / 0.16);
      stroke-width: 1.25;
      stroke-linecap: round;
      transition: stroke 160ms ease-out, opacity 160ms ease-out;
    }

    .graph-edge.is-lit {
      stroke: var(--color-brand-2);
      stroke-width: 1.75;
    }

    .graph-canvas.is-focusing .graph-edge:not(.is-lit) {
      opacity: 0.35;
    }

    .graph-node {
      cursor: pointer;
      outline: none;
      transition: opacity 160ms ease-out;
    }

    .graph-canvas.is-focusing .graph-node:not(.is-lit) {
      opacity: 0.35;
    }

    .graph-hit {
      fill: transparent;
    }

    /* Ein weicher Hof in der Folderfarbe: der Punkt leuchtet, statt flach
       auf der Flaeche zu liegen. */
    .graph-halo {
      opacity: 0.16;
      transition: opacity 160ms ease-out;
    }

    .graph-dot {
      stroke: var(--color-bg3);
      stroke-width: 2;
      transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
      transform-box: fill-box;
      transform-origin: center;
    }

    .graph-node:hover .graph-halo,
    .graph-node:focus-visible .graph-halo {
      opacity: 0.3;
    }

    .graph-node:hover .graph-dot,
    .graph-node:focus-visible .graph-dot {
      transform: scale(1.18);
    }

    /* Der offene Plan bekommt einen Ring statt einer anderen Farbe — die Farbe
       gehoert zum Folder und soll ihre Bedeutung behalten. */
    .graph-node--active .graph-dot {
      stroke: var(--color-brand-2);
      stroke-width: 2.5;
    }

    /* Ein Rand in der Flaechenfarbe um jede Beschriftung: sie bleibt lesbar,
       auch wo eine Linie unter ihr durchlaeuft. */
    .graph-label {
      fill: var(--color-muted);
      font-size: 12px;
      font-weight: 500;
      paint-order: stroke;
      stroke: var(--color-bg3);
      stroke-width: 4px;
      stroke-linejoin: round;
      pointer-events: none;
      transition: fill 140ms ease-out;
    }

    .graph-node:hover .graph-label,
    .graph-node:focus-visible .graph-label {
      fill: var(--color-text);
    }

    @media (prefers-reduced-motion: reduce) {
      .graph-edge,
      .graph-node,
      .graph-halo,
      .graph-dot {
        transition: none;
      }
    }
  `,
})
export class PlanGraph {
  private readonly labelService = inject(LabelService);

  readonly plans = input.required<Plan[]>();
  readonly activeId = input<string | null>(null);
  readonly open = output<string>();

  /** Der Plan unter dem Zeiger (oder im Fokus) — seine Nachbarschaft leuchtet. */
  protected readonly hovered = signal<string | null>(null);

  private readonly narrow = signal(
    typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches,
  );
  protected readonly size = computed(() => (this.narrow() ? TALL : WIDE));

  protected readonly graph = computed(() => {
    const plans = this.plans();

    // Titel -> ID, damit [[Titel]] auf einen Plan zeigen kann.
    const byTitle = new Map<string, string>();
    for (const plan of plans) byTitle.set(plan.title.trim().toLowerCase(), plan.id);

    // Ungerichtet: zwei Pläne, die sich gegenseitig nennen, sind eine Linie.
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const plan of plans) {
      for (const target of planLinkTargets(plan)) {
        const id = byTitle.get(target.trim().toLowerCase());
        if (!id || id === plan.id) continue;
        const key = [plan.id, id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: plan.id, target: id });
      }
    }

    const layout = layoutGraph(
      plans.map((plan) => ({
        id: plan.id,
        label: plan.title,
        tone: this.toneFor(plan.categoryId),
      })),
      edges,
      this.size().width,
      this.size().height,
    );

    const at = new Map(layout.nodes.map((n) => [n.id, n]));
    const lines = layout.edges.map((edge) => {
      const a = at.get(edge.source)!;
      const b = at.get(edge.target)!;
      return {
        key: `${edge.source}|${edge.target}`,
        source: edge.source,
        target: edge.target,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      };
    });

    return { nodes: layout.nodes, lines };
  });

  /** Wer mit dem gezeigten Plan verbunden ist — er selbst eingeschlossen. */
  private readonly neighbours = computed(() => {
    const id = this.hovered();
    const lit = new Set<string>();
    if (!id) return lit;
    lit.add(id);
    for (const line of this.graph().lines) {
      if (line.source === id) lit.add(line.target);
      if (line.target === id) lit.add(line.source);
    }
    return lit;
  });

  protected isLit(id: string): boolean {
    return this.neighbours().has(id);
  }

  private toneFor(categoryId: string | null): string {
    const color = this.labelService.labelById(categoryId)?.color;
    return folderColorClass(color, 'dot');
  }

  /** Mehr Verbindungen, größerer Punkt — gedeckelt, sonst frisst ein Knoten alles. */
  protected radius(degree: number): number {
    return 5 + Math.min(degree, 8) * 1.5;
  }

  protected shorten(label: string): string {
    const text = label.trim() || 'Untitled';
    return text.length > 22 ? `${text.slice(0, 21)}…` : text;
  }
}
