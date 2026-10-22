import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import {
  DIAGRAM_PALETTE,
  diagramConfig,
  fittedWidth,
  nextZoom,
  polishDiagram,
  screenFit,
} from '../diagram-theme';
import { scrollEdges } from '../scroll-edges.directive';

/**
 * Mermaid wiegt rund ein halbes Megabyte. Es wird deshalb erst geholt, wenn
 * tatsaechlich ein Diagramm auf dem Schirm steht — der dynamische Import legt
 * einen eigenen Chunk an, das Startbundle bleibt unberuehrt. Das Promise liegt
 * im Modul, damit sich mehrere Diagramme auf einer Seite eine Ladung teilen.
 */
let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  mermaidLoader ??= import('mermaid').then((module) => module.default);
  return mermaidLoader;
}

/** Zuletzt an Mermaid gegebene Einstellungen — als Text, zum Vergleichen. */
let appliedConfig = '';

/**
 * Die Farben kommen aus den App-Tokens statt aus Mermaids Standardpalette,
 * damit das Diagramm nicht wie ein Fremdkoerper im dunklen Layout sitzt.
 * Gelesen wird am Diagramm selbst und bei jedem Zeichnen: wechselt jemand die
 * Akzentfarbe, folgt das naechste Diagramm ihr.
 */
function applyTheme(mermaid: typeof import('mermaid').default, at: HTMLElement): void {
  const css = getComputedStyle(at);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;

  const config = diagramConfig({
    ...DIAGRAM_PALETTE,
    canvas: token('--color-bg3', DIAGRAM_PALETTE.canvas),
    ink: token('--color-text', DIAGRAM_PALETTE.ink),
    muted: token('--color-muted', DIAGRAM_PALETTE.muted),
    subtle: token('--color-subtle', DIAGRAM_PALETTE.subtle),
    accent: token('--color-brand-2', DIAGRAM_PALETTE.accent),
  });

  const key = JSON.stringify(config);
  if (key === appliedConfig) return;
  mermaid.initialize(config);
  appliedConfig = key;
}

