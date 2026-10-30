import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { TitleToken, tokenClass, tokenDescription, tokenIcon, tokenText } from './title-token';

/**
 * Ein Präfix als Zeichen: Symbol auf Farbfläche, ohne Wort.
 *
 * Dieselbe Darstellung überall — Liste, Woche, Eingabefeld, Suche —, damit
 * man ⇈ einmal lernt und es dann überall wiedererkennt. Das Wort steht im
 * Tooltip und ist, was die Vorlesesoftware hört.
 *
 * Steht das Zeichen in einem Knopf, der es selbst beschreibt (der Chip zum
 * Entfernen), setzt der Aufrufer `decorative`: sonst hörte man es zweimal.
 */
@Component({
  selector: 'app-token-chip',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-grid flex-none place-items-center rounded-md',
    '[class]': 'classes()',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : description()',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
    '[attr.title]': 'description()',
  },
  template: `<lucide-icon [img]="icon()" [class]="iconClass()" aria-hidden="true"></lucide-icon>@if (text(); as t) {<span class="text-2xs font-medium tabular-nums">{{ t }}</span>}`,
})
export class TokenChip {
  readonly token = input.required<TitleToken>();
  /** sm: Woche und Suchtreffer, md: Liste und Eingabefeld. */
  readonly size = input<'sm' | 'md'>('md');
  readonly decorative = input(false);

  protected readonly icon = computed(() => tokenIcon(this.token()));
  protected readonly description = computed(() => tokenDescription(this.token()));
  /** Nur die Dauer trägt Text: eine Uhr allein sagt nicht, wie lange. */
  protected readonly text = computed(() => tokenText(this.token()));

  protected readonly classes = computed(() => {
    const box = this.text()
      ? `${this.size() === 'sm' ? 'h-4' : 'h-5'} grid-flow-col gap-0.5 px-1`
      : this.size() === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    return `${tokenClass(this.token())} ${box}`;
  });

  protected readonly iconClass = computed(() =>
    this.size() === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
  );
}
