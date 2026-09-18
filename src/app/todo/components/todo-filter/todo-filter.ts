import {ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, Search } from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { isTypingTarget } from '../../shared/keyboard';

@Component({
  selector: 'app-todo-filter',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-filter.html',
})
export class TodoFilter {
  private readonly todoService = inject(TodoService);
  protected readonly filter = this.todoService.filter;
  protected readonly searchTerm = this.todoService.searchTerm;
  protected readonly SearchIcon = Search;

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('todoSearch');

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

  /** „/" springt in die Suche — die Taste, die im Web überall Suchfelder öffnet. */
  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent): void {
    if (event.key !== '/') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    this.searchField()?.nativeElement.focus();
  }

  clearSearch(): void { this.searchTerm.set(''); }
}
