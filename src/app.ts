// src/app.ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
  LogOut,
  Search,
} from 'lucide-angular';
import { TodoAdd } from './app/todo/components/todo-add/todo-add';
import { TodoFilter } from './app/todo/components/todo-filter/todo-filter';
import { TodoList } from './app/todo/components/todo-list/todo-list';
import { TodoStats } from './app/todo/components/todo-stats/todo-stats';
import { FocusPanel } from './app/todo/components/focus-panel/focus-panel';
import { WeeklyReview } from './app/todo/components/weekly-review/weekly-review';
import { CategoriesOverlay } from './app/todo/components/categories/categories-overlay';
import { FavoriteFolders } from './app/todo/components/favorite-folders/favorite-folders';
import { folderColorClass } from './app/todo/shared/folder-color';
import { folderIcon } from './app/todo/shared/folder-icon';
import { splitFolderName } from './app/todo/shared/folder-name';
import { WeekView } from './app/todo/components/week-view/week-view';
import { PlansView } from './app/plan/components/plans-view';
import { UserAccount } from './app/todo/components/user-account/user-account';
import { DevicePairing } from './app/todo/components/device-pairing/device-pairing';
import { LevelBadge } from './app/reward/level-badge/level-badge';
import { LevelUpOverlay } from './app/reward/level-up/level-up';
import { SearchPalette } from './app/search/search-palette/search-palette';
import { FlowStatus } from './app/todo/components/flow-status/flow-status';
import { LabelService } from './app/todo/services/label.service';
import { TodoService } from './app/todo/services/todo';
import { ToastContainer } from './app/shared/toast-container';
import { ShortcutsOverlay } from './app/shared/shortcuts-overlay';
import { isTypingTarget } from './app/todo/shared/keyboard';
import { ShortcutService } from './app/shared/shortcut.service';
import { formatBinding } from './app/shared/shortcuts';
import type { View } from './app/todo/services/todo';

