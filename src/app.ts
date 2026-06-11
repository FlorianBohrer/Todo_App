// src/app.ts
import { Component, inject, computed, HostListener } from '@angular/core';
import { LucideAngularModule, FolderDown, ArrowDown,Plus} from 'lucide-angular';
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
    AsyncPipe,
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
  protected readonly clerk = inject(ClerkService);

  constructor() {
    this.clerk.__init({ publishableKey: 'pk_test_d2lzZS1za3lsYXJrLTY3LmNsZXJrLmFjY291bnRzLmRldiQ' });
  }

  signIn() {
    this.clerk.openSignIn();
  }

  async signOut() {
    const clerk = await firstValueFrom(this.clerk.clerk$);
    await clerk.signOut();
  }

  async logToken() {
    const session = await firstValueFrom(this.clerk.session$);
    const token = await session?.getToken();
    console.log(token);
  }

  protected readonly title = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'All Tasks';
    const label = this.labelService.labels.find((l) => l.id === id);
    return label?.name ?? 'Tasks';
  });

  protected readonly accentClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'text-white';
    const label = this.labelService.labels.find((l) => l.id === id);
    const map: Record<string, string> = {
      violet: 'text-violet-400',
      emerald: 'text-emerald-400',
      rose: 'text-rose-400',
    };
    return map[label?.color ?? ''] ?? 'text-white';
  });

  protected readonly bgClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'bg-panel1';
    const label = this.labelService.labels.find((l) => l.id === id);
    const map: Record<string, string> = {
      violet: 'bg-violet-950',
      emerald: 'bg-emerald-950',
      rose: 'bg-rose-950',
    };
    const resullt = map[label?.color ?? ''] ?? 'bg-panel2';
    console.log('bgClass ',{ id, color: label?.color, result: resullt });
    return map[label?.color ?? ''] ?? 'bg-highlight11';
  
  });

 

  // Icons fürs Template
  protected readonly FolderDownIcon = FolderDown;
  protected readonly ArrowDown = ArrowDown;
  protected readonly PlusIcon = Plus;

  openCategories() {
    this.labelService.openOverlay();
  }
}
