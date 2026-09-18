import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Plan } from '../plan.model';
import { planLinkTargets } from '../plan-links';
import { layoutGraph, GraphEdge } from '../graph-layout';
import { LabelService } from '../../todo/services/label.service';
import { folderColorClass } from '../../todo/shared/folder-color';

const WIDTH = 900;
const HEIGHT = 520;

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
        No plans yet — the graph fills up as you create and link them.
      </p>
    } @else {
      <div class="overflow-hidden rounded-xl border border-line bg-black/20">
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          class="h-auto w-full"
          role="img"
          aria-label="Graph of plans and their links">
          <!-- Kanten zuerst, damit die Punkte darüber liegen. -->
          @for (line of graph().lines; track line.key) {
            <line
              [attr.x1]="line.x1" [attr.y1]="line.y1"
              [attr.x2]="line.x2" [attr.y2]="line.y2"
              class="graph-edge" />
          }

          @for (node of graph().nodes; track node.id) {
            <g class="graph-node" [class.graph-node--active]="node.id === activeId()"
              (click)="open.emit(node.id)"
              role="button"
              tabindex="0"
              (keydown.enter)="open.emit(node.id)"
              (keydown.space)="open.emit(node.id)">
              <title>{{ node.label }}</title>
              <circle
                [attr.cx]="node.x" [attr.cy]="node.y" [attr.r]="radius(node.degree)"
                [class]="node.tone"
                fill="currentColor" />
              <text
                [attr.x]="node.x" [attr.y]="node.y + radius(node.degree) + 13"
                text-anchor="middle"
                class="graph-label">{{ shorten(node.label) }}</text>
            </g>
          }
        </svg>
      </div>

      @if (!graph().lines.length) {
        <p class="mt-3 text-center text-sm text-subtle">
          No links yet — write <span class="font-mono text-muted">[[Plan title]]</span>
          in a plan to connect two of them.
        </p>
      }
    }
  `,
  styles: `
    .graph-edge {
      stroke: rgb(255 255 255 / 0.16);
      stroke-width: 1;
    }

    .graph-node {
      cursor: pointer;
    }

    .graph-node circle {
      transition: opacity 140ms ease-out;
      opacity: 0.85;
    }

    .graph-node:hover circle,
    .graph-node:focus-visible circle {
      opacity: 1;
    }

    /* Der offene Plan bekommt einen Ring statt einer anderen Farbe — die Farbe
       gehoert zum Folder und soll ihre Bedeutung behalten. */
    .graph-node--active circle {
      opacity: 1;
      stroke: #a78bfa;
      stroke-width: 2.5;
    }

    .graph-label {
      fill: var(--color-muted);
      font-size: 11px;
      pointer-events: none;
    }

    .graph-node:hover .graph-label {
      fill: var(--color-text);
    }

    @media (prefers-reduced-motion: reduce) {
      .graph-node circle {
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

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

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
      WIDTH,
      HEIGHT,
    );

    const at = new Map(layout.nodes.map((n) => [n.id, n]));
    const lines = layout.edges.map((edge) => {
      const a = at.get(edge.source)!;
      const b = at.get(edge.target)!;
      return {
        key: `${edge.source}|${edge.target}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      };
    });

    return { nodes: layout.nodes, lines };
  });

  private toneFor(categoryId: string | null): string {
    const color = this.labelService.labels().find((l) => l.id === categoryId)?.color;
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
