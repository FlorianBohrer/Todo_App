import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Moon,
  Plus,
  Sun,
  Sunrise,
  LucideAngularModule,
  type LucideIconData,
} from 'lucide-angular';

import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { Todo } from '../../model/todo.model';
import { DAY_SLOTS, DaySlot, dayPlan, openPerDay, weekDaysOf } from '../../shared/day-plan';
import {
  MoscowLevel,
  TimeOfDay,
  durationOf,
  formatDuration,
  priorityBadge,
  setDuration,
  setTimeOfDay,
  stripPriorityPrefix,
  timeOfDay,
} from '../../shared/title-priority';
import { splitLeadingEmoji, taskIcon, TaskIcon } from '../../shared/task-icon';
import { folderColorClass } from '../../shared/folder-color';
import { fromISODate, shiftISODate, todayISO } from '../../shared/week';
import { TokenChip } from '../../shared/token-chip';
import { WeekView } from '../week-view/week-view';
import { tap } from '../../shared/haptics';

type Mode = 'day' | 'week';
const MODE_KEY = 'calendar.mode';

interface SlotDef {
  id: DaySlot;
  label: string;
  tint: string;
  icon: LucideIconData | null;
  hint: string;
}

const SLOTS: Record<DaySlot, SlotDef> = {
  overdue: { id: 'overdue', label: 'Overdue', tint: 'rose', icon: null, hint: '' },
  anytime: { id: 'anytime', label: 'Anytime', tint: 'neutral', icon: null, hint: 'Anytime today works' },
  morning: { id: 'morning', label: 'Morning', tint: 'peach', icon: Sunrise, hint: 'Nothing for the morning' },
  afternoon: { id: 'afternoon', label: 'Afternoon', tint: 'sky', icon: Sun, hint: 'Nothing for the afternoon' },
  evening: { id: 'evening', label: 'Evening', tint: 'violet', icon: Moon, hint: 'Nothing for the evening' },
};

interface Card {
  id: string;
  title: string;
  icon: TaskIcon;
  iconClass: string;
  done: boolean;
  badge: MoscowLevel | null;
  duration: string;
  /** Für Überfälliges: an welchem Tag es geplant war. */
  late: string;
}

function readMode(): Mode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'day' || raw === 'week') return raw;
  } catch {
    // Kein Speicher: dann nach Breite.
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(min-width: 640px)').matches ? 'week' : 'day';
}

/**
 * Ein Tag auf einen Blick, wie in einem Tagesplaner: oben der Wochentag
 * gross, darunter die Woche als Leiste, dann der Tag in Tageszeiten —
 * jederzeit, morgens, nachmittags, abends. Jedes Fach legt direkt an, und
 * eine Aufgabe wandert mit zwei Tipps in eine andere Tageszeit.
 *
 * Die Woche mit ihren sieben Spalten bleibt eine Wahl daneben: „Day | Week".
 */
