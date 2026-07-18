import { Component, inject, signal } from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkDragDrop } from '@angular/cdk/drag-drop';
import { TodoService, TIMER_PRESETS_MINUTES } from '../../../services/todo';
import { Todo } from '../../../model/todo.model';
import { Autosize } from '../../../../directives/autosize.drectives';
import { folderColorClass } from '../../../shared/folder-color';
import { LabelService } from '../../../services/label.service';
import {
  LucideAngularModule,
  ChevronDown,
  ChevronsUpDown,
  GripVertical,
  Star,
  Timer,
} from 'lucide-angular';


@Component({
  selector: 'app-todo-list',
  imports: [Autosize, LucideAngularModule, OverlayModule, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.scss',
})
export class TodoList {
  private readonly todoService = inject(TodoService);
  protected readonly labelService = inject(LabelService)

  protected readonly todos = this.todoService.filteredTodos;
  protected readonly stats = this.todoService.stats;
  protected readonly filter = this.todoService.filter;
  protected readonly labels = this.labelService.labels;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly GripIcon = GripVertical;
  protected readonly StarIcon = Star;
  protected readonly TimerIcon = Timer;
  protected readonly timerPresets = TIMER_PRESETS_MINUTES;

  // Welches Todo-Menü ist gerade offen (null = keins)
  protected readonly openMenuId = signal<string | null>(null);

  // Welches Timer-Menü ist gerade offen (null = keins)
  protected readonly openTimerMenuId = signal<string | null>(null);

  protected readonly ExpandIcon = ChevronsUpDown;

  // Aufgeklappte Todos: voller Text statt einer geklemmten Zeile.
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  /** Ab dieser Länge lohnt sich Aufklappen (mobil wrappt Text früh). */
  private readonly EXPAND_THRESHOLD = 40;

  canExpand(title: string): boolean {
    return title.length > this.EXPAND_THRESHOLD || title.includes('\n');
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(id: string, textarea?: HTMLTextAreaElement) {
    const expanding = !this.isExpanded(id);

    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    // Höhe frisch messen: der Wert der Autosize-Direktive stammt vom Init und
    // kann veraltet sein (z.B. gemessen, bevor das Layout stand).
    if (expanding && textarea) {
      requestAnimationFrame(() => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      });
    }
  }

  // Menü rechtsbündig unter dem Trigger, nach oben als Fallback
  protected readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ];

  toggleMenu(id: string) {
    this.openMenuId.update(cur => (cur === id ? null : id));
  }

  closeMenu() {
    this.openMenuId.set(null);
  }

  setLabel(id: string, labelId: string | null) {
    this.todoService.setTodoLabel(id, labelId);
    this.closeMenu();
  }

  labelName(labelId: string | null): string {
    if (labelId === null) return 'No category';
    return this.labels().find(l => l.id === labelId)?.name ?? 'No category';
  }

  dotClass(labelId: string | null): string {
    if (labelId === null) return 'text-zinc-400';
    const label = this.labels().find(l => l.id === labelId);
    return folderColorClass(label?.color, 'dot');
  }

  renameTodo(id: string, title: string){
    this.todoService.renameTodo(id, title);
  }

  removeTodos(id: string){
    this.todoService.removeTodo(id);
  }

  toggleTodo(id: string){
    this.todoService.toggleTodo(id);
  }

  toggleFavorite(id: string){
    this.todoService.toggleFavorite(id);
  }

  drop(event: CdkDragDrop<unknown>){
    this.todoService.reorder(event.previousIndex, event.currentIndex);
  }

  // ---- Zeitblock ----
  toggleTimerMenu(id: string) {
    this.openTimerMenuId.update(cur => (cur === id ? null : id));
  }

  closeTimerMenu() {
    this.openTimerMenuId.set(null);
  }

  startTimer(id: string, minutes: number) {
    this.todoService.startTimer(id, minutes * 60);
    this.closeTimerMenu();
  }

  stopTimer(id: string) {
    this.todoService.stopTimer(id);
  }

  hasTimer(todo: Todo): boolean {
    return todo.timerStartedAt !== null;
  }

  isTimerDone(todo: Todo): boolean {
    return this.hasTimer(todo) && this.todoService.remainingSeconds(todo) === 0;
  }

  /** Restzeit als mm:ss. */
  remainingLabel(todo: Todo): string {
    const total = this.todoService.remainingSeconds(todo);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}
