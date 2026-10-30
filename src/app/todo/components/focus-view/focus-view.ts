import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  Check,
  CircleDot,
  Music,
  Pause,
  Play,
  Square,
  Timer,
  X,
  LucideAngularModule,
} from 'lucide-angular';

import { TodoService } from '../../services/todo';
import { Ambience, FocusTimerService } from '../../services/focus-timer.service';
import {
  DIAL_MAX,
  DIAL_MIN,
  DIAL_STEP,
  angleAt,
  angleFor,
  arcPath,
  clock,
  minutesAt,
  pointAt,
} from '../../shared/focus-dial';
import { rankForFocus } from '../../shared/focus';
import { durationOf, formatDuration, stripPriorityPrefix, taskLevel } from '../../shared/title-priority';
import { isSection } from '../../shared/section';
import { splitLeadingEmoji, taskIcon } from '../../shared/task-icon';
import { Todo } from '../../model/todo.model';

/** Mittelpunkt und Radius des Rads im SVG (viewBox 300 × 300). */
const C = 150;
const R = 120;

interface Pick {
  id: string;
  title: string;
  glyph: string;
  initial: boolean;
  minutes: number | null;
}

/**
 * Die Ansicht „Focus": ein Drehrad für die Dauer, Start, Pause, Stopp — und
 * dazu die Aufgabe, um die es geht, und ein Rauschen im Hintergrund.
 *
 * Ein Ring statt eines Zahlenfelds, weil Zeit sich als Anteil einer Stunde
 * besser greifen lässt als als Zahl: 25 Minuten sind ein Viertel und ein
 * bisschen. Läuft der Timer, schrumpft derselbe Ring mit der Zeit.
 */
@Component({
  selector: 'app-focus-view',
  imports: [LucideAngularModule, OverlayModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './focus-view.html',
  styleUrl: './focus-view.scss',
})
export class FocusView {
  private readonly todoService = inject(TodoService);
  protected readonly timer = inject(FocusTimerService);

  protected readonly minutes = this.timer.minutes;
  protected readonly state = this.timer.state;
  protected readonly ambience = this.timer.ambience;

  /** Gestellt werden kann nur, solange nichts läuft. */
  protected readonly adjustable = computed(() => this.state() === 'idle' || this.state() === 'done');

  /** Der Bogen: beim Einstellen die Dauer, beim Laufen der Rest. */
  protected readonly angle = computed(() =>
    this.adjustable() ? angleFor(this.minutes()) : this.timer.fraction() * 360,
  );
  protected readonly arc = computed(() => arcPath(C, C, R, this.angle()));
  protected readonly knob = computed(() => pointAt(C, C, R, this.angle()));

  protected readonly bigText = computed(() =>
    this.adjustable() ? String(this.minutes()) : clock(this.timer.left()),
  );
  protected readonly subText = computed(() => {
    switch (this.state()) {
      case 'running':
        return 'left';
      case 'paused':
        return 'paused';
      case 'done':
        return 'done · again?';
      default:
        return 'mins';
    }
  });

  /** Die Stundenmarken im Ring, wie auf einem Zifferblatt. */
  protected readonly marks = [
    { label: '60', x: C, y: C - 78 },
    { label: '15', x: C + 80, y: C },
    { label: '30', x: C, y: C + 80 },
    { label: '45', x: C - 80, y: C },
  ];

  // ---- Drehen ----

  private readonly dial = viewChild<ElementRef<SVGSVGElement>>('dial');
  private dragging = false;

  protected onPointerDown(event: PointerEvent): void {
    if (!this.adjustable()) return;
    this.dragging = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.follow(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.follow(event);
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  private follow(event: PointerEvent): void {
    const svg = this.dial()?.nativeElement;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const angle = angleAt(box.left + box.width / 2, box.top + box.height / 2, event.clientX, event.clientY);
    const next = minutesAt(angle, this.minutes());
    if (next !== this.minutes()) {
      this.timer.setMinutes(next);
      if ('vibrate' in navigator) navigator.vibrate?.(4);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.adjustable()) return;
    const step = { ArrowUp: DIAL_STEP, ArrowRight: DIAL_STEP, ArrowDown: -DIAL_STEP, ArrowLeft: -DIAL_STEP } as Record<
      string,
      number
    >;
    if (event.key in step) {
      event.preventDefault();
      this.timer.setMinutes(this.minutes() + step[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.timer.setMinutes(DIAL_MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.timer.setMinutes(DIAL_MAX);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.timer.start();
    }
  }

  // ---- Aufgabe ----

  protected readonly pickerOpen = signal(false);
  protected readonly soundOpen = signal(false);

  protected readonly task = computed<Pick | null>(() => {
    const todo = this.todoService.todoById(this.timer.taskId());
    return todo ? this.toPick(todo) : null;
  });

  /** Was zur Wahl steht: offene Aufgaben, das Dringende zuerst. */
  protected readonly picks = computed<Pick[]>(() =>
    rankForFocus(
      this.todoService
        .allTodos()
        .filter((t) => !t.completed && !t.archivedAt && !isSection(t.title) && taskLevel(t.title) !== 'sub'),
    )
      .slice(0, 12)
      .map((t) => this.toPick(t)),
  );

  private toPick(todo: Todo): Pick {
    const text = stripPriorityPrefix(todo.title).split('\n')[0].trim();
    const icon = taskIcon(text);
    return {
      id: todo.id,
      title: splitLeadingEmoji(text).rest,
      glyph: icon.glyph,
      initial: icon.initial,
      minutes: durationOf(todo.title),
    };
  }

  protected choose(pick: Pick | null): void {
    this.timer.setTask(pick?.id ?? null);
    // Steht eine Dauer an der Aufgabe, gilt sie — gedeckelt auf eine Stunde.
    if (pick?.minutes && this.adjustable()) this.timer.setMinutes(Math.min(DIAL_MAX, pick.minutes));
    this.pickerOpen.set(false);
  }

  protected completeTask(): void {
    const id = this.timer.taskId();
    if (!id) return;
    const todo = this.todoService.todoById(id);
    if (todo && !todo.completed) this.todoService.toggleTodo(id);
    this.timer.setTask(null);
  }

  protected readonly taskDone = computed(() => {
    const todo = this.todoService.todoById(this.timer.taskId());
    return todo?.completed ?? false;
  });

  // ---- Klang ----

  protected readonly sounds: readonly { value: Ambience; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'brown', label: 'Brown noise' },
    { value: 'rain', label: 'Rain' },
    { value: 'white', label: 'White noise' },
  ];

  protected readonly soundLabel = computed(
    () => this.sounds.find((s) => s.value === this.ambience())?.label ?? 'Off',
  );

  protected setSound(value: Ambience): void {
    this.timer.setAmbience(value);
    this.soundOpen.set(false);
  }

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  ];
  protected readonly positionsEnd: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  protected readonly formatDuration = formatDuration;

  protected readonly MusicIcon = Music;
  protected readonly TimerIcon = Timer;
  protected readonly PlayIcon = Play;
  protected readonly PauseIcon = Pause;
  protected readonly StopIcon = Square;
  protected readonly CheckIcon = Check;
  protected readonly ClearIcon = X;
  protected readonly DotIcon = CircleDot;
}