@Component({
  selector: 'app-day-view',
  imports: [LucideAngularModule, NgTemplateOutlet, OverlayModule, TokenChip, WeekView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './day-view.html',
  styleUrl: './day-view.scss',
})
export class DayView {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly mode = signal<Mode>(readMode());

  setMode(mode: Mode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Gilt dann bis zum Neuladen.
    }
  }

  // ---- Tag und Woche ----

  private readonly today = signal(todayISO());
  protected readonly selected = signal(todayISO());
  protected readonly isToday = computed(() => this.selected() === this.today());

  protected readonly weekday = computed(() =>
    fromISODate(this.selected()).toLocaleDateString('en-US', { weekday: 'long' }),
  );
  protected readonly monthLabel = computed(() =>
    fromISODate(this.selected()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  );

  private readonly openCounts = computed(() => openPerDay(this.todoService.allTodos()));

  protected readonly strip = computed(() =>
    weekDaysOf(this.selected()).map((iso) => {
      const date = fromISODate(iso);
      return {
        iso,
        letter: date.toLocaleDateString('en-US', { weekday: 'narrow' }),
        name: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        day: date.getDate(),
        isToday: iso === this.today(),
        open: this.openCounts().get(iso) ?? 0,
      };
    }),
  );

  select(iso: string): void {
    this.selected.set(iso);
    this.addingIn.set(null);
  }

  shiftWeek(by: number): void {
    this.select(shiftISODate(this.selected(), by * 7));
  }

  goToday(): void {
    this.today.set(todayISO());
    this.select(this.today());
  }

  // ---- Fächer ----

  private readonly plan = computed(() => dayPlan(this.todoService.allTodos(), this.selected(), this.today()));
  protected readonly collapsed = signal<ReadonlySet<DaySlot>>(new Set());

  protected readonly summary = computed(() => {
    const { done, total, minutesLeft } = this.plan();
    if (total === 0) return this.isToday() ? 'Nothing planned for today yet' : 'Nothing planned for this day';
    const parts = [`${done} of ${total} done`];
    if (minutesLeft > 0) parts.push(`${formatDuration(minutesLeft)} left`);
    return parts.join(' · ');
  });

  protected readonly sections = computed(() => {
    const plan = this.plan();
    return DAY_SLOTS.filter((slot) => slot !== 'overdue' || plan.slots.overdue.length > 0).map((slot) => ({
      ...SLOTS[slot],
      cards: plan.slots[slot].map((todo) => this.toCard(todo, slot === 'overdue')),
      collapsed: this.collapsed().has(slot),
    }));
  });

  private toCard(todo: Todo, overdue: boolean): Card {
    const text = stripPriorityPrefix(todo.title).split('\n')[0].trim();
    const minutes = durationOf(todo.title);
    const label = this.labelService.labelById(todo.labelIds[0] ?? '');
    return {
      id: todo.id,
      title: splitLeadingEmoji(text).rest,
      icon: taskIcon(text),
      iconClass: folderColorClass(label?.color, 'iconBox'),
      done: todo.completed,
      badge: priorityBadge(todo.title),
      duration: minutes === null ? '' : formatDuration(minutes),
      late: overdue && todo.scheduledDate
        ? fromISODate(todo.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : '',
    };
  }

  toggleSlot(slot: DaySlot): void {
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (!next.delete(slot)) next.add(slot);
      return next;
    });
  }

  // ---- Anlegen ----

  protected readonly addingIn = signal<DaySlot | null>(null);

  openAdd(slot: DaySlot): void {
    if (this.collapsed().has(slot)) this.toggleSlot(slot);
    this.addingIn.set(slot);
    requestAnimationFrame(() =>
      this.host.nativeElement.querySelector<HTMLInputElement>(`[data-day-input="${slot}"]`)?.focus(),
    );
  }

  add(slot: DaySlot, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) {
      this.addingIn.set(null);
      return;
    }
    const prefix = slot === 'anytime' || slot === 'overdue' ? '' : `/${slot} `;
    this.todoService.addTodo(prefix + text, this.selected());
    input.value = '';
    tap();
  }

  onAddBlur(input: HTMLInputElement): void {
    if (!input.value.trim()) this.addingIn.set(null);
  }

  // ---- Aufgabe ----

  toggle(id: string): void {
    this.todoService.toggleTodo(id);
    tap();
  }

  protected readonly menuFor = signal<string | null>(null);
  protected readonly menuOrigin = signal<HTMLElement | null>(null);

  openMenu(id: string, event: Event): void {
    this.menuOrigin.set(event.currentTarget as HTMLElement);
    this.menuFor.set(this.menuFor() === id ? null : id);
  }

  closeMenu(): void {
    this.menuFor.set(null);
  }

  protected readonly menuTodo = computed(() => this.todoService.todoById(this.menuFor()));

  protected readonly times: readonly { value: TimeOfDay | null; label: string }[] = [
    { value: null, label: 'Anytime' },
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ];

  protected readonly durations: readonly (number | null)[] = [null, 5, 15, 30, 45, 60, 90];

  protected currentTime(todo: Todo): TimeOfDay | null {
    return timeOfDay(todo.title);
  }

  setTime(todo: Todo, when: TimeOfDay | null): void {
    const title = setTimeOfDay(todo.title, when);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  setLength(todo: Todo, minutes: number | null): void {
    const title = setDuration(todo.title, minutes);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  protected durationOf = durationOf;
  protected formatDuration = formatDuration;

  moveTo(todo: Todo, iso: string | null): void {
    this.todoService.scheduleTodo(todo.id, iso);
    this.closeMenu();
  }

  protected tomorrowOf(): string {
    return shiftISODate(this.selected(), 1);
  }

  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly PlusIcon = Plus;
  protected readonly MoreIcon = EllipsisVertical;
}
