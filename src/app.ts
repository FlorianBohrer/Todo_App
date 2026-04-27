import { Component, signal} from '@angular/core';
import { Header } from './app/todo/components/header/header';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list/todo-list';
import { todoStore } from './app/todo/store/todo.store';

@Component({
  selector: 'app-root',
  imports: [Header, TodoAdd, TodoFilter, TodoList],
  templateUrl:'./app.html',
  styleUrl: './app.scss',
  providers: [todoStore],
})
export class App {
  protected readonly title = signal('My Tasks');
}