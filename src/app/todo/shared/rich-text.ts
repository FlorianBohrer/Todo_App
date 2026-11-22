import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

import { richParts } from './rich-title';

/**
 * Ein Titel mit seinen fetten Stellen und Links (rich-title.ts), als Text im
 * Fluss: keine eigene Box, die Umgebung bestimmt Schrift, Umbruch und Farbe.
 * Durchgestrichen und ausgegraut bei erledigten Aufgaben gilt so auch für
 * das Fette.
 *
 * Ein Link steht kurz da („github.com/…/pull/52", die volle Adresse im
 * Tooltip). Mit `links` ist er ein echter Link, der in einem neuen Tab
 * aufgeht. Ohne steht er nur als Link gefärbt da: auf Karten, die selbst
 * etwas tun, wenn man sie antippt (Woche, Home), wäre ein Link darin eine
 * zweite Bedeutung für denselben Tipp — und in einem Knopf ist er nicht
 * erlaubt.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `strong { font-weight: 700; }`,
  // Eine Zeile: Angular machte aus Umbrüchen zwischen den Stücken Leerzeichen.
  // <wbr> nach jedem „/": eine Adresse bricht an ihren Teilen um, nicht mitten
  // im Wort.
  template: `@for (part of parts(); track $index) {@if (part.pieces) {@if (links()) {<a class="rich-link" [class.font-bold]="part.bold" [href]="part.href" [title]="part.title" target="_blank" rel="noopener noreferrer" draggable="false" (click)="$event.stopPropagation()">@for (piece of part.pieces; track $index) {{{ piece }}@if (!$last) {<wbr>}}</a>} @else {<span class="rich-link rich-link--static" [class.font-bold]="part.bold" [title]="part.title">@for (piece of part.pieces; track $index) {{{ piece }}@if (!$last) {<wbr>}}</span>}} @else if (part.bold) {<strong>{{ part.text }}</strong>} @else {<ng-container>{{ part.text }}</ng-container>}}`,
})
export class RichText {
  readonly text = input.required<string>();
  /** Links anklickbar machen (Liste, Tag). Sonst nur als Link gefärbt. */
  readonly links = input(false, { transform: booleanAttribute });

  protected readonly parts = computed(() =>
    richParts(this.text()).map((part) => ({
      ...part,
      pieces: part.href ? part.text.split('/').map((s, i, all) => (i < all.length - 1 ? s + '/' : s)) : null,
    })),
  );
}
