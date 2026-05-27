import { Component, inject, computed } from '@angular/core';
import { LucideAngularModule, FolderDown } from 'lucide-angular';
import { Header } from './app/todo/components/header/header';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list/todo-list';
import { TodoStats } from './app/todo/components/todo-stats/todo-stats/todo-stats';
import { CategoriesOverlay } from './app/todo/components/categories/categories-overlay';
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
    LucideAngularModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  providers: [],
})
export class App {
  private readonly labelService = inject(LabelService);

  // Dynamischer Titel
  protected readonly title = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'All Tasks';
    const label = this.labelService.labels.find(l => l.id === id);
    return label?.name ?? 'Tasks';
  });

  // Akzent-Farbe (Text, Balken)
  protected readonly accentClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'text-white';
    const label = this.labelService.labels.find(l => l.id === id);
    const map: Record<string, string> = {
      violet:  'text-violet-400',
      emerald: 'text-emerald-400',
      rose:    'text-rose-400',
    };
    return map[label?.color ?? ''] ?? 'text-white';
  });

  // Hintergrund-Farbe
  protected readonly bgClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'bg-panel2';
    const label = this.labelService.labels.find(l => l.id === id);
    const map: Record<string, string> = {
      violet:  'bg-violet-950',
      emerald: 'bg-emerald-950',
      rose:    'bg-rose-950',
    };
    return map[label?.color ?? ''] ?? 'bg-panel2';
  });

  // Icons fürs Template
  protected readonly FolderDownIcon = FolderDown;

  openCategories() {
    this.labelService.openOverlay();
  }
}