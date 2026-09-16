import { Component, computed, inject } from '@angular/core';
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

  /**
   * Position der aktiven Lasche. Treibt die gleitende Pille im Template: vier
   * gleich breite Laschen, deshalb reicht der Index — ohne Messen im DOM.
   */
  protected readonly tabIndex = computed(() => {
    switch (this.filter()) {
      case 'active':
        return 0;
      case 'completed':
        return 1;
      case 'favorites':
        return 2;
      default:
        return 3;
    }
  });

  clearSearch(): void { this.searchTerm.set(''); }
}
