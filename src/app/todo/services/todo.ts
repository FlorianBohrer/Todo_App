import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Todo } from '../model/todo.model';
import { LabelService } from './label.service';

const TODO_KEY = 'todos';

export type Filter = 'all' | 'active' | 'completed';


export interface Stats {
  total: number;
  active: number;
  completed: number;
}

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  private readonly labelService = inject(LabelService);

  private readonly todos = signal<Todo[]>(this.load());
  readonly filter = signal<Filter>('all');

  private readonly todosInCategory = computed(() => {
    const labelId = this.labelService.activeLabelId();
    const items = this.todos();
    return labelId === null ? items : items.filter(i => i.labelId === labelId);
  });

  readonly filteredTodos = computed(() => {
    const f = this.filter();
    // const labelId = this.labelService.activeLabelId();
    let items = this.todosInCategory();

    // Status-Filter
    if (f === 'active')    items = items.filter(i => !i.completed);
    if (f === 'completed') items = items.filter(i => i.completed);

    // Label-Filter (null = alle Kategorien)
    // if (labelId !== null)  items = items.filter(i => i.labelId === labelId);

    return items;
  });

  readonly stats = computed(() => {
    const items = this.todosInCategory();
    return {
      total: items.length,
      active: items.filter(item => !item.completed).length,
      completed: items.filter(item => item.completed).length,
    };
  });

  constructor() {
    effect(() => {
      localStorage.setItem(TODO_KEY, JSON.stringify(this.todos()));
    });
  }

  addTodo(title: string) {
    const t = title.trim();
    if (t === '') return;
    this.todos.update(items => [
      ...items,
      {
        id: crypto.randomUUID(),
        title: t,
        completed: false,
        labelId: this.labelService.activeLabelId(),   // ← aktuelle Auswahl
        createdAt: new Date(),
      },
    ]);
  }

  renameTodo(id: string, title: string) {
    const t = title.trim();
    if (t === '') return;
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, title: t } : item),
    );
  }

  setTodoLabel(id: string, labelId: string | null) {
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, labelId } : item),
    );
  }

  clearLabel(labelId: string) {
    this.todos.update(list =>
      list.map(t => t.labelId === labelId ? { ...t, labelId: null } : t)
    );
  }


  /**
   * Sortiert die aktuell SICHTBARE (gefilterte) Liste um. Die Indizes beziehen
   * sich auf `filteredTodos()`. Ausgefilterte Todos behalten ihre absolute Position.
   */
  reorder(previousIndex: number, currentIndex: number) {
    if (previousIndex === currentIndex) return;
    const visible = this.filteredTodos();
    if (
      previousIndex < 0 || currentIndex < 0 ||
      previousIndex >= visible.length || currentIndex >= visible.length
    ) return;

    const reordered = [...visible];
    const [moved] = reordered.splice(previousIndex, 1);
    reordered.splice(currentIndex, 0, moved);

    const visibleIds = new Set(visible.map(t => t.id));
    let qi = 0;
    this.todos.update(all =>
      all.map(item => (visibleIds.has(item.id) ? reordered[qi++] : item)),
    );
  }

  removeTodo(id: string) {
    this.todos.update(items => items.filter(item => item.id !== id));
  }

  toggleTodo(id: string) {
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, completed: !item.completed } : item),
    );
  }

  private load(): Todo[] {
    try {
      const raw = localStorage.getItem(TODO_KEY);
      return raw ? (JSON.parse(raw) as Todo[]) : [];
    } catch {
      return [];
    }
  }
}