import { Component, inject } from '@angular/core';
import { TodoService } from '../../../../services/todoservicestodo';

@Component({
  selector: 'app-todo-stats',
  imports: [],
  templateUrl: './todo-stats.html',
  styleUrl: './todo-stats.scss',
})
export class TodoStats {
  private readonly todoService = inject(TodoService);
  protected readonly stats = this.todoService.stats;
}
