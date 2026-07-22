import { Component, inject } from '@angular/core';
import { TodoService } from '../../services/todo';

@Component({
  selector: 'app-todo-filter',
  imports: [],
  templateUrl: './todo-filter.html',
})
export class TodoFilter {
  
  private readonly todoService = inject(TodoService);
  protected readonly filter = this.todoService.filter;
}
