// src/app.ts
import { Component, inject, computed, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { firstValueFrom, take } from 'rxjs';
import { ClerkService } from 'ngx-clerk';
import { LucideAngularModule, FolderDown, ArrowDown, Plus } from 'lucide-angular';
import { Header } from './app/todo/components/header/header';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list/todo-list';
import { TodoStats } from './app/todo/components/todo-stats/todo-stats/todo-stats';
import { CategoriesOverlay } from './app/todo/components/categories/categories-overlay';
import { UserAccount } from './app/todo/components/user-account/user-account';
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
    UserAccount,
    LucideAngularModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  providers: [],
})
export class App {
  private readonly labelService = inject(LabelService);
  protected readonly clerk = inject(ClerkService);

  /** true, wenn das Clerk-Script nicht geladen werden konnte (Netzwerk/Limit). */
  protected readonly clerkFailed = signal(false);

  constructor() {
    this.clerk.__init({ publishableKey: 'pk_test_d2lzZS1za3lsYXJrLTY3LmNsZXJrLmFjY291bnRzLmRldiQ' });

    // Schlägt der Script-Load fehl, gibt es keinen Retry — ohne diesen Hinweis
    // bliebe nur ein toter Anmelden-Button ohne jede Fehlermeldung übrig.
    const timeout = setTimeout(() => this.clerkFailed.set(true), 8000);
    this.clerk.clerk$.pipe(take(1)).subscribe(() => {
      clearTimeout(timeout);
      this.clerkFailed.set(false);
    });
  }

  signIn() {
    this.clerk.openSignIn();
  }

  reloadPage() {
    location.reload();
  }

  async signOut() {
    const clerk = await firstValueFrom(this.clerk.clerk$);
    await clerk.signOut();
  }

  protected readonly title = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'All Tasks';
    const label = this.labelService.labels().find((l) => l.id === id);
    return label?.name ?? 'Tasks';
  });

  protected readonly accentClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'text-white';
    const label = this.labelService.labels().find((l) => l.id === id);
    const map: Record<string, string> = {
      violet: 'text-violet-400',
      emerald: 'text-emerald-400',
      rose: 'text-rose-400',
      orange: 'text-orange-400',
    };
    return map[label?.color ?? ''] ?? 'text-white';
  });

  protected readonly bgClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'bg-panel1';
    const label = this.labelService.labels().find((l) => l.id === id);
    const map: Record<string, string> = {
      violet: 'bg-violet-950',
      emerald: 'bg-emerald-950',
      rose: 'bg-rose-950',
      orange: 'bg-orange-950',
    };
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