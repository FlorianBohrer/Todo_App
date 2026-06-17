import { Component, inject, signal } from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkDragDrop } from '@angular/cdk/drag-drop';
import { LucideAngularModule, ChevronDown, GripVertical } from 'lucide-angular';
import { TodoService } from '../../../services/todo';
import { Autosize } from '../../../../directives/autosize.drectives';
import { LabelService } from '../../../services/label.service';


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

  // Welches Todo-Menü ist gerade offen (null = keins)
  protected readonly openMenuId = signal<string | null>(null);

  // Menü rechtsbündig unter dem Trigger, nach oben als Fallback
  protected readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ];

  private readonly colorToDot: Record<string, string> = {
    violet: 'text-violet-400',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    orange: 'text-orange-400',
  };

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
    return this.labels.find(l => l.id === labelId)?.name ?? 'No category';
  }

  dotClass(labelId: string | null): string {
    if (labelId === null) return 'text-zinc-400';
    const label = this.labels.find(l => l.id === labelId);
    return this.colorToDot[label?.color ?? ''] ?? 'text-zinc-400';
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

  drop(event: CdkDragDrop<unknown>){
    this.todoService.reorder(event.previousIndex, event.currentIndex);
  }
}
