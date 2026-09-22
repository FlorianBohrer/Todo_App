import {ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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

import { TodoService } from '../../services/todo';
import { NgClass } from '@angular/common';
import { Todo } from '../../model/todo.model';
import { Autosize } from '../../../directives/autosize.directive';
import { folderColorClass } from '../../shared/folder-color';
import {
  MoscowLevel,
  MOSCOW_LABEL,
  stripPriorityPrefix,
  priorityBadge,
} from '../../shared/title-priority';
import { folderIcon } from '../../shared/folder-icon';
import { LabelService, Label} from '../../services/label.service';
import { isOverdueDate, scheduleLabel, scheduleOptions } from '../../shared/schedule';

import {
  CalendarPlus,
  ChevronDown,
  ChevronsUpDown,
  EllipsisVertical,
  GripVertical,
  LucideAngularModule,
  Star,
  Pencil,
  Trash2,
  Folder,
} from 'lucide-angular';

@Component({
  selector: 'app-todo-list',
  imports: [
    Autosize,
    LucideAngularModule,
    OverlayModule,
    CdkDropList,
    CdkDrag,
    
    CdkDragPlaceholder,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.scss',
})
export class TodoList {
  private readonly todoService = inject(TodoService);

  protected readonly labelService = inject(LabelService);

  protected readonly todos = this.todoService.filteredTodos;
  protected readonly stats = this.todoService.stats;
  protected readonly filter = this.todoService.filter;
  protected readonly favoritesAllDone = this.todoService.favoritesAllDone;
  protected readonly labels = this.labelService.labels;
  protected readonly FolderIcon = Folder;

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly GripIcon = GripVertical;
  protected readonly StarIcon = Star;
  protected readonly ExpandIcon = ChevronsUpDown;
  protected readonly OptionsIcon = EllipsisVertical;
  protected readonly TrashIcon = Trash2;
    protected readonly PencilIcon = Pencil;
  protected readonly ScheduleIcon = CalendarPlus;


  /** true, solange die erste Ladung Todos unterwegs ist. */
  protected readonly loading = this.todoService.loading;
  /** Platzhalterzeilen, damit @for etwas zu zaehlen hat. */
  protected readonly skeletonRows = [0, 1, 2];
  protected readonly folderListOpen = signal(false);

toggleFolderList(): void {
  this.folderListOpen.update(open => !open);
}

  protected readonly openMenuId =
    signal<string | null>(null);

  protected readonly openScheduleId =
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
  protected readonly dragStartDelay = { touch: 300, mouse: 200 };



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

  /** Titel für die Ansicht — ohne das Prioritäts-Präfix. */
  displayTitle(title: string): string {
    return stripPriorityPrefix(title);
  }

  /** Die MoSCoW-Stufe eines Titels — für das Badge in der Zeile. */
  priorityBadge(title: string): MoscowLevel | null {
    return priorityBadge(title);
  }

  /** Beschriftung des Badges. */
  badgeLabel(level: MoscowLevel): string {
    return MOSCOW_LABEL[level];
  }

  /**
   * Farbe des Badges. Rosé für das Unverhandelbare, Indigo für das Wichtige,
   * neutral für das Verzichtbare — und Won't tritt zurück: es ist bewusst
   * draußen, nicht dringend.
   */
  badgeClass(level: MoscowLevel): string {
    switch (level) {
      case 'must':   return 'bg-rose-500/20 text-rose-300';
      case 'should': return 'bg-indigo-500/20 text-indigo-300';
      case 'could':  return 'bg-fill-strong text-muted';
      case 'wont':   return 'bg-fill text-subtle line-through';
    }
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
  this.openOptionsId.update(current => current === id ? null : id);
  this.folderListOpen.set(false);
}

closeOptionsMenu(): void {
  this.openOptionsId.set(null);
  this.folderListOpen.set(false);
}

  toggleMenu(id: string): void {
    this.openMenuId.update(
      current => current === id ? null : id,
    );
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  // ---- Termin ----
  // Ein Todo trug schon immer ein Datum, nur gesetzt wurde es allein per Ziehen
  // in der Wochenansicht. Die Liste zeigt es jetzt und vergibt es auch.

  /** Heute, morgen, Wochenende, nächste Woche — jeweils frisch gerechnet. */
  scheduleChoices() {
    return scheduleOptions();
  }

  /** Kurze Beschriftung des Termins, z.B. „Tomorrow" oder „Sep 24". */
  scheduleText(todo: Todo): string {
    return todo.scheduledDate === null ? '' : scheduleLabel(todo.scheduledDate);
  }

  /** Termin verstrichen und noch offen — nur dann ist die Warnfarbe ehrlich. */
  isLate(todo: Todo): boolean {
    return !todo.completed && isOverdueDate(todo.scheduledDate);
  }

  toggleScheduleMenu(id: string): void {
    this.openScheduleId.update(current => current === id ? null : id);
  }

  closeScheduleMenu(): void {
    this.openScheduleId.set(null);
  }

  schedule(id: string, iso: string | null): void {
    this.todoService.scheduleTodo(id, iso);
    this.closeScheduleMenu();
  }

  /**
   * Aufgeklappt trennt die Karte den Titel von den Unterpunkten: die erste
   * Zeile bleibt in der Kopfzeile neben Checkbox und Bedienelementen, alles
   * danach steht eingerueckt darunter. Zusammengeklappt bleibt der ganze Text
   * stehen und wird per CSS auf zwei Zeilen begrenzt.
   */
  firstLine(title: string): string {
    return stripPriorityPrefix(title).split('\n')[0].trim();
  }

  /** Alles nach der ersten Zeile; leer, wenn der Text einzeilig ist. */
  detailLines(title: string): string {
    const [, ...rest] = stripPriorityPrefix(title).split('\n');
    return rest.join('\n').trim();
  }

  /** Nur im aufgeklappten Zustand und ausserhalb des Bearbeitens aufteilen. */
  showsDetail(todo: { id: string; title: string }): boolean {
    return (
      this.isExpanded(todo.id) &&
      this.editingId() !== todo.id &&
      this.detailLines(todo.title).length > 0
    );
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

  /** Label an-/abwählen — Menü bleibt offen (Mehrfachauswahl). */
  toggleLabel(id: string, labelId: string): void {
    this.todoService.toggleLabel(id, labelId);
  }

  /** Alle Labels eines Todos entfernen. */
  clearLabels(id: string): void {
    this.todoService.setLabels(id, []);
    this.closeMenu();
  }

  /** Primäres Label (erste ID) — bestimmt Rand-/Punktfarbe. */
  primaryLabelId(labelIds: string[]): string | null {
    return labelIds[0] ?? null;
  }

  private primaryLabel(labelIds: string[]) {
    const id = labelIds[0];
    return this.labelService.labelById(id);
  }

  labelIcon(label: Label){
    return folderIcon(label.icon);
  }

  labelTitleClass(label: Label): string {
    return folderColorClass(label.color, 'text');
  }

  /** Gradient-Icon-Kachel in der Farbe des primären Labels. */
  tileClass(labelIds: string[]): string {
    return folderColorClass(this.primaryLabel(labelIds)?.color, 'tile');
  }
  tileTextClass(labelIds: string[]): string {
    return folderColorClass(this.primaryLabel(labelIds)?.color, 'text');
  }
  tileIcon(labelIds: string[]) {
    return folderIcon(this.primaryLabel(labelIds)?.icon);
  }

  isLabelActive(labelIds: string[], labelId: string): boolean {
    return labelIds.includes(labelId);
  }

  labelName(labelId: string | null): string {
    if (labelId === null) {
      return 'No category';
    }

    return this.labelService.labelById(labelId)?.name ?? 'No category';
  }

  /** Namen aller Labels als Tooltip-Text (Punkte in der Zeile zeigen keine Namen). */
  labelTitle(labelIds: string[]): string {
    if (labelIds.length === 0) return 'No labels';
    return labelIds.map(id => this.labelName(id)).join(', ');
  }

  dotClass(labelId: string | null): string {
    if (labelId === null) {
      return 'text-zinc-400';
    }

    return folderColorClass(this.labelService.labelById(labelId)?.color, 'dot');
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

}