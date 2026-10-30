import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideAngularModule, Monitor, Moon, Sun } from 'lucide-angular';

import { ThemeChoice, ThemeService } from './theme.service';

/**
 * Hell, dunkel, System: drei Symbole in einer Pille, die Wahl ist gefüllt.
 * Kein Menü, weil es nur drei Möglichkeiten gibt und man sie so auf einen
 * Blick sieht.
 *
 * Auf dem Telefon fehlt dafür der Platz — die Kontozeile bräche um. Dort
 * steht ein Knopf mit dem Symbol der Wahl, und jeder Tipp geht eine weiter
 * (hell → dunkel → System); was als Nächstes kommt, sagt sein Name.
 */
@Component({
  selector: 'app-theme-switch',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="theme-switch" role="radiogroup" aria-label="Appearance">
      @for (option of options; track option.value) {
        <button type="button" role="radio" class="theme-switch__option"
          [class.is-active]="themes.choice() === option.value"
          [attr.aria-checked]="themes.choice() === option.value"
          [title]="option.label" [attr.aria-label]="option.label"
          (click)="themes.set(option.value)">
          <lucide-icon [img]="option.icon" class="h-3.5 w-3.5" aria-hidden="true"></lucide-icon>
        </button>
      }
    </div>
    <button type="button" class="theme-cycle" (click)="themes.set(next().value)"
      [title]="'Appearance: ' + current().label" [attr.aria-label]="'Appearance: ' + current().label + '. Switch to ' + next().label">
      <lucide-icon [img]="current().icon" class="h-4 w-4" aria-hidden="true"></lucide-icon>
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }

    .theme-switch {
      display: none;
      align-items: center;
      gap: 0.125rem;
      border: 1px solid var(--color-line);
      border-radius: 999px;
      padding: 0.125rem;
    }

    .theme-switch__option {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      color: var(--color-subtle);
      transition: color 140ms ease-out, background-color 140ms ease-out;
    }

    .theme-switch__option:hover {
      color: var(--color-text);
    }

    .theme-switch__option.is-active {
      background: var(--color-thumb);
      box-shadow: 0 1px 2px rgb(var(--shadow) / calc(0.25 * var(--shadow-k)));
      color: var(--color-text);
    }

    .theme-switch__option:focus-visible {
      outline: 2px solid var(--color-highlight11);
      outline-offset: 1px;
    }

    .theme-cycle {
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.5rem;
      color: var(--color-subtle);
      transition: color 140ms ease-out, background-color 140ms ease-out;
    }

    .theme-cycle:hover {
      background: var(--color-fill);
      color: var(--color-text);
    }

    .theme-cycle:focus-visible {
      outline: 2px solid var(--color-highlight11);
      outline-offset: 1px;
    }

    @media (min-width: 640px) {
      .theme-switch {
        display: inline-flex;
      }

      .theme-switch__option {
        width: 1.5rem;
        height: 1.5rem;
      }

      .theme-cycle {
        display: none;
      }
    }
  `,
})
export class ThemeSwitch {
  protected readonly themes = inject(ThemeService);

  protected readonly options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'Match system', icon: Monitor },
  ];

  protected readonly current = computed(
    () => this.options.find((o) => o.value === this.themes.choice()) ?? this.options[1],
  );
  protected readonly next = computed(
    () => this.options[(this.options.indexOf(this.current()) + 1) % this.options.length],
  );
}
