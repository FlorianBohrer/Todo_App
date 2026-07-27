import { Component, computed, inject, signal } from '@angular/core';
import { CdkDropListGroup, CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { LucideAngularModule, ChevronLeft, ChevronRight } from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { Todo } from '../../model/todo.model';
import { buildWeek, weekRangeLabel } from '../../shared/week';
import { stripPriorityPrefix } from '../../shared/title-priority';

@Component({
  selector: 'app-week-view',
  imports: [LucideAngularModule, CdkDropListGroup, CdkDropList, CdkDrag],
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
})
export class WeekView {
  private readonly todoService = inject(TodoService);
  protected readonly labelService = inject(LabelService);

  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;

  private readonly weekOffset = signal(0);

  protected readonly week = computed(() => buildWeek(this.weekOffset()));
  protected readonly rangeLabel = computed(() => weekRangeLabel(this.week()));
  protected readonly isCurrentWeek = computed(() => this.weekOffset() === 0);

  // Backlog = ungeplante Todos (kein Datum).
  protected readonly backlog = computed(() =>
    this.todoService.todosForDate(null),
  );

  todosForDay(iso: string): Todo[] {
    return this.todoService.todosForDate(iso);
  }

  dayProgress(iso: string): { done: number; total: number; percent: number } {
    const items = this.todoService.todosForDate(iso);
    const done = items.filter((t) => t.completed).length;
    const total = items.length;
    return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  }

  prevWeek() { this.weekOffset.update((o) => o - 1); }
  nextWeek() { this.weekOffset.update((o) => o + 1); }
  goToday() { this.weekOffset.set(0); }

  /** Drag zwischen Tagen (und Backlog): setzt das Datum des Ziel-Containers. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drop(event: CdkDragDrop<any>) {
    if (event.previousContainer === event.container) return;
    const todo = event.item.data as Todo;
    const targetDate = event.container.data as string | null;
    this.todoService.scheduleTodo(todo.id, targetDate);
  }

  quickAdd(iso: string, input: HTMLInputElement) {
    const value = input.value.trim();
    if (!value) return;
    this.todoService.addTodo(value, iso);
    input.value = '';
  }

  toggle(id: string) {
    this.todoService.toggleTodo(id);
  }

  displayTitle(title: string): string {
    return stripPriorityPrefix(title);
  }

  borderClass(todo: Todo): string {
    return this.labelService.borderClassFor(todo.labelIds[0] ?? null);
  }
}
