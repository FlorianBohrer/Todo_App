import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Fortschritt als Ring.
 *
 * Vorher stand an jeder dieser Stellen ein Balken mit einer Prozentzahl
 * daneben. Ein Balken ist eine Kante: er endet irgendwo im Nichts, und damit
 * die Kante lesbar bleibt, braucht sie die Zahl als Beschriftung. Ein Ring hat
 * eine Form, die man ansieht — er sagt dasselbe, ohne beschriftet zu werden.
 *
 * Die Farbe kommt über `currentColor`, nicht über eine eigene Palette: der
 * Ring trägt die Farbe des Ordners oder der Ansicht, und das ist in dieser App
 * die einzige Farbentscheidung, die etwas bedeutet. Wer den Ring einfärben
 * will, setzt eine `text-*`-Klasse auf das Element.
 */
@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-grid place-items-center',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    role: 'img',
    '[attr.aria-label]': 'label()',
  },
  styles: `
    :host {
      position: relative;
    }

    svg {
      display: block;
    }

    /* Der Bogen wächst, er springt nicht. Dieselbe Kurve wie überall sonst
       in der App — schnell los, sanft ankommen. */
    .ring-arc {
      transition: stroke-dashoffset 520ms var(--spring);
    }

    .ring-face {
      position: absolute;
      display: grid;
      place-items: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .ring-arc {
        transition: none;
      }
    }
  `,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
      aria-hidden="true"
    >
      <!-- Die Spur: dieselbe Farbe, nur leise. Eine eigene graue Farbe wäre
           eine zweite Entscheidung für dieselbe Sache. -->
      <circle
        [attr.cx]="center()"
        [attr.cy]="center()"
        [attr.r]="radius()"
        fill="none"
        stroke="currentColor"
        [attr.stroke-width]="thickness()"
        opacity="0.18"
      ></circle>

      <!-- Bei null Prozent gar kein Bogen: eine runde Kappe auf einer
           Bogenlänge von null zeichnen manche Browser als Punkt, und ein
           Punkt sähe aus wie ein kleiner Fortschritt. -->
      @if (percent() > 0) {
        <circle
          class="ring-arc"
          [class]="arcClass()"
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          fill="none"
          stroke="currentColor"
          [attr.stroke-width]="thickness()"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference()"
          [attr.stroke-dashoffset]="offset()"
          [attr.transform]="'rotate(-90 ' + center() + ' ' + center() + ')'"
        ></circle>
      }
    </svg>

    <!-- Fertig: ein Haken statt einer 100. Die Zahl wäre die längste
         Beschriftung des Rings, ausgerechnet im einzigen Zustand, der keine
         braucht.

         Sonst steht in der Mitte, was der Aufrufer hineinlegt (etwa der
         Stern der Favoriten). Die Mitte ist ohnehin leer, und neben dem Ring
         kostet jedes Zeichen dem Namen Breite. -->
    <span class="ring-face" aria-hidden="true">
      @if (done() && check() && size() >= 32) {
        <svg
          [attr.width]="checkSize()"
          [attr.height]="checkSize()"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      } @else {
        <ng-content />
      }
    </span>
  `,
})
export class ProgressRing {
  readonly completed = input.required<number>();
  readonly total = input.required<number>();

  readonly size = input(44);
  readonly thickness = input(4.5);

  /**
   * Zusätzliche Klasse auf dem Bogen.
   *
   * Dafür da, dass die Feier-Animation beim Erreichen von 100 % den Bogen
   * findet (`.folder-progress`) — sie lag vorher auf dem Balken.
   */
  readonly arcClass = input('');

  /**
   * Bei 100 % einen Haken in die Mitte setzen.
   *
   * Abschaltbar für einen Ring, dessen Mitte schon etwas trägt: der Stern der
   * Favoriten dreht sich genau im Moment des Erreichens einmal um sich selbst
   * — ersetzte ihn dann der Haken, liefe die Feier ins Leere.
   */
  readonly check = input(true);

  /** Was die Vorlesesoftware hört. Ohne das wäre der Ring reine Dekoration. */
  readonly label = computed(() => {
    const total = this.total();
    if (total === 0) return 'Nothing to do';
    return `${this.completed()} of ${total} done`;
  });

  readonly percent = computed(() => {
    const total = this.total();
    if (total <= 0) return 0;
    // Geklemmt, damit ein Zählfehler irgendwo oben nicht als überfüllter
    // Ring endet, der dann gar nichts mehr aussagt.
    return Math.max(0, Math.min(1, this.completed() / total));
  });

  readonly done = computed(() => this.total() > 0 && this.percent() === 1);

  readonly center = computed(() => this.size() / 2);
  readonly radius = computed(() => (this.size() - this.thickness()) / 2);
  readonly circumference = computed(() => 2 * Math.PI * this.radius());
  readonly offset = computed(() => this.circumference() * (1 - this.percent()));
  readonly checkSize = computed(() => Math.round(this.size() * 0.46));
}
