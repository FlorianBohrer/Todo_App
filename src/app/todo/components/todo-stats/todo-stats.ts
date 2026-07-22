import { Component, inject } from '@angular/core';
import { TodoService } from '../../services/todo';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-todo-stats',
  imports: [DecimalPipe],
  templateUrl: './todo-stats.html',
})
export class TodoStats {
  private readonly todoService = inject(TodoService);
  protected readonly stats = this.todoService.stats;
}
