import { Component, signal, inject, computed} from '@angular/core';
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


  //Dynamischer Titel
  protected readonly title = computed(() => {
    const id = this.labelService.activeLabelId();
    if(id=== null) return 'All Tasks';
    const label = this.labelService.labels.find(l => l.id === id);
    return label ? label.name ?? 'Tasks' : 'Tasks';
  });

protected readonly accentClass = computed(() => {
  const id = this.labelService.activeLabelId();
  if (id === null) return 'text-white';
  const label = this.labelService.labels.find(l => l.id === id);

  const map: Record<string, string> = {
    violet:  'text-violet-400',
    emerald: 'text-emerald-400',
    rose:    'text-rose-400',
  };
  return map[label?.color ?? ''] ?? 'text-text';
});



  // Icons, die in tmplate verwendet werden, als properties exposen
  protected readonly FolderDownIcon = FolderDown;

  openCategories() {
    this.labelService.openOverlay();
  }
}