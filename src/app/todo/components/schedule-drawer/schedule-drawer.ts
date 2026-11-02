import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CalendarPlus, LucideAngularModule, Repeat, X } from 'lucide-angular';

import { RepeatRule, Todo } from '../../model/todo.model';
import { TodoService } from '../../services/todo';
import { RichText } from '../../shared/rich-text';
import {
  TimeOfDay,
  durationOf,
  formatDuration,
  setDuration,
  setTimeOfDay,
  timeOfDay,
} from '../../shared/title-priority';
import { DatePicker } from '../date-picker/date-picker';

/**
 * Das Termin-Menü der Liste: Tag, Tageszeit, Dauer und Wiederholung in
 * einer Schublade, die von links über den Bildschirm fährt.
 *
 * Eine eigene Komponente, damit die Liste sie nachladen kann (@defer in
 * todo-list.html): sie wird erst gebraucht, wenn man einen Termin setzt.
 */
@Component({
  selector: 'app-schedule-drawer',
  imports: [DatePicker, LucideAngularModule, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-drawer.html',
  styleUrl: './schedule-drawer.scss',
})
export class ScheduleDrawer {
  private readonly todoService = inject(TodoService);

  /** Die Aufgabe, deren Termin gesetzt wird; null = Schublade zu. */
  readonly todo = input<Todo | null>(null);
  /** Ihre erste Zeile, so wie die Liste sie zeigt (mit fetten Stellen). */
  readonly heading = input('');
  /** Schliessen: Knopf, Grund, Escape, „Done" oder ein gewählter Tag. */
  readonly closed = output<void>();

  protected readonly ScheduleIcon = CalendarPlus;
  protected readonly RepeatIcon = Repeat;
  protected readonly ClearIcon = X;

  /** Ein Tag ist gewählt: setzen und zurückfahren, wie vorher das Popover. */
  protected schedule(id: string, iso: string | null): void {
    this.todoService.scheduleTodo(id, iso);
    this.closed.emit();
  }

  // ---- Tageszeit und Dauer ----

  protected readonly timeChoices: readonly { value: TimeOfDay | null; label: string }[] = [
    { value: null, label: 'Anytime' },
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ];

  protected readonly durationChoices: readonly (number | null)[] = [null, 5, 15, 30, 45, 60, 90];

  protected whenOf(todo: Todo): TimeOfDay | null {
    return timeOfDay(todo.title);
  }

  protected minutesOf(todo: Todo): number | null {
    return durationOf(todo.title);
  }

  protected formatDurationText(minutes: number): string {
    return formatDuration(minutes);
  }

  protected setWhen(todo: Todo, when: TimeOfDay | null): void {
    const title = setTimeOfDay(todo.title, when);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  protected setMinutes(todo: Todo, minutes: number | null): void {
    const title = setDuration(todo.title, minutes);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  // ---- Wiederholung ----
  //
  // Vier Angebote statt eines freien Zahlenfelds: taeglich, woechentlich,
  // monatlich decken praktisch alles ab, was man von Hand pflegt. Wer "alle
  // drei Tage" braucht, soll es bekommen, aber nicht auf Kosten dessen, dass
  // die haeufigen Faelle einen Klick brauchen.
  protected readonly repeatChoices: {
    key: string;
    label: string;
    rule: RepeatRule | null;
  }[] = [
    { key: 'none', label: 'Never', rule: null },
    { key: 'day', label: 'Daily', rule: { every: 1, unit: 'day', from: 'due' } },
    { key: 'week', label: 'Weekly', rule: { every: 1, unit: 'week', from: 'due' } },
    { key: 'month', label: 'Monthly', rule: { every: 1, unit: 'month', from: 'due' } },
  ];

  /**
   * Ist dieses Angebot das eingestellte?
   *
   * Vergleicht Anzahl und Einheit, NICHT den Bezugspunkt: „woechentlich" und
   * „woechentlich ab Erledigung" sind derselbe Rhythmus, und der Umschalter
   * darunter regelt den Rest. Sonst fiele die Auswahl heraus, sobald man ihn
   * umlegt.
   */
  protected repeatMatches(todo: Todo, rule: RepeatRule | null): boolean {
    if (rule === null) return todo.repeat === null;
    return todo.repeat !== null && todo.repeat.every === rule.every && todo.repeat.unit === rule.unit;
  }

  protected setRepeat(todo: Todo, rule: RepeatRule | null): void {
    // Den Bezugspunkt behalten, wenn schon einer gewaehlt war: wer ihn einmal
    // auf „ab Erledigung" gestellt hat, meint das auch beim Wechsel von
    // woechentlich auf monatlich.
    const from = todo.repeat?.from ?? 'due';
    this.todoService.setRepeat(todo.id, rule ? { ...rule, from } : null);
  }

  protected toggleRepeatFrom(todo: Todo): void {
    if (!todo.repeat) return;
    this.todoService.setRepeat(todo.id, {
      ...todo.repeat,
      from: todo.repeat.from === 'completion' ? 'due' : 'completion',
    });
  }
}
