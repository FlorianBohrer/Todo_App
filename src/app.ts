// src/app.ts
import {ChangeDetectionStrategy, Component, HostListener, inject, computed, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { firstValueFrom, take } from 'rxjs';
import { ClerkService } from 'ngx-clerk';
import {
  LucideAngularModule,
  FolderDown,
  ArrowDown,
  Plus,
  LayoutList,
  CalendarDays,
  NotebookPen,
} from 'lucide-angular';
import { Header } from './app/todo/components/header/header';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list';
import { TodoStats } from './app/todo/components/todo-stats/todo-stats';
import { FocusPanel } from './app/todo/components/focus-panel/focus-panel';
import { CategoriesOverlay } from './app/todo/components/categories/categories-overlay';
import { FavoriteFolders } from './app/todo/components/favorite-folders/favorite-folders';
import { WeekView } from './app/todo/components/week-view/week-view';
import { PlansView } from './app/plan/components/plans-view';
import { UserAccount } from './app/todo/components/user-account/user-account';
import { DevicePairing } from './app/todo/components/device-pairing/device-pairing';
import { LabelService } from './app/todo/services/label.service';
import { TodoService } from './app/todo/services/todo';
import { ToastContainer } from './app/shared/toast-container';
import { ShortcutsOverlay } from './app/shared/shortcuts-overlay';
import { isTypingTarget } from './app/todo/shared/keyboard';
import type { View } from './app/todo/services/todo';

@Component({
  selector: 'app-root',
  imports: [
    AsyncPipe,
    Header,
    TodoAdd,
    TodoFilter,
    TodoList,
    TodoStats,
    FocusPanel,
    CategoriesOverlay,
    FavoriteFolders,
    WeekView,
    PlansView,
    UserAccount,
    DevicePairing,
    LucideAngularModule,
    ToastContainer,
    ShortcutsOverlay,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  providers: [],
})
export class App {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);
  protected readonly clerk = inject(ClerkService);

  /** Aktive Ansicht: Liste, Woche oder Pläne. */
  protected readonly view = this.todoService.view;

  private static readonly VIEWS: View[] = ['list', 'week', 'plans'];

  /** Treibt die gleitende Pille im Umschalter — drei gleich breite Laschen. */
  protected readonly viewIndex = computed(() => App.VIEWS.indexOf(this.view()));

  setView(view: View) {
    if (this.view() === view) return;
    this.todoService.view.set(view);

    // Nach oben springen. Die Ansichten sind unterschiedlich hoch: wer in der
    // Woche nach unten gescrollt hat, steht dort mit der klebenden Leiste oben
    // am Rand — in der kürzeren Liste klemmt der Browser die Scrollposition auf
    // 0, und die Leiste fällt zurück an ihren Platz im Fluss, rund 150px
    // tiefer. Das sieht aus, als wandere das Menü beim Umschalten.
    // Ohne Weichzeichner: eine Animation macht denselben Sprung nur langsamer.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /**
   * 1/2/3 wechseln die Ansicht. Wer zwischen Liste, Woche und Plänen hin- und
   * herspringt, greift sonst jedes Mal zur Maus; die Ziffern stehen im
   * „?"-Blatt und als Tooltip an den Laschen.
   */
  @HostListener('document:keydown', ['$event'])
  onViewShortcut(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const index = ['1', '2', '3'].indexOf(event.key);
    if (index === -1) return;

    event.preventDefault();
    this.setView(App.VIEWS[index]);
  }

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
    const label = this.labelService.labelById(id);
    return label?.name ?? 'Tasks';
  });

  protected readonly accentClass = computed(() => {
    const id = this.labelService.activeLabelId();
    if (id === null) return 'text-white';
    const label = this.labelService.labelById(id);
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
    const label = this.labelService.labelById(id);
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
  protected readonly ListIcon = LayoutList;
  protected readonly WeekIcon = CalendarDays;
  protected readonly PlansIcon = NotebookPen;

  openCategories() {
    this.labelService.openOverlay();
  }
}