@Component({
  selector: 'app-root',
  imports: [
    AsyncPipe,
    TodoAdd,
    TodoFilter,
    TodoList,
    TodoStats,
    FocusPanel,
    WeeklyReview,
    CategoriesOverlay,
    FavoriteFolders,
    WeekView,
    PlansView,
    UserAccount,
    DevicePairing,
    LevelBadge,
    LevelUpOverlay,
    SearchPalette,
    FlowStatus,
    LucideAngularModule,
    ToastContainer,
    ShortcutsOverlay,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  // Bewusst KEIN eigenes Stylesheet.
  //
  // Hier stand app.scss mit genau einer Zeile: @use "tailwindcss". Damit lud
  // die App Tailwind ein zweites Mal — als Komponenten-CSS. Angular schreibt
  // darin `:host` auf <app-root> um, und Tailwind setzt dort seine
  // Grundwerte neu: die Standardschrift und die Standardpalette. Alles in der
  // App erbte von DORT statt von <html>/<body>.
  //
  // Die Folgen, nachgemessen an 722 Elementen: keine Schrift aus styles.scss
  // kam je an (das „Inter" darin wurde nie benutzt, Figtree auch nicht), und
  // auf 60 Elementen blieb das Standard-Indigo stehen, obwohl styles.scss es
  // pro Ansicht umfärbt. Sonst unterschieden sich die beiden Fassungen in
  // nichts. Tailwind kommt einmal, global, aus styles.scss.
  providers: [],
})
export class App {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);
  protected readonly clerk = inject(ClerkService);
  private readonly shortcuts = inject(ShortcutService);

  /** Aktive Ansicht: Liste, Woche oder Pläne. */
  protected readonly view = this.todoService.view;

  /**
   * Die Hoehe der klebenden Leiste, als CSS-Variable fuer die ganze App.
   *
   * Wer unter ihr ebenfalls kleben will — der Kopf eines Plans etwa —, muss
   * wissen, wie hoch sie ist. Ein fester Wert waere falsch, sobald sie
   * umbricht: auf dem Telefon stehen Folders und die drei Laschen
   * untereinander, und der Kopf des Dokuments laege dahinter.
   */
  private readonly chrome = viewChild<ElementRef<HTMLElement>>('chrome');

  /** Die Suche über alles. Gibt es nur angemeldet — daher optional. */
  protected readonly search = viewChild(SearchPalette);

  /** Wie das Kürzel auf diesem Gerät heißt, für den Tooltip des Knopfs. */
  protected readonly searchHint = computed(() =>
    formatBinding(this.shortcuts.binding('search.open')).join(''),
  );


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
  /**
   * Der eine Ort, an dem ein Tastendruck zu einer Handlung wird.
   *
   * Gefragt wird nach der HANDLUNG, nicht nach der Taste. Welche Taste das ist,
   * weiss allein der ShortcutService — deshalb muss hier nichts geaendert
   * werden, wenn der Nutzer sie umbelegt.
   */
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    const action = this.shortcuts.match(event);

    // Die Suche auch aus einem Textfeld heraus: ⌘K tippt niemand als Text,
    // und gesucht wird oft genau dann, wenn man gerade etwas schreibt.
    if (action === 'search.open') {
      event.preventDefault();
      this.search()?.toggle();
      return;
    }

    if (isTypingTarget(event.target)) return;
    if (!action) return;

    switch (action) {
      // Toggle und nicht nur oeffnen: wer die Uebersicht mit einer Taste
      // aufmacht, greift zum Zumachen nicht zur Maus.
      case 'folders.toggle':
        event.preventDefault();
        this.toggleCategories();
        return;
      case 'view.list':
        event.preventDefault();
        this.setView('list');
        return;
      case 'view.week':
        event.preventDefault();
        this.setView('week');
        return;
      case 'view.plans':
        event.preventDefault();
        this.setView('plans');
        return;
      default:
        // help.toggle und die Formatierung gehoeren anderen Komponenten.
        return;
    }
  }

  /** true, wenn das Clerk-Script nicht geladen werden konnte (Netzwerk/Limit). */
  protected readonly clerkFailed = signal(false);

  constructor() {
    // Welche Ansicht offen ist, steht am <html>-Element — und nicht am
    // Anwendungsrumpf. Overlays (Menüs, Dialoge) hängt das CDK direkt unter
    // <body>, also ausserhalb davon; sie bekämen die Akzentfarbe der
    // Ansicht sonst nicht mit und blieben einzeln in der Grundfarbe stehen.
    effect(() => {
      document.documentElement.dataset['view'] = this.view();
    });

    // Die Hoehe der Leiste steht ab jetzt in --chrome-h.
    effect((onCleanup) => {
      const el = this.chrome()?.nativeElement;
      if (!el) return;

      const publish = () =>
        document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`);
      publish();

      const watch = new ResizeObserver(publish);
      watch.observe(el);
      onCleanup(() => watch.disconnect());
    });

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

  /** Der offene Folder, oder null fuer „alle Aufgaben". */
  private readonly activeLabel = computed(() => {
    const id = this.labelService.activeLabelId();
    return id === null ? null : this.labelService.labelById(id) ?? null;
  });

  /**
   * Titel wie auf der Kachel: Sammlung als Chip, Name als Ueberschrift.
   *
   * Vorher stand der rohe Name da — „privat: privat" in einem Zug. Dieselbe
   * Zerlegung macht die Favoritenkachel schon, nur oben passierte sie nicht.
   */
  private readonly titleParts = computed(() => {
    const label = this.activeLabel();
    return label ? splitFolderName(label.name) : { prefix: null, name: 'All Tasks' };
  });

  protected readonly title = computed(() => this.titleParts().name);

  /** Das Symbol des Folders, sonst das des Knopfes selbst. */
  protected readonly titleIcon = computed(() => {
    const label = this.activeLabel();
    return label ? folderIcon(label.icon) : FolderDown;
  });

  /** Der volle Name samt Sammlung — fuer den Tooltip, wenn gekuerzt wird. */
  protected readonly folderTitle = computed(
    () => `${this.activeLabel()?.name ?? 'All Tasks'} — open folders (f)`,
  );

  /**
   * Farbe des offenen Folders am Knopf.
   *
   * Aus folder-color.ts und nicht aus einer eigenen Liste: die kannte vier
   * der acht Folder-Farben, alles andere wurde weiss — ein Folder in Teal
   * sah aus wie gar keiner.
   *
   * Gefaerbt werden nur Symbol und Schrift. Der Rahmen bleibt neutral und
   * die Flaeche dunkel: mit Rahmen in voller Folder-Farbe schrie der Knopf
   * lauter als die Ansichtspille daneben, und die ist das wichtigere
   * Bedienelement. Erkennbar ist der Folder auch so sofort.
   */
  protected readonly folderPillClass = computed(() => {
    const label = this.activeLabel();
    return label ? `border-line ${folderColorClass(label.color, 'text')}` : 'border-line text-muted';
  });

  // Icons fürs Template
  protected readonly FolderDownIcon = FolderDown;
  protected readonly ArrowDown = ArrowDown;
  protected readonly PlusIcon = Plus;
  protected readonly ListIcon = LayoutList;
  protected readonly WeekIcon = CalendarDays;
  protected readonly PlansIcon = NotebookPen;
  protected readonly LogoutIcon = LogOut;
  protected readonly SearchIcon = Search;

  openCategories() {
    this.labelService.openOverlay();
  }

  /** Auf- und zumachen, fuer das Kuerzel „f". */
  toggleCategories() {
    if (this.labelService.isOverlayOpen()) {
      this.labelService.closeOverlay();
    } else {
      this.labelService.openOverlay();
    }
  }
}