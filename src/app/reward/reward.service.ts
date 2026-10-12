import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import { Todo } from '../todo/model/todo.model';
import { TodoService } from '../todo/services/todo';
import {
  GOLD_COLORS,
  Point,
  buzz,
  burst,
  centerOf,
  fireworks,
  floatText,
  goldSound,
  levelUpSound,
  popSound,
  unlockAudio,
} from './celebrate';
import { Combo, LevelUp, levelFor, levelUpBetween, nextCombo } from './level';
import { rewardFor, totalXp } from './todo-xp';

const SOUND_KEY = 'reward.sound';

/**
 * Wie lange ein zweites Abhaken desselben Todos als dasselbe gilt.
 *
 * Die Liste feiert sofort beim Klick, der Haken selbst wird erst nach der
 * Ausblende-Animation gesetzt — dann meldet sich derselbe Vorgang ein zweites
 * Mal über TodoService.completions.
 */
const SAME_TICK_MS = 3000;

/** Wann das Level-Up kommt: erst landet das Konfetti am Haken, dann der große Moment. */
const LEVEL_UP_DELAY_MS = 450;

export interface Gain {
  /** Fortlaufend, damit zwei gleiche Gewinne hintereinander als zwei zählen. */
  id: number;
  amount: number;
  golden: boolean;
  onTime: boolean;
  combo: number;
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Level, XP und die Feier beim Abhaken.
 *
 * Der Stand selbst ist abgeleitet (siehe todo-xp.ts). Was hier lebt, ist nur
 * der Moment: welche Combo gerade läuft, was eben gewonnen wurde, und ob
 * gerade ein Level-Up auf dem Bildschirm steht.
 */
@Injectable({ providedIn: 'root' })
export class RewardService {
  private readonly todoService = inject(TodoService);

  readonly xp = computed(() => totalXp(this.todoService.withArchive()));
  readonly level = computed(() => levelFor(this.xp()));

  /** Ton an oder aus. Ein Komfort, also im Browser gemerkt. */
  readonly sound = signal(readSound());

  /** Das Level-Up, das gerade gefeiert wird. null = keins. */
  readonly levelUp = signal<LevelUp | null>(null);

  /** Der letzte Gewinn — für die Ansage und das Aufleuchten des Abzeichens. */
  readonly lastGain = signal<Gain | null>(null);

  private combo: Combo | null = null;
  private gainCount = 0;

  /** Wann welches Todo zuletzt gefeiert wurde. */
  private readonly celebratedAt = new Map<string, number>();

  /** Wo zuletzt gedrückt wurde — dort startet das Konfetti. */
  private pointer: { point: Point; at: number } | null = null;

