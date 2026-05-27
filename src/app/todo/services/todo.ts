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