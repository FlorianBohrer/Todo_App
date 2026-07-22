import { Component, inject } from '@angular/core';
import { LucideAngularModule, Search } from 'lucide-angular';
import { TodoService } from '../../services/todo';

@Component({
  selector: 'app-todo-filter',
  imports: [LucideAngularModule],
  templateUrl: './todo-filter.html',
})
export class TodoFilter {
  private readonly todoService = inject(TodoService);
  protected readonly filter = this.todoService.filter;
  protected readonly searchTerm = this.todoService.searchTerm;
  protected readonly SearchIcon = Search;
  clearSearch(): void { this.searchTerm.set(''); }
}