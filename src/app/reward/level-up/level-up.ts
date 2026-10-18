import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';

import { RewardService } from '../reward.service';

/** So lange steht der große Moment, bevor er sich selbst wegräumt. */
const SHOW_MS = 3600;

/**
 * Level-Up: der eine Moment, der den ganzen Bildschirm bekommt.
 *
 * Kein Dialog: es gibt nichts zu entscheiden, und wer gerade weiterarbeiten
 * will, soll das können. Ein Klick irgendwohin oder Escape räumt ihn sofort
 * weg, sonst geht er nach knapp vier Sekunden von selbst. Der Fokus bleibt,
 * wo er war.
 */
@Component({
  selector: 'app-level-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './level-up.html',
  styleUrl: './level-up.scss',
  host: {
    '(document:keydown.escape)': 'dismiss()',
  },
})
export class LevelUpOverlay {
  private readonly rewards = inject(RewardService);

  protected readonly shown = this.rewards.levelUp;

  /** Mehrere Level auf einmal sagen es auch. */
  protected readonly kicker = computed(() => {
    const up = this.shown();
    if (!up) return '';
    return up.gained > 1 ? `${up.gained} levels up` : 'Level up';
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.shown()) return;
      const timer = setTimeout(() => this.dismiss(), SHOW_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected dismiss(): void {
    if (this.shown()) this.rewards.dismissLevelUp();
  }
}
