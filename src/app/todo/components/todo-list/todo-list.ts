import { Component, inject, signal } from '@angular/core';
import {
  ConnectedPosition,
  OverlayModule,
} from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';

import {
  TodoService,
  TIMER_PRESETS_MINUTES,
} from '../../services/todo';
import { Todo } from '../../model/todo.model';
import { Autosize } from '../../../directives/autosize.directive';
import { folderColorClass } from '../../shared/folder-color';
import { LabelService } from '../../services/label.service';

import {
  ChevronDown,
  ChevronsUpDown,
  EllipsisVertical,
  GripVertical,
  LucideAngularModule,
  Star,
  Pencil,
  Timer,
  Trash2,
} from 'lucide-angular';

@Component({
  selector: 'app-todo-list',
  imports: [
    Autosize,
    LucideAngularModule,
    OverlayModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
  ],
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.scss',
})
export class TodoList {
  private readonly todoService = inject(TodoService);

  protected readonly labelService = inject(LabelService);

  protected readonly todos = this.todoService.filteredTodos;
  protected readonly stats = this.todoService.stats;
  protected readonly filter = this.todoService.filter;
  protected readonly labels = this.labelService.labels;

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly GripIcon = GripVertical;
  protected readonly StarIcon = Star;
  protected readonly TimerIcon = Timer;
  protected readonly ExpandIcon = ChevronsUpDown;
  protected readonly OptionsIcon = EllipsisVertical;
  protected readonly TrashIcon = Trash2;

  protected readonly timerPresets = TIMER_PRESETS_MINUTES;

  protected readonly openMenuId =
    signal<string | null>(null);

  protected readonly openTimerMenuId =
    signal<string | null>(null);

  protected readonly openOptionsId =
    signal<string | null>(null);

  protected readonly completingTodoIds =
    signal<ReadonlySet<string>>(new Set());

  protected readonly leavingTodoIds =
    signal<ReadonlySet<string>>(new Set());

  protected readonly newTodoId =
    signal<string | null>(null);

  private readonly expandedIds =
    signal<ReadonlySet<string>>(new Set());

    protected readonly editingId = signal<string | null>(null);

  private readonly EXPAND_THRESHOLD = 40;

  protected readonly overlayPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ];
  protected readonly dragStartDelay = { touch: 300, mouse: 0 };

  handleToggleTodo(todo: Todo): void {
    if (this.leavingTodoIds().has(todo.id)) {
      return;
    }

    if (todo.completed) {
      this.todoService.toggleTodo(todo.id);
      return;
    }

    this.updateIdSet(
      this.completingTodoIds,
      todo.id,
      true,
    );

    window.setTimeout(() => {
      this.updateIdSet(
        this.leavingTodoIds,
        todo.id,
        true,
      );
    }, 280);

    window.setTimeout(() => {
      try {
        this.todoService.toggleTodo(todo.id);
      } finally {
        this.clearTodoAnimationState(todo.id);
      }
    }, 540);
  }

  private clearTodoAnimationState(todoId: string): void {
    this.updateIdSet(
      this.completingTodoIds,
      todoId,
      false,
    );

    this.updateIdSet(
      this.leavingTodoIds,
      todoId,
      false,
    );
  }

  startEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    this.editingId.set(todo.id);
    if (this.canExpand(todo.title) && !this.isExpanded(todo.id)) {
      this.toggleExpanded(todo.id, textarea);
    }
    requestAnimationFrame(() => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  /** Beim Verlassen des Felds speichern; leerer Text wird verworfen. */
  finishEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    if (this.editingId() !== todo.id) return;
    this.editingId.set(null);
    const title = textarea.value.trim();
    if (title && title !== todo.title) {
      this.renameTodo(todo.id, title);
    } else {
      textarea.value = todo.title;
    }
  }

  /** Escape: Änderung verwerfen. */
  cancelEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    textarea.value = todo.title;
    this.editingId.set(null);
    textarea.blur();
  }

  private updateIdSet(
    target:
      | typeof this.completingTodoIds
      | typeof this.leavingTodoIds,
    todoId: string,
    add: boolean,
  ): void {
    target.update((current) => {
      const updated = new Set(current);

      if (add) {
        updated.add(todoId);
      } else {
        updated.delete(todoId);
      }

      return updated;
    });
  }

  toggleOptionsMenu(id: string): void {
    this.openOptionsId.update(
      current => current === id ? null : id,
    );
  }

  closeOptionsMenu(): void {
    this.openOptionsId.set(null);
  }

  toggleMenu(id: string): void {
    this.openMenuId.update(
      current => current === id ? null : id,
    );
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  toggleTimerMenu(id: string): void {
    this.openTimerMenuId.update(
      current => current === id ? null : id,
    );
  }

  closeTimerMenu(): void {
    this.openTimerMenuId.set(null);
  }

  canExpand(title: string): boolean {
    return (
      title.length > this.EXPAND_THRESHOLD ||
      title.includes('\n')
    );
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(
    id: string,
    textarea?: HTMLTextAreaElement,
  ): void {
    const expanding = !this.isExpanded(id);

    this.expandedIds.update((current) => {
      const updated = new Set(current);

      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }

      return updated;
    });

    if (expanding && textarea) {
      requestAnimationFrame(() => {
        textarea.style.height = 'auto';
        textarea.style.height =
          `${textarea.scrollHeight}px`;
      });
    }
  }

  setLabel(
    id: string,
    labelId: string | null,
  ): void {
    this.todoService.setTodoLabel(id, labelId);
    this.closeMenu();
  }

  labelName(labelId: string | null): string {
    if (labelId === null) {
      return 'No category';
    }

    return (
      this.labels().find(
        label => label.id === labelId,
      )?.name ?? 'No category'
    );
  }

  dotClass(labelId: string | null): string {
    if (labelId === null) {
      return 'text-zinc-400';
    }

    const label = this.labels().find(
      item => item.id === labelId,
    );

    return folderColorClass(label?.color, 'dot');
  }

  renameTodo(
    id: string,
    title: string,
  ): void {
    this.todoService.renameTodo(id, title);
  }

  removeTodos(id: string): void {
    this.todoService.removeTodo(id);
  }

  toggleTodo(id: string): void {
    this.todoService.toggleTodo(id);
  }

  toggleFavorite(id: string): void {
    this.todoService.toggleFavorite(id);
  }

  drop(event: CdkDragDrop<unknown>): void {
    this.todoService.reorder(
      event.previousIndex,
      event.currentIndex,
    );
  }

  startTimer(
    id: string,
    minutes: number,
  ): void {
    this.todoService.startTimer(
      id,
      minutes * 60,
    );

    this.closeTimerMenu();
  }

  stopTimer(id: string): void {
    this.todoService.stopTimer(id);
  }

  hasTimer(todo: Todo): boolean {
    return todo.timerStartedAt !== null;
  }

  isTimerDone(todo: Todo): boolean {
    return (
      this.hasTimer(todo) &&
      this.todoService.remainingSeconds(todo) === 0
    );
  }

  remainingLabel(todo: Todo): string {
    const total =
      this.todoService.remainingSeconds(todo);

    const minutes =
      Math.floor(total / 60);

    const seconds =
      total % 60;

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}