  constructor() {
    effect(() => {
      const on = this.sound();
      try {
        localStorage.setItem(SOUND_KEY, String(on));
      } catch {
        /* Merken ist ein Komfort, kein Muss. */
      }
    });

    const subscription = this.todoService.completions.subscribe((todo) => this.reward(todo));

    const onPointer = (event: PointerEvent) => {
      this.pointer = { point: { x: event.clientX, y: event.clientY }, at: Date.now() };
    };
    // capture: das Konfetti soll dort starten, wo der Finger war — auch wenn
    // ein Element darunter das Ereignis anhält.
    document.addEventListener('pointerdown', onPointer, { capture: true, passive: true });

    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      document.removeEventListener('pointerdown', onPointer, { capture: true });
    });
  }

  toggleSound(): void {
    this.sound.update((on) => !on);
    if (this.sound()) unlockAudio();
  }

  dismissLevelUp(): void {
    this.levelUp.set(null);
  }

  /**
   * Ein Todo wurde erledigt — feiern.
   *
   * Darf vor dem eigentlichen Abhaken aufgerufen werden (die Liste tut das,
   * damit die Belohnung im selben Moment wie der Klick kommt) und danach
   * (über TodoService.completions). Der zweite Aufruf innerhalb weniger
   * Sekunden wird verschluckt.
   */
  reward(todo: Todo, anchor?: Element | null): void {
    const now = Date.now();
    const previous = this.celebratedAt.get(todo.id);
    if (previous !== undefined && now - previous < SAME_TICK_MS) return;

    // Schon einmal gefeiert, zurückgenommen, wieder abgehakt: kein neuer Lauf
    // der Combo. Die XP stimmen ohnehin, es geht nur ums Spektakel.
    const repeat = previous !== undefined;
    this.celebratedAt.set(todo.id, now);

    const reward = rewardFor({ ...todo, completed: true, completedAt: todo.completedAt ?? new Date() });

    // Steht das Todo im Bestand schon als erledigt, stecken seine XP bereits
    // in xp(). Sonst kommen sie gleich dazu.
    const counted = this.todoService.todoById(todo.id)?.completed === true;
    const after = counted ? this.xp() : this.xp() + reward.total;
    const levelUp = levelUpBetween(after - reward.total, after);

    if (!repeat) this.combo = nextCombo(this.combo, now);
    const combo = this.combo?.count ?? 1;

    this.lastGain.set({
      id: ++this.gainCount,
      amount: reward.total,
      golden: reward.golden,
      onTime: reward.onTime,
      combo,
    });

    const origin = this.originFor(anchor);
    const colors = reward.golden ? GOLD_COLORS : this.viewColors();

    if (this.sound()) {
      if (reward.golden) goldSound();
      else popSound(repeat ? 1 : combo);
    }

    if (!repeat) {
      // Jede Stufe der Combo legt nach: mehr Teile, mehr Wucht. Gedeckelt,
      // sonst wäre die zwanzigste Aufgabe ein Bildschirm voller Papier.
      const level = Math.min(combo, 8);
      burst(origin, {
        colors,
        count: reward.golden ? 110 : 34 + level * 10,
        power: reward.golden ? 0.85 : 0.5 + level * 0.04,
        stars: reward.golden ? 0.45 : 0.12,
      });
    }

    floatText(origin, `+${reward.total} XP`, reward.golden ? 'gold' : 'xp');
    if (reward.golden) floatText(origin, 'Golden · double XP', 'combo', 26);
    else if (combo >= 2 && !repeat) floatText(origin, `Combo ×${combo}`, 'combo', 26);

    if (reward.golden) buzz([18, 50, 18, 50, 28]);

    if (levelUp) {
      window.setTimeout(() => {
        this.levelUp.set(levelUp);
        fireworks([...GOLD_COLORS, ...colors]);
        if (this.sound()) levelUpSound();
        buzz([30, 60, 30, 60, 120]);
      }, LEVEL_UP_DELAY_MS);
    }
  }

  /** Woher das Konfetti kommt: vom Element, vom letzten Druck, vom Fokus — oder aus der Mitte. */
  private originFor(anchor?: Element | null): Point {
    if (anchor) return centerOf(anchor);
    if (this.pointer && Date.now() - this.pointer.at < 1500) return this.pointer.point;

    const active = document.activeElement;
    if (active && active !== document.body) return centerOf(active);

    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  /**
   * Die Farben der offenen Ansicht, frisch aus dem CSS gelesen.
   *
   * Konfetti in Türkis in der Liste, in Orange in der Woche, in Bordeaux in
   * den Plänen — dieselbe Farbentscheidung wie überall sonst, plus Weiß und
   * ein wenig Gold, damit es nach Belohnung aussieht und nicht nach Tapete.
   */
  private viewColors(): string[] {
    const style = getComputedStyle(document.documentElement);
    const accents = ['--accent-200', '--accent-300', '--accent-400']
      .map((name) => style.getPropertyValue(name).trim())
      .filter((value) => value.length > 0);

    return [...accents, ...accents, '#FFFFFF', '#FDE68A'];
  }
}
