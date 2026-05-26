import { Component, signal, inject } from '@angular/core';
import { LucideAngularModule, FolderDown } from 'lucide-angular';
import { Header } from './app/todo/components/header/header';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list/todo-list';
import { TodoStats } from './app/todo/components/todo-stats/todo-stats/todo-stats';
import { CategoriesOverlay } from './app/todo/components/categories/categories-overlay';
import { todoStore } from './app/todo/store/todo.store';
import { LabelService } from './app/todo/services/label.service';


@Component({
  selector: 'app-root',
  imports: [
    Header,
    TodoAdd,
    TodoFilter,
    TodoList,
    TodoStats,
    CategoriesOverlay,
    LucideAngularModule,   // ← hier rein
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  providers: [todoStore],
})

export class App {
  protected readonly title = signal('My Tasks');
  private readonly labelService = inject(LabelService);

  // Icons, die im Template verwendet werden, als Properties exposen
  protected readonly FolderDownIcon = FolderDown;

  openCategories() {
    this.labelService.openOverlay();
  }
}