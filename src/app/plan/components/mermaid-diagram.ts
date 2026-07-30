import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Mermaid wiegt rund ein halbes Megabyte. Es wird deshalb erst geholt, wenn
 * tatsaechlich ein Diagramm auf dem Schirm steht — der dynamische Import legt
 * einen eigenen Chunk an, das Startbundle bleibt unberuehrt. Das Promise liegt
 * im Modul, damit sich mehrere Diagramme auf einer Seite eine Ladung teilen.
 */
let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  mermaidLoader ??= import('mermaid').then((module) => {
    const mermaid = module.default;
    // Die Farben kommen aus den App-Tokens statt aus Mermaids Standardpalette,
    // damit das Diagramm nicht wie ein Fremdkoerper im dunklen Layout sitzt.
    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      css.getPropertyValue(name).trim() || fallback;

    const surface = token('--color-panel1', '#1B2236');
    const surfaceAlt = token('--color-panel2', '#232C44');
    const ink = token('--color-text', '#EAEEF9');
    const line = token('--color-muted', '#8C97B4');
    const border = token('--color-border', '#283150');
    const accent = token('--color-highlight2', '#818CF8');

    mermaid.initialize({
      startOnLoad: false,
      // 'strict' laesst Mermaid die erzeugte SVG durch DOMPurify schicken —
      // der Quelltext kommt schliesslich aus einem Eingabefeld.
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'inherit',
      themeVariables: {
        background: 'transparent',
        primaryColor: surface,
        primaryTextColor: ink,
        primaryBorderColor: border,
        secondaryColor: surfaceAlt,
        secondaryTextColor: ink,
        secondaryBorderColor: border,
        tertiaryColor: surfaceAlt,
        tertiaryTextColor: ink,
        tertiaryBorderColor: border,
        lineColor: line,
        textColor: ink,
        mainBkg: surface,
        nodeBorder: border,
        clusterBkg: 'transparent',
        clusterBorder: border,
        titleColor: ink,
        edgeLabelBackground: token('--color-bg2', '#121829'),
        activeTaskBkgColor: accent,
        fontSize: '14px',
      },
      flowchart: {
        // SVG-Text statt foreignObject: vorhersagbar gestylt und kopierbar.
        htmlLabels: false,
        curve: 'basis',
        padding: 12,
        // Ohne das staucht Mermaid die Zeichnung auf die Containerbreite —
        // am Handy werden die Beschriftungen dann unleserlich. Lieber die
        // natuerliche Groesse behalten und waagerecht scrollen lassen.
        useMaxWidth: false,
      },
    });

    return mermaid;
  });

  return mermaidLoader;
}

type DiagramStatus = 'empty' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-mermaid-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <!-- Der Riss beim Tippen: solange ein gueltiges Diagramm existiert,
           bleibt es stehen und der Fehler wird darunter gemeldet. -->
      <div
        #host
        class="diagram-host overflow-x-auto"
        [class.is-stale]="status() === 'error' && hasDiagram()"
        role="img"
        [attr.aria-label]="ariaLabel()"></div>

      @if (status() === 'loading' && !hasDiagram()) {
        <p class="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <span
            class="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          Rendering diagram…
        </p>
      }

      @if (status() === 'empty') {
        <p class="py-6 text-sm text-muted">
          Describe the flow on the left — the diagram appears here.
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
         der Host scrollt stattdessen waagerecht. */
      max-width: none;
      height: auto;
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

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

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
    });
  }

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
    return 'Syntax error — the last working diagram is still shown.';
  }

  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}
