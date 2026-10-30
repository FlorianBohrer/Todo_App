import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Eye,
  Flame,
  Gem,
  Layers,
  Pencil,
  Plus,
  PlusCircle,
  LucideAngularModule,
} from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { FocusTimerService } from '../../services/focus-timer.service';
import { Grouping, ListViewService, SortOrder } from '../../services/list-view.service';
import { completionStreak } from '../../shared/streak';
import { LabelService } from '../../services/label.service';
import { folderColorClass } from '../../shared/folder-color';
import { splitFolderName } from '../../shared/folder-name';
import { dailyLoad } from '../../shared/focus';
import { ProgressRing } from '../progress-ring/progress-ring';

/**
 * Der Auftakt der Liste.
 *
 * Vorher stand hier ein Balken mit Farbverlauf von Cyan über Teal nach
 * Emerald und daneben eine Prozentzahl. Der Verlauf hatte mit nichts in dieser
 * App zu tun: nicht mit der Farbe des offenen Ordners, nicht mit der Farbe der
 * Ansicht. Er war Dekoration, die sich als Information ausgab — und
 * ausgerechnet drei Farben für eine einzige Zahl.
 *
 * Jetzt: eine Begrüßung, die Farbe des offenen Ordners, der Ring, und die eine
 * Zeile, die diese App von anderen unterscheidet — „3 of 7 today · you usually
 * finish 5". Keine erfundene Obergrenze, sondern der eigene Median.
 */
@Component({
  selector: 'app-todo-stats',
  imports: [ProgressRing, OverlayModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-stats.html',
})
export class TodoStats {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);

  protected readonly stats = this.todoService.stats;
  protected readonly listView = inject(ListViewService);
  private readonly timer = inject(FocusTimerService);

  /** Tage in Folge mit etwas Erledigtem — über alles, nicht nur den Ordner. */
  protected readonly streak = computed(() => completionStreak(this.todoService.withArchive()));

  /** Abgeschlossene Fokus-Sitzungen (Ansicht „Focus"). */
  protected readonly gems = this.timer.finished;

  /** Der grosse Titel: der Ordner, sonst „To-do". */
  protected readonly title = computed(() => this.scopeName() ?? 'To-do');

  // ---- Menü „…" ----

  protected readonly menuOpen = signal(false);
  /** Welche Seite des Menüs offen ist: oben, oder eine der drei Auswahlen. */
  protected readonly menuPage = signal<'root' | 'group' | 'sort' | 'view'>('root');

  protected readonly grouping = this.listView.grouping;
  protected readonly sort = this.listView.sort;
  protected readonly showIcons = this.listView.showIcons;
  protected readonly showSuggestions = this.listView.showSuggestions;

  protected readonly groupings: readonly { value: Grouping; label: string }[] = [
    { value: 'manual', label: 'My order' },
    { value: 'time', label: 'Time of day' },
    { value: 'date', label: 'Date' },
    { value: 'priority', label: 'Priority' },
  ];

  protected readonly sorts: readonly { value: SortOrder; label: string }[] = [
    { value: 'manual', label: 'My order' },
    { value: 'date', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'duration', label: 'Duration' },
  ];

  protected readonly groupingLabel = computed(
    () => this.groupings.find((g) => g.value === this.grouping())?.label ?? '',
  );
  protected readonly sortLabel = computed(() => this.sorts.find((g) => g.value === this.sort())?.label ?? '');

  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];

  toggleMenu(): void {
    this.menuPage.set('root');
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  newList(): void {
    this.closeMenu();
    this.labelService.openOverlayToCreate();
  }

  editLists(): void {
    this.closeMenu();
    this.labelService.openOverlay();
  }

  setGrouping(value: Grouping): void {
    this.listView.setGrouping(value);
    this.closeMenu();
  }

  setSort(value: SortOrder): void {
    this.listView.setSort(value);
    this.closeMenu();
  }

  /** „+" oben: das Eingabefeld darunter bekommt den Fokus. */
  add(): void {
    this.listView.requestAdd();
  }

  protected readonly FlameIcon = Flame;
  protected readonly GemIcon = Gem;
  protected readonly MoreIcon = Ellipsis;
  protected readonly PlusIcon = Plus;
  protected readonly NewListIcon = PlusCircle;
  protected readonly EditIcon = Pencil;
  protected readonly GroupIcon = Layers;
  protected readonly SortIcon = ArrowDownUp;
  protected readonly ViewIcon = Eye;
  protected readonly NextIcon = ChevronRight;
  protected readonly BackIcon = ChevronLeft;

  /** Der offene Ordner, oder null für „alle Aufgaben". */
  private readonly activeLabel = computed(() => {
    const id = this.labelService.activeLabelId();
    return id === null ? null : this.labelService.labelById(id) ?? null;
  });

  /**
   * Der Name des Ausschnitts, über den diese Zeile spricht.
   *
   * Dieselbe Zerlegung wie auf der Ordnerkachel: „projekt: Bozen" wird zum
   * Namen ohne das Prefix, sonst stünde hier zweimal dasselbe Wort.
   */
  protected readonly scopeName = computed(() => {
    const label = this.activeLabel();
    return label ? splitFolderName(label.name).name : null;
  });

  /** Der Auftakt nimmt die Farbe des offenen Ordners an — sonst die der Ansicht. */
  protected readonly accentClass = computed(() => {
    const label = this.activeLabel();
    return label ? folderColorClass(label.color, 'text') : 'text-brand-2';
  });

  /**
   * Tageszeit-Begrüßung.
   *
   * Der ruhige Auftakt aus dem Entwurf — und der einzige Ort in der App, an
   * dem etwas steht, das nicht über Aufgaben spricht. Das ist der Punkt: man
   * kommt an, bevor man anfängt.
   */
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Still up';
    if (hour < 11) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Winding down';
  });

  protected readonly load = computed(() => dailyLoad(this.todoService.scopedWithArchive()));

  /**
   * Was heute ansteht — oder, wenn für heute nichts geplant ist, wie der
   * ganze Ausschnitt steht.
   *
   * Zwei Sätze für zwei verschiedene Lagen. „Nothing planned for today" ist
   * eine Auskunft; sie durch „0 of 0" zu ersetzen wäre eine Rechnung über
   * eine leere Menge.
   */
  protected readonly todayLine = computed(() => {
    const load = this.load();
    const planned = load.open + load.done;

    if (planned === 0) {
      const open = this.stats().active;
      if (open === 0) return 'Nothing planned for today.';
      return open === 1
        ? 'Nothing planned for today: one thing is waiting.'
        : `Nothing planned for today: ${open} things are waiting.`;
    }

    if (load.open === 0) return 'Everything planned for today is done.';

    const parts = [`${load.done} of ${planned} today`];
    if (load.typical !== null && load.overCommitted) {
      // Die Außensicht gegen den Planungsfehlschluss: der eigene Median, nicht
      // ein Ziel. Nur wenn der Plan darüber liegt — sonst wäre es ein Vorwurf
      // ohne Anlass.
      parts.push(`you usually finish ${load.typical}`);
    }
    return parts.join(' · ');
  });

  /** Hebt die Zeile hervor, wenn der Plan über dem eigenen Schnitt liegt. */
  protected readonly todayLineClass = computed(() =>
    this.load().overCommitted ? 'text-amber-300' : 'text-muted',
  );
}
