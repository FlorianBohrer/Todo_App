import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { richParts } from './rich-title';

/**
 * Ein Titel mit seinen fetten Stellen (rich-title.ts), als Text im Fluss:
 * keine eigene Box, die Umgebung bestimmt Schrift, Umbruch und Farbe.
 * Durchgestrichen und ausgegraut bei erledigten Aufgaben gilt so auch für
 * das Fette.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `strong { font-weight: 700; }`,
  template: `@for (part of parts(); track $index) {@if (part.bold) {<strong>{{ part.text }}</strong>} @else {<ng-container>{{ part.text }}</ng-container>}}`,
})
export class RichText {
  readonly text = input.required<string>();

  protected readonly parts = computed(() => richParts(this.text()));
}
