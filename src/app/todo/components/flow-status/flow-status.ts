import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { OverlayModule } from '@angular/cdk/overlay';
import { LucideAngularModule, Pause, Play } from 'lucide-angular';

import { FocusSessionService, elapsedNow, formatClock } from '../../services/focus-session.service';
import { TodoService } from '../../services/todo';
import { splitTitle } from '../../shared/title-token';
import { firstLineOf, stripBold } from '../../shared/rich-title';
import { TrackPicker } from '../track-picker/track-picker';

/**
 * Die Leiste der Zeiterfassung, oben rechts.
 *
 * Läuft etwas, steht dort, woran gearbeitet wird und seit wann: die Uhr zählt
 * hoch, ohne Pausen, so wie die Zeit auch gespeichert wird. Ein Knopf
 * pausiert direkt in der Leiste; ein Klick auf den Rest öffnet das Fenster
 * mit Stoppen, Erledigen und dem Wechsel zu einer anderen Aufgabe
 * (track-picker). Läuft nichts, steht dort „Track".
 *
 * Die Zeit liegt auf dem Server, wie die Blöcke aus Flow — es gibt immer nur
 * eine laufende Erfassung, egal von wo sie gestartet wurde.
 */
@Component({
  selector: 'app-flow-status',
  imports: [OverlayModule, LucideAngularModule, TrackPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-status.html',
  styleUrl: './flow-status.scss',
})
export class FlowStatus {
  private readonly focus = inject(FocusSessionService);
  private readonly todoService = inject(TodoService);

  protected readonly PlayIcon = Play;
  protected readonly PauseIcon = Pause;

  protected readonly active = this.focus.active;
  protected readonly busy = this.focus.busy;
  protected readonly open = signal(false);

  // ---- Die Uhr ----
  // Tickt nur, solange etwas läuft.
  private readonly now = signal(Date.now());
  protected readonly clock = computed(() => {
    const active = this.active();
    return active ? formatClock(elapsedNow(active, this.now())) : '';
  });

  protected readonly title = computed(() => {
    const active = this.active();
    if (!active) return '';
    const todo = this.todoService.todoById(active.todoId);
    return stripBold(firstLineOf(splitTitle(todo?.title ?? active.title).text));
  });

  protected readonly label = computed(() => {
    const active = this.active();
    if (!active) return 'Track time on a task';
    const state = active.paused ? 'paused at' : 'running for';
    return `Working on “${this.title()}”, ${state} ${this.clock()}. Open to switch, pause or stop.`;
  });

  constructor() {
    let ticker: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const active = this.active();
      const running = active !== null && !active.paused;
      if (running && ticker === null) {
        this.now.set(Date.now());
        ticker = setInterval(() => this.now.set(Date.now()), 1000);
      } else if (!running && ticker !== null) {
        clearInterval(ticker);
        ticker = null;
      }
    });

    // Wer die erfasste Aufgabe abhakt, ist mit ihr fertig: die Erfassung
    // endet mit. Nur bei einer Erfassung von der Webseite — einen Block in
    // Flow zu beenden hiesse, Flow den Boden unter seiner eigenen Uhr
    // wegzuziehen; dort endet er, wie Flow es vorsieht.
    const completions = this.todoService.completions.subscribe((todo) => {
      const active = this.active();
      if (active?.tracked && active.todoId === todo.id) void this.focus.stop();
    });

    inject(DestroyRef).onDestroy(() => {
      if (ticker !== null) clearInterval(ticker);
      completions.unsubscribe();
    });
  }

  toggle(): void {
    this.open.set(!this.open());
  }

  close(): void {
    this.open.set(false);
  }

  /** Pause und weiter gleich in der Leiste, ohne das Fenster zu öffnen. */
  pauseOrResume(event: Event): void {
    event.stopPropagation();
    const active = this.active();
    if (!active?.tracked) return;
    void (active.paused ? this.focus.resume() : this.focus.pause());
  }
}
