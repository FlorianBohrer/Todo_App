import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { FocusSessionService } from '../../services/focus-session.service';
import { TodoService } from '../../services/todo';
import { splitTitle } from '../../shared/title-token';

/**
 * Was in Flow gerade läuft — klein, in der Leiste.
 *
 * Die Webseite hat keinen Timer; der lebt in Flow. Aber wer hier vorbeischaut,
 * soll sehen, dass dort gerade an etwas gearbeitet wird, und woran: ein Punkt,
 * die Restzeit, der Titel. Ein Klick zeigt das Todo in der Liste.
 *
 * Läuft nichts, ist nichts zu sehen — auch kein „Flow: idle". Eine Anzeige,
 * die meistens „nichts" sagt, lernt man zu übersehen.
 */
@Component({
  selector: 'app-flow-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-status.html',
  styles: `
    .flow-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 9999px;
      background: var(--color-ok);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-ok) 60%, transparent);
      animation: flow-breathe 2.4s ease-in-out infinite;
    }

    /* Pausiert: der Punkt steht, und er ist ein Ring statt einer Fläche —
       die Form sagt es, nicht nur die Farbe. */
    .flow-dot.is-paused {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--color-muted);
      animation: none;
    }

    @keyframes flow-breathe {
      50% {
        box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-ok) 0%, transparent);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .flow-dot {
        animation: none;
      }
    }
  `,
})
export class FlowStatus {
  private readonly focus = inject(FocusSessionService);
  private readonly todoService = inject(TodoService);

  protected readonly active = this.focus.active;

  /** Tickt nur, solange ein Block läuft. */
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;
  private refreshedAtZero = false;

  protected readonly secondsLeft = computed(() => {
    const active = this.active();
    if (!active) return 0;
    if (active.endsAt === null) return active.remainingSeconds;
    return Math.max(0, Math.ceil((active.endsAt - this.now()) / 1000));
  });

  protected readonly clock = computed(() => {
    const total = this.secondsLeft();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  /** Der Titel ohne Präfix — wie überall. */
  protected readonly title = computed(() => {
    const active = this.active();
    return active ? splitTitle(active.title).text.split('\n')[0].trim() : '';
  });

  protected readonly label = computed(() => {
    const active = this.active();
    if (!active) return '';
    const state = active.paused ? 'paused' : `${this.clock()} left`;
    return `Focusing in Flow on “${this.title()}”, ${state}. Show it in the list.`;
  });

  constructor() {
    effect(() => {
      const active = this.active();
      const running = active !== null && !active.paused;

      if (running && this.ticker === null) {
        this.refreshedAtZero = false;
        this.now.set(Date.now());
        this.ticker = setInterval(() => {
          this.now.set(Date.now());
          // Bei null nachfragen: der Block ist in Flow vermutlich eben zu Ende
          // gegangen, und die nächste Minute zu warten sähe aus wie ein Hänger.
          if (this.secondsLeft() === 0 && !this.refreshedAtZero) {
            this.refreshedAtZero = true;
            void this.focus.refresh(true);
          }
        }, 1000);
      } else if (!running && this.ticker !== null) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.ticker !== null) clearInterval(this.ticker);
    });
  }

  protected show(): void {
    const todo = this.todoService.todoById(this.active()?.todoId);
    if (todo) this.todoService.reveal(todo);
  }
}
