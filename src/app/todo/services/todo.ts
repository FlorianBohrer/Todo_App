import { computed, effect, Injectable, signal } from '@angular/core';
import { Todo } from '../model/todo.model';

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
  private readonly todos = signal<Todo[]>(this.load());
  readonly filter = signal<Filter>('all');

  readonly filteredTodos = computed(() => {
    const f = this.filter();
    const items = this.todos();
    if (f === 'active') return items.filter((item) => !item.completed);
    if (f === 'completed') return items.filter((item) => item.completed);
    return items;
  });

  readonly stats = computed(() => {
    const items = this.todos();
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
    if(t === '') return;
    this.todos.update(items => [
      ...items,
      { id: crypto.randomUUID(), title, completed: false, createdAt: new Date() }
    ]);
    console.log( this.todos());
  }

  renameTodo(id:string, title: string){
    const t = title.trim();
    if(t === '') return;
    this.todos.update((items) =>
      items.map((item) => (item.id === id ? {...item, title}: item))
   );
  }

  removeTodo(id: string) {
    this.todos.update((items) => items.filter((item) => item.id !== id));
  }

  toggleTodo(id: string) {
    this.todos.update((items) =>
      items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item)
    );
  }

  private load(): Todo[] {
    try {
      const raw = localStorage.getItem(TODO_KEY);
      return raw ? (JSON.parse(raw) as Todo[]) : [];
       } catch {
        return[];
       }
    }
  }

  // clearCompleted() {
  //   this.todos.update(items => items.filter((item) => !item.completed));
  // }

  // private saveToStorage() {
  //   localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.todos()));
  // }

  // private loadFromStorage(): Todo[] {
  //   const data = localStorage.getItem(this.Stor)
  // }
//}