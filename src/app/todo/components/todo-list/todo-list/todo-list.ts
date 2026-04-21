import { Component, inject } from '@angular/core';
import { TodoStats } from '../../todo-stats/todo-stats/todo-stats';
import { TodoService } from '../../../../services/todoservicestodo';

@Component({
  selector: 'app-todo-list',
  imports: [TodoStats],
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.scss',
})
export class TodoList {
  private readonly todoService = inject(TodoService);
  protected readonly todos = this.todoService.filteredTodos;
  protected readonly stats = this.todoService.stats;

  renameTodo(id: string, title: string){
    this.todoService.renameTodo(id, title);
  }

  removeTodos(id: string){
    this.todoService.removeTodo(id);
  }

  toggleTodo(id: string){
    this.todoService.toggleTodo(id);
  }
}