type DiagramStatus = 'empty' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-mermaid-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-expanded]': 'expanded()' },
  template: `
    <div class="diagram-body relative">
      <!-- Der Rahmen traegt die Randverlaeufe (wie bei Tabellen): sie stehen,
           waehrend die Zeichnung darunter durchrollt. -->
      <div class="diagram-frame" #frame>
        <!-- Der Riss beim Tippen: solange ein gueltiges Diagramm existiert,
             bleibt es stehen und der Fehler wird darunter gemeldet. -->
        <div
          #host
          class="diagram-host overflow-x-auto"
          [class.is-stale]="status() === 'error' && hasDiagram()"
          role="img"
          [attr.aria-label]="ariaLabel()"></div>
      </div>

      <!-- Im Vollbild: Zoom wie in jedem Zeichenprogramm, schwebend unten
           rechts, damit er nie auf der Zeichnung selbst liegt. -->
      @if (expanded() && hasDiagram()) {
        <div class="diagram-zoom" role="group" aria-label="Zoom">
          <button type="button" (click)="zoomBy(-1)" aria-label="Zoom out" title="Zoom out">−</button>
          <span class="diagram-zoom-value" aria-live="polite">{{ percent() }}%</span>
          <button type="button" (click)="zoomBy(1)" aria-label="Zoom in" title="Zoom in">+</button>
          <span class="diagram-zoom-rule" aria-hidden="true"></span>
          <button type="button" class="diagram-zoom-fit" [class.is-on]="zoom() === null"
            (click)="zoomToFit()" title="Fit to screen">Fit</button>
        </div>
      }

      @if (status() === 'loading' && !hasDiagram()) {
        <p class="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <span
            class="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          Rendering diagram…
        </p>
      }

      @if (status() === 'empty') {
        <p class="py-6 text-sm text-muted">
          Describe the flow on the left. The diagram appears here.
        </p>
      }

      @if (error(); as message) {
        <p
          class="mt-2 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
          role="status">
          <span aria-hidden="true">⚠</span>
          <span class="min-w-0">{{ message }}</span>
        </p>
      }
    </div>
  `,
  styles: `
    /* Die SVG kommt per innerHTML herein und traegt darum keine
       Encapsulation-Attribute — sie ist nur ueber ::ng-deep erreichbar. */
    .diagram-host ::ng-deep svg {
      display: block;
      /* Bewusst kein max-width: die Zeichnung behaelt ihre lesbare Groesse,
         der Host scrollt stattdessen waagerecht. Schmaler als die Flaeche
         steht sie in deren Mitte. */
      max-width: none;
      height: auto;
      margin-inline: auto;
    }

    .diagram-host {
      scrollbar-width: thin;
      scrollbar-color: var(--color-line-strong) transparent;
    }

    /* Rollt die Zeichnung, loest sich der Rand weich auf: man sieht, dass
       dort noch etwas steht. */
    .diagram-frame {
      position: relative;
    }

    .diagram-frame::before,
    .diagram-frame::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 1;
      width: 2.5rem;
      pointer-events: none;
      opacity: 0;
      transition: opacity 160ms ease-out;
    }

    .diagram-frame::before {
      left: 0;
      background: linear-gradient(to right, var(--color-bg3), transparent);
    }

    .diagram-frame::after {
      right: 0;
      background: linear-gradient(to left, var(--color-bg3), transparent);
    }

    .diagram-frame.has-more-left::before,
    .diagram-frame.has-more-right::after {
      opacity: 1;
    }

    /* ---- Vollbild ----
       Die Flaeche fuellt, was ihr der Block gibt, und rollt in beide
       Richtungen. Flex statt Block: mit margin: auto steht eine kleine
       Zeichnung in der Mitte, eine grosse beginnt oben links — bei
       place-items: center laege ihr Anfang ausserhalb des Rollbereichs. */
    :host(.is-expanded) {
      display: block;
      height: 100%;
      min-height: 0;
    }

    :host(.is-expanded) .diagram-body,
    :host(.is-expanded) .diagram-frame {
      height: 100%;
    }

    :host(.is-expanded) .diagram-host {
      display: flex;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
    }

    :host(.is-expanded) .diagram-host ::ng-deep svg {
      flex: none;
      margin: auto;
    }

    .diagram-zoom {
      position: absolute;
      right: 1rem;
      bottom: 1rem;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 0.125rem;
      border: 1px solid var(--color-line);
      border-radius: 9999px;
      background: color-mix(in srgb, var(--color-bg2) 88%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
      padding: 0.25rem;
      font-size: 0.8125rem;
      color: var(--color-muted);
    }

    .diagram-zoom button {
      display: grid;
      place-items: center;
      min-width: 2rem;
      height: 2rem;
      border-radius: 9999px;
      padding-inline: 0.5rem;
      font-size: 1rem;
      line-height: 1;
      transition: background-color 120ms ease-out, color 120ms ease-out;
    }

    .diagram-zoom button:hover {
      background: var(--color-fill-strong);
      color: var(--color-text);
    }

    .diagram-zoom .diagram-zoom-fit {
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .diagram-zoom .diagram-zoom-fit.is-on {
      color: var(--plan-accent, var(--color-brand-2));
    }

    .diagram-zoom-value {
      min-width: 3.25rem;
      text-align: center;
      font-variant-numeric: tabular-nums;
      color: var(--color-text);
    }

    .diagram-zoom-rule {
      width: 1px;
      height: 1rem;
      margin-inline: 0.125rem;
      background: var(--color-line);
    }

    /* Waehrend ein Syntaxfehler offen ist, tritt das letzte gueltige
       Diagramm zurueck — sichtbar veraltet, aber nicht weg. */
    .diagram-host {
      transition: opacity 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .diagram-host.is-stale {
      opacity: 0.45;
    }

    @media (prefers-reduced-motion: reduce) {
      .diagram-host {
        transition: none;
      }
    }
  `,
})
export class MermaidDiagram {
  readonly code = input.required<string>();
  /** Fuellt das Diagramm gerade den Bildschirm? Dann mit Zoom. */
  readonly expanded = input(false);

  /** Gewaehlter Massstab im Vollbild; null heisst eingepasst. */
  protected readonly zoom = signal<number | null>(null);
  /** Der Massstab, in dem die Zeichnung gerade steht. */
  private readonly scale = signal(1);
  protected readonly percent = computed(() => Math.round(this.scale() * 100));

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  protected readonly status = signal<DiagramStatus>('empty');
  protected readonly error = signal<string | null>(null);
  private readonly svg = signal('');

  protected readonly hasDiagram = computed(() => this.svg().length > 0);
  protected readonly ariaLabel = computed(() =>
    this.hasDiagram() ? 'Flow diagram' : 'Flow diagram, not drawn yet',
  );

  /** Laufende Nummer, damit ein spaet zurueckkehrendes Rendern nicht ein
   *  neueres ueberschreibt. */
  private renderSeq = 0;
  private readonly uid = Math.random().toString(36).slice(2, 9);
  private rendered = false;

  constructor() {
    effect((onCleanup) => {
      const code = this.code().trim();

      // Der erste Aufbau soll sofort dastehen; erst beim Tippen wird entprellt,
      // sonst flackert das Diagramm bei jedem Zeichen.
      const delay = this.rendered ? 400 : 0;
      const handle = setTimeout(() => void this.render(code), delay);
      onCleanup(() => clearTimeout(handle));
    });

    effect(() => {
      const svg = this.svg();
      const element = this.host().nativeElement;
      // Mermaid hat im 'strict'-Modus bereits saniert; Angulars HTML-Sanitizer
      // wuerde die SVG dagegen komplett verwerfen.
      element.innerHTML = svg;
      // Erst jetzt, im Dokument, lassen sich Formen vermessen.
      polishDiagram(element.querySelector('svg'));
      this.fit();
    });

    // Auf und zu: jedes Mal eingepasst beginnen.
    effect(() => {
      this.expanded();
      untracked(() => {
        this.zoom.set(null);
        // Erst nach dem Umbau des Layouts steht fest, wie viel Platz da ist.
        requestAnimationFrame(() => this.fit());
      });
    });

    // Schmaler werdendes Fenster, aufgehende Outline: neu einpassen.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const host = this.host().nativeElement;
      const watch = new ResizeObserver(() => this.fit());
      watch.observe(host);
      host.addEventListener('scroll', this.updateEdges, { passive: true });
      destroyRef.onDestroy(() => {
        watch.disconnect();
        host.removeEventListener('scroll', this.updateEdges);
      });
    });
  }

  /** Die Zeichnung auf die Flaeche bringen — siehe fittedWidth. */
  private fit(): void {
    const host = this.host().nativeElement;
    const svg = host.querySelector('svg');
    if (svg) {
      // Die natuerliche Groesse steht nur beim ersten Mal in den Attributen;
      // danach ist sie die eingepasste. Darum wird sie sich gemerkt.
      svg.dataset['natural'] ??= svg.getAttribute('width') ?? '';
      svg.dataset['naturalHeight'] ??= svg.getAttribute('height') ?? '';
      const natural = Number.parseFloat(svg.dataset['natural']);
      const naturalHeight = Number.parseFloat(svg.dataset['naturalHeight']);

      if (natural > 0) {
        const width = this.expanded()
          ? natural * (this.zoom() ?? screenFit(natural, naturalHeight, host.clientWidth, host.clientHeight))
          : fittedWidth(natural, host.clientWidth);
        svg.style.width = `${width}px`;
        this.scale.set(width / natural);
      }
    }
    this.updateEdges();
  }

  /** Eine Stufe naeher oder weiter — ausgehend von dem, was zu sehen ist. */
  protected zoomBy(step: 1 | -1): void {
    this.zoom.set(nextZoom(this.scale(), step));
    this.fit();
  }

  protected zoomToFit(): void {
    this.zoom.set(null);
    this.fit();
  }

  private readonly updateEdges = () => {
    const host = this.host().nativeElement;
    const { left, right } = scrollEdges(host.scrollLeft, host.scrollWidth, host.clientWidth);
    const frame = this.frame().nativeElement;
    frame.classList.toggle('has-more-left', left);
    frame.classList.toggle('has-more-right', right);
  };

  private async render(code: string): Promise<void> {
    this.rendered = true;

    if (!code) {
      this.renderSeq++;
      this.svg.set('');
      this.error.set(null);
      this.status.set('empty');
      return;
    }

    const seq = ++this.renderSeq;
    this.status.set('loading');

    try {
      const mermaid = await loadMermaid();
      applyTheme(mermaid, this.host().nativeElement);
      // parse() wirft bei Syntaxfehlern, ohne etwas in den DOM zu schreiben.
      await mermaid.parse(code);
      const { svg } = await mermaid.render(`plan-diagram-${this.uid}-${seq}`, code);

      if (seq !== this.renderSeq) return;
      this.svg.set(svg);
      this.error.set(null);
      this.status.set('ready');
    } catch (cause) {
      if (seq !== this.renderSeq) return;
      this.error.set(readableError(cause));
      this.status.set('error');
    }
  }
}

/**
 * Mermaid-Fehler sind mehrzeilige Parser-Dumps mit Zeilennummern und ASCII-
 * Pfeilen. Fuer die Fehlerzeile reicht der erste aussagekraeftige Satz.
 */
function readableError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const firstLine = raw.split('\n').find((line) => line.trim().length > 0)?.trim();

  if (!firstLine) return 'This diagram could not be drawn.';
  if (/^parse error/i.test(firstLine)) {
    return 'Syntax error. The last working diagram is still shown.';
  }

  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}
