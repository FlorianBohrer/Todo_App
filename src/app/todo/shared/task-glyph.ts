import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input, signal } from '@angular/core';

import { TaskIcon, bareEmoji } from './task-icon';

type Pictures = Readonly<Record<string, readonly [string, string]>>;

/**
 * Die gezeichneten Bilder, nachgeladen. Sie sind 23 KB Pfaddaten und lagen
 * damit über dem Budget des Start-Bundles; als eigener Teil kommen sie direkt
 * nach dem Start, und bis dahin bleibt die Kachel leer statt kurz ein Emoji
 * zu zeigen. Schlägt das Laden fehl (offline), stehen die Emoji da.
 */
@Injectable({ providedIn: 'root' })
export class TaskGlyphs {
  readonly pictures = signal<Pictures | null>(null);
  private requested = false;

  load(): void {
    if (this.requested) return;
    this.requested = true;
    import('./task-glyphs').then(
      (module) => this.pictures.set(module.DUOTONE),
      () => this.pictures.set({}),
    );
  }
}

/**
 * Das Bild in der Kachel vor einer Aufgabe: gezeichnet, wenn es eins gibt
 * (Fläche mit 20 % Deckung, Kontur darüber, beides in currentColor — die
 * Kachel setzt die Farbe des Ordners), sonst das Emoji oder der Buchstabe.
 *
 * Ohne eigene Fläche: die Kachel gehört der Stelle, an der sie steht (Liste,
 * Tag, Fokus, Statistik), mit ihrer Grösse und Tönung.
 */
@Component({
  selector: 'app-task-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (paths(); as p) {
      <svg class="task-glyph" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path [attr.d]="p[0]" opacity="0.2" />
        <path [attr.d]="p[1]" />
      </svg>
    } @else if (!waiting()) {
      {{ icon().glyph }}
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .task-glyph {
      display: block;
      width: 58%;
      height: 58%;
    }
  `,
})
export class TaskGlyph {
  readonly icon = input.required<TaskIcon>();

  private readonly glyphs = inject(TaskGlyphs);

  protected readonly paths = computed(() => {
    const icon = this.icon();
    return icon.drawn ? (this.glyphs.pictures()?.[bareEmoji(icon.glyph)] ?? null) : null;
  });

  /** Ein Bild ist angekündigt, aber noch nicht da: dann lieber kurz nichts als ein Emoji. */
  protected readonly waiting = computed(() => this.icon().drawn && this.glyphs.pictures() === null);

  constructor() {
    this.glyphs.load();
  }
}
