import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { richParts } from './rich-title';

/**
 * Ein Titel mit seinen fetten Stellen und Links (rich-title.ts), als Text im Fluss:
 * keine eigene Box, die Umgebung bestimmt Schrift, Umbruch und Farbe.
 * Durchgestrichen und ausgegraut bei erledigten Aufgaben gilt so auch für
 * das Fette.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `
    strong, .bold { font-weight: 700; }
    a {
      color: var(--color-brand-2);
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
      text-underline-offset: 2px;
      overflow-wrap: anywhere;
    }
    a:hover { text-decoration-color: currentColor; }
  `,
  // Der Klick auf einen Link öffnet ihn, statt die Aufgabe zum Bearbeiten.
  template: `@for (part of parts(); track $index) {@if (part.href) {<a [href]="part.href" [title]="part.href" [class.bold]="part.bold" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()">{{ part.text }}</a>} @else if (part.bold) {<strong>{{ part.text }}</strong>} @else {<ng-container>{{ part.text }}</ng-container>}}`,
})
export class RichText {
  readonly text = input.required<string>();

  protected readonly parts = computed(() => richParts(this.text()));
}
