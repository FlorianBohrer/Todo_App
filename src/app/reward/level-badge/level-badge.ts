import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ProgressRing } from '../../todo/components/progress-ring/progress-ring';
import { nextTitle } from '../level';
import { RewardService } from '../reward.service';
import { BASE_XP, ON_TIME_BONUS, SUBTASK_XP } from '../todo-xp';

/** Wie lange das Abzeichen nach einem Gewinn aufleuchtet. */
const PULSE_MS = 900;

/**
 * Das Level in der Leiste.
 *
 * Steht in der Leiste und nicht in der Liste, weil dort in jeder Ansicht
 * abgehakt wird — in der Woche und in den Plänen genauso. Gold statt der
 * Farbe der Ansicht: XP sind dieselbe Währung, wo immer sie verdient werden.
 */
@Component({
  selector: 'app-level-badge',
  imports: [ProgressRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './level-badge.html',
  styleUrl: './level-badge.scss',
  host: {
    class: 'relative',
    '(document:keydown.escape)': 'close()',
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
})
export class LevelBadge {
  private readonly rewards = inject(RewardService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly level = this.rewards.level;
  protected readonly sound = this.rewards.sound;
  protected readonly open = signal(false);
  protected readonly pulsing = signal(false);

  protected readonly next = computed(() => nextTitle(this.level().level));
  protected readonly toNext = computed(() => this.level().stepSize - this.level().intoLevel);
  protected readonly percent = computed(() => Math.round(this.level().progress * 100));

  protected readonly rules = BASE_XP;
  protected readonly subtaskXp = SUBTASK_XP;
  protected readonly onTimeBonus = ON_TIME_BONUS;

  /**
   * Was eine Vorlesesoftware nach einem Gewinn hört. Das Konfetti sieht sie
   * nicht — also bekommt sie die Zahl.
   */
  protected readonly announcement = computed(() => {
    const gain = this.rewards.lastGain();
    if (!gain) return '';
    const parts = [`Plus ${gain.amount} XP`];
    if (gain.golden) parts.push('golden task, double XP');
    if (gain.combo >= 2) parts.push(`combo ${gain.combo}`);
    return parts.join(', ') + '.';
  });

  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      if (!this.rewards.lastGain()) return;

      this.pulsing.set(false);
      // Ein Bild später wieder an, damit die Animation auch bei zwei Gewinnen
      // hintereinander neu startet statt einfach weiterzulaufen.
      const frame = requestAnimationFrame(() => this.pulsing.set(true));
      if (this.pulseTimer !== null) clearTimeout(this.pulseTimer);
      this.pulseTimer = setTimeout(() => this.pulsing.set(false), PULSE_MS);

      onCleanup(() => cancelAnimationFrame(frame));
    });
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected toggleSound(): void {
    this.rewards.toggleSound();
  }

  protected onDocumentPointer(event: PointerEvent): void {
    if (!this.open()) return;
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) return;
    this.close();
  }
}
