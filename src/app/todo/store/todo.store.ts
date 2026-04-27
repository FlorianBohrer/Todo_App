import { withState, signalStore, withMethods, patchState, withComputed, withHooks } from "@ngrx/signals";
import { Todo } from "../model/todo.model";
import { Filter } from "../services/todo";
import { filter } from "rxjs";
import { computed, effect } from "@angular/core";

const STORAGE_KEY = 'todos_v1';

function loadFromStorage(): Todo[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return [];
        const parsed = JSON.parse(raw) as Todo[];
        return parsed;
    } catch {
        return [];
    }
}

export interface TodoState {
    todos: Todo[];
    filter: Filter;
}

export const initialState: TodoState = {
    todos: loadFromStorage(),
    filter: 'all',
};

export const todoStore = signalStore(
    withState(initialState),
    withComputed((store) => ({
   filteredTodos: () => {
    const f = store.filter();
    const items = store.todos();
    if (f === 'active') return items.filter((item) => !item.completed);
    if (f === 'completed') return items.filter((item) => item.completed);
    return items;
   },
   stats: () => {
    const items = store.todos();
    return {
      total: items.length,
      active: items.filter(item => !item.completed).length,
      completed: items.filter(item => item.completed).length,
    };
   }


})),
    withMethods((store) => ({
     addTodo: (title: string) => {
        const todo: Todo = {
            id: crypto.randomUUID(),
            title,
            completed: false,
            createdAt: new Date(),
        };
        patchState(store, { todos: [...store.todos(), todo] });
      },
      removeTodo: (id: string) => {
        patchState(store, { todos: store.todos().filter((todos) => todos.id !== id) })
      },
      renameTodo: (id: string, title: string) => {
        patchState(store, { todos: store.todos().map((todo) => (todo.id === id ? { ...todo,title} : todo))})
     },
    toggleTodo: (id: string) => {
        patchState(store, { 
            todos: store
            .todos()
            .map((todo) => (todo.id === id ? { ...todo,completed: !todo.completed} : todo))
            });
        },
    })),
      withHooks((store) => ({
        onInit: () => {
            effect(() => {
                const todos = store.todos();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
            });
            },
      })),
);

