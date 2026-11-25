import {ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  Injector,
  ElementRef,
  HostListener,
  NgZone,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDropListGroup, CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { DatePicker } from '../date-picker/date-picker';
import { BOARD_DRAG_START_DELAY, HoldToDrag } from '../../../shared/hold-to-drag';
import {
  LucideAngularModule,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  ListFilter,
  Pause,
  Repeat,
  X,
} from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { FocusSessionService, elapsedNow, formatClock } from '../../services/focus-session.service';
import { ToastService } from '../../../shared/toast.service';
import { Todo } from '../../model/todo.model';
import {
  WeekDay,
  buildWeek,
  fromISODate,
  isoWeekNumber,
  monthLabel,
  shiftISODate,
  todayISO,
  weekRangeLabel,
} from '../../shared/week';
import { isTypingTarget } from '../../shared/keyboard';
import { pastThroughput } from '../../shared/focus';
import { priorityBadge } from '../../shared/title-priority';
import { TitleToken, typedTitle } from '../../shared/title-token';
import { RichText } from '../../shared/rich-text';
import { plainText, titleText } from '../../shared/rich-title';
import { TokenChip } from '../../shared/token-chip';
import { folderColorClass } from '../../shared/folder-color';

/** Ein Wochentag mit allem, was seine Spalte zeigt — in einem Rutsch gerechnet. */
export interface DayColumn extends WeekDay {
  /** Was die Spalte zeigt: ohne Erledigtes, wenn es ausgeblendet ist. */
  todos: Todo[];
  done: number;
  total: number;
  /** Offene Aufgaben an einem Tag, der schon vorbei ist. */
  overdue: number;
}

/**
 * Reicht den Injector einer Kartenliste an die Karten-Vorlage weiter.
 *
 * Die Karte steht einmal als ng-template und wird in den Tagen und im
 * Ungeplanten eingesetzt. Ein eingesetztes Template sucht seine Abhängigkeiten
 * aber dort, wo es DEKLARIERT ist, nicht wo es steht — cdkDrag fände so keine
 * Liste über sich und zöge frei über die Seite statt von Tag zu Tag. Mit dem
 * Injector der Liste, in der die Karte gerade steht, findet es sie.
 */
@Directive({ selector: '[appListInjector]', exportAs: 'listInjector' })
export class ListInjector {
  readonly injector = inject(Injector);
}

/** Schlüssel für ungeplante Todos im Tages-Index (null taugt nicht als Map-Key-Doku). */
const UNSCHEDULED = '';

/** Ob Erledigtes in der Woche zu sehen ist — eine Vorliebe, die bleiben soll. */
const HIDE_DONE_KEY = 'week.hideDone';

function readHideDone(): boolean {
  try {
    return localStorage.getItem(HIDE_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}


@Component({
  selector: 'app-week-view',
  imports: [
    ListInjector,
    NgTemplateOutlet,
    RichText,
    LucideAngularModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkScrollable,
    HoldToDrag,
    TokenChip,
    OverlayModule,
    DatePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
})
export class WeekView {
  private readonly todoService = inject(TodoService);

  /**
   * Mit der Maus sofort, mit dem Finger nach kurzem Drücken. Die Liste wartet
   * zwei Sekunden, damit beim Lesen nichts verrutscht; in der Woche ist
   * Verschieben der Zweck (hold-to-drag.ts).
   */
  protected readonly dragStartDelay = BOARD_DRAG_START_DELAY;
  private readonly toast = inject(ToastService);
  protected readonly labelService = inject(LabelService);
  private readonly focus = inject(FocusSessionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly PrevIcon = ChevronLeft;
  protected readonly RepeatIcon = Repeat;
  protected readonly NextIcon = ChevronRight;
  protected readonly RollOverIcon = ChevronsRight;
  protected readonly OverdueIcon = CalendarClock;
  protected readonly CheckIcon = Check;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly FilterIcon = ListFilter;
  protected readonly PauseIcon = Pause;
  protected readonly ClearIcon = X;

  private readonly weekOffset = signal(0);

  protected readonly week = computed(() => buildWeek(this.weekOffset()));
  protected readonly rangeLabel = computed(() => weekRangeLabel(this.week()));
  protected readonly weekNumber = computed(() => isoWeekNumber(this.week()[0].date));
  protected readonly isCurrentWeek = computed(() => this.weekOffset() === 0);
  protected readonly month = computed(() => {
    const week = this.week();
    return monthLabel(week[0].date, week[6].date);
  });
  protected readonly monthShort = computed(() => {
    const week = this.week();
    return monthLabel(week[0].date, week[6].date, true);
  });

  // ---- Filter und Ausblenden ----

  /** Ein Ordner, auf den die ganze Woche samt Ungeplantem eingeschränkt ist. null = alle. */
  protected readonly folderFilter = signal<string | null>(null);
  protected readonly filterLabel = computed(() => this.labelService.labelById(this.folderFilter()));
  protected readonly filterOpen = signal(false);

  /** Erledigtes ausblenden: was der Tag noch verlangt, ohne das Geschaffte daneben. */
  protected readonly hideDone = signal(readHideDone());

  toggleHideDone(): void {
    const next = !this.hideDone();
    this.hideDone.set(next);
    try {
      localStorage.setItem(HIDE_DONE_KEY, String(next));
    } catch {
      /* privates Fenster: dann eben nur für diese Sitzung */
    }
  }

  setFolderFilter(id: string | null): void {
    this.folderFilter.set(id);
    this.filterOpen.set(false);
  }

  /** Die Todos, über die die Woche spricht: alle, oder die des gefilterten Ordners. */
  private readonly inScope = computed(() => {
    const folder = this.folderFilter();
    const all = this.todoService.allTodos();
    return folder === null ? all : all.filter((t) => t.labelIds.includes(folder));
  });

  /**
   * Todos einmal nach Tag einsortieren, statt pro Spalte die ganze Liste zu
   * filtern. Vorher lief das sieben Mal pro Änderungsdurchlauf, jetzt einmal
   * pro tatsächlicher Änderung.
   */
  private readonly byDay = computed(() => {
    const index = new Map<string, Todo[]>();
    for (const todo of this.inScope()) {
      const key = todo.scheduledDate ?? UNSCHEDULED;
      const bucket = index.get(key);
      if (bucket) bucket.push(todo);
      else index.set(key, [todo]);
    }
    // Erledigtes sinkt nach unten: oben steht, was der Tag noch verlangt.
    for (const bucket of index.values()) {
      bucket.sort((a, b) => Number(a.completed) - Number(b.completed));
    }
    return index;
  });

  /**
   * Die sieben Spalten samt Zählern — das Template rechnet nichts mehr.
   *
   * Gezählt wird immer alles, auch wenn Erledigtes ausgeblendet ist: „2/6"
   * soll sagen, wie weit der Tag ist, nicht, wie viel gerade zu sehen ist.
   */
  protected readonly days = computed<DayColumn[]>(() => {
    const hide = this.hideDone();
    return this.week().map((day) => {
      const all = this.byDay().get(day.iso) ?? [];
      const done = all.filter((t) => t.completed).length;
      const total = all.length;
      return {
        ...day,
        todos: hide ? all.filter((t) => !t.completed) : all,
        done,
        total,
        overdue: day.isPast ? total - done : 0,
      };
    });
  });

  /** Wochenbilanz für den Kopf: erledigt von geplant. */
  protected readonly weekProgress = computed(() => {
    let done = 0;
    let total = 0;
    for (const day of this.days()) {
      done += day.done;
      total += day.total;
    }
    return { done, total };
  });

  /**
   * Was an einem verplanten Tag sonst fertig wird. Beim Planen ist das die
   * einzige ehrliche Bezugsgröße — die Schätzung im Kopf ist es nachweislich
   * nicht (Planungsfehlschluss). null, solange es zu wenig Vergangenheit gibt.
   */
  protected readonly typicalPerDay = computed(() =>
    pastThroughput(this.todoService.allTodos()),
  );

  /** Offene Aufgaben, deren Tag vorbei ist — über die ganze Zeit, nicht nur diese Woche. */
  protected readonly overdue = computed(() => {
    const today = todayISO();
    return this.inScope().filter(
      (t) => !t.completed && t.scheduledDate !== null && t.scheduledDate < today,
    );
  });

  // ---- Ungeplantes ----
  // Dieselben Regeln wie die Tage: der Ordnerfilter oben gilt, das Auge auch.
  // Vorher hatte der Bereich eigene Schalter (All/Active, Ordner-Chips), die
  // nur hier wirkten — zwei Filter auf einer Seite, die sich nicht kannten.
  protected readonly labels = this.labelService.labels;

  private readonly unscheduled = computed(() => this.byDay().get(UNSCHEDULED) ?? []);

  /** Gibt es überhaupt Ungeplantes (vor dem Ausblenden)? */
  protected readonly hasUnscheduled = computed(() => this.unscheduled().length > 0);

  protected readonly backlog = computed(() =>
    this.hideDone() ? this.unscheduled().filter((t) => !t.completed) : this.unscheduled(),
  );

  // ---- Woran gerade gearbeitet wird ----
  // Die Karte, an der man sitzt, zeigt, wie lange schon. Getickt wird nur, solange
  // ein Block läuft — wie im Kopf der Seite (flow-status).
  private readonly now = signal(Date.now());
  protected readonly focusTodoId = computed(() => this.focus.active()?.todoId ?? null);
  protected readonly focusPaused = computed(() => this.focus.active()?.paused ?? false);
  /** Wie lange schon daran gearbeitet wird, hochzählend wie in der Leiste oben. */
  protected readonly focusClock = computed(() => {
    const active = this.focus.active();
    return active ? formatClock(elapsedNow(active, this.now())) : '';
  });

  // ---- Heute im Blick behalten ----
  // Sieben Spalten passen auf kein Telefon; der Streifen scrollt waagerecht.
  // Ohne Nachhelfen landet man dabei am Montag statt am heutigen Tag.
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  constructor() {
    afterNextRender(() => {
      this.scrollTodayIntoView();
      this.watchStripEdges();
    });

    let ticker: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const active = this.focus.active();
      const running = active !== null && !active.paused;
      if (running && ticker === null) {
        this.now.set(Date.now());
        ticker = setInterval(() => this.now.set(Date.now()), 1000);
      } else if (!running && ticker !== null) {
        clearInterval(ticker);
        ticker = null;
      }
    });
    this.destroyRef.onDestroy(() => {
      if (ticker !== null) clearInterval(ticker);
    });

    // Beim Wochenwechsel nachziehen. Der erste Lauf gehört afterNextRender —
    // hier wäre das DOM noch die alte (oder gar keine) Woche.
    let firstRun = true;
    effect(() => {
      this.weekOffset();
      if (firstRun) {
        firstRun = false;
        return;
      }
      requestAnimationFrame(() => this.scrollTodayIntoView());
    });
  }

  private readonly zone = inject(NgZone);

  /**
   * Ob links oder rechts noch Tage liegen. Der Streifen blendet an dieser
   * Kante aus (week-view.scss) — ohne das sieht ein angeschnittener Tag
   * abgeschnitten aus statt fortgesetzt, und man versucht nicht zu scrollen.
   * Am Rand, an dem nichts mehr kommt, bleibt die Kante scharf.
   */
  private watchStripEdges(): void {
    const host = this.strip()?.nativeElement;
    if (!host) return;

    const update = () => {
      const max = host.scrollWidth - host.clientWidth;
      host.dataset['start'] = String(host.scrollLeft <= 1);
      host.dataset['end'] = String(host.scrollLeft >= max - 1);
    };

    this.zone.runOutsideAngular(() => {
      host.addEventListener('scroll', update, { passive: true });
      const resize = new ResizeObserver(update);
      resize.observe(host);
      this.destroyRef.onDestroy(() => {
        host.removeEventListener('scroll', update);
        resize.disconnect();
      });
    });
    update();
  }

  private scrollTodayIntoView() {
    const host = this.strip()?.nativeElement;
    if (!host) return;
    if (host.scrollWidth <= host.clientWidth) {
      this.scrollTodayIntoPage(host);
      return;
    }

    const column = host.querySelector<HTMLElement>('[data-today="true"]');
    if (!column) {
      host.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const left = column.offsetLeft - (host.clientWidth - column.clientWidth) / 2;
    host.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  /**
   * Auf dem Telefon stehen die Tage untereinander, und der Streifen scrollt
   * nicht seitlich — dann scrollt die Seite. Liegt der heutige Tag unterhalb
   * des Bildschirms (Ende der Woche), rueckt er unter die Leiste. Liegt er
   * schon im Blick, bewegt sich nichts.
   */
  private scrollTodayIntoPage(host: HTMLElement) {
    const card = host.querySelector<HTMLElement>('[data-today="true"]');
    if (!card) return;

    const box = card.getBoundingClientRect();
    if (box.top >= 0 && box.top < window.innerHeight * 0.6) return;

    const chrome =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 0;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: Math.max(0, window.scrollY + box.top - chrome - 12),
      behavior: calm ? 'auto' : 'smooth',
    });
  }

  dotClass(color: string): string {
    return folderColorClass(color, 'dot');
  }

  prevWeek() { this.weekOffset.update((o) => o - 1); }
  nextWeek() { this.weekOffset.update((o) => o + 1); }
  /**
   * Zur laufenden Woche, und dort zum heutigen Tag. Steht man schon in ihr,
   * holt der Knopf den Tag zurück in den Blick — der Streifen scrollt
   * seitlich, und dann ist „heute" schnell aus dem Bild.
   */
  goToday() {
    if (this.weekOffset() === 0) this.scrollTodayIntoView();
    else this.weekOffset.set(0);
  }

  /**
   * Pfeiltasten blättern durch die Wochen, „t" holt die aktuelle zurück —
   * dieselben Tasten wie in jedem Kalender.
   */
  @HostListener('document:keydown', ['$event'])
  onWeekShortcut(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    // Der Kalender zum Umplanen ist offen: die Pfeile gehören ihm.
    if (this.moverTodo() !== null) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevWeek();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextWeek();
    } else if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      this.goToday();
    }
  }

  // ---- Umplanen per Antippen ----
  //
  // Bisher ging es nur per Ziehen: am Telefon zwei Sekunden halten und dann
  // über gestapelte Tage scrollen, und über den Sonntag hinaus gar nicht.
  // Jetzt öffnet ein Tipp auf die Karte den Kalender, und jeder Tag ist
  // einen Tipp entfernt. Ziehen bleibt für den Rechner.

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly moverId = signal<string | null>(null);
  protected readonly moverTodo = computed(() => this.todoService.todoById(this.moverId()));
  protected readonly moverOrigin = signal<HTMLElement>(this.host.nativeElement);

  /** Auf dem Telefon ein Blatt von unten, am Rechner ein Menü an der Karte. */
  protected readonly sheet =
    typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches;

  protected readonly moverPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  /**
   * Nach dem Loslassen einer gezogenen Karte feuert der Browser noch einen
   * Klick auf sie. Der soll nicht den Kalender öffnen.
   */
  private suppressClickUntil = 0;

  /**
   * Der Tag, von dem gerade eine Karte kommt. Nur dort bleibt der Platzhalter
   * stehen (als Lücke, woher sie kommt); in den anderen Spalten färbt sich
   * die ganze Spalte, über der man ist. Ein Platzhalter mitten in einem
   * fremden Tag würde eine Stelle versprechen, an der die Karte gar nicht
   * landet: innerhalb eines Tages gilt die Reihenfolge der Liste.
   */
  protected readonly dragFrom = signal<string | null | undefined>(undefined);

  onDragStarted(todo: Todo): void {
    this.dragFrom.set(todo.scheduledDate);
  }

  onDragEnded(): void {
    this.suppressClickUntil = Date.now() + 300;
    this.dragFrom.set(undefined);
  }

  openMover(todo: Todo, event: Event): void {
    if (Date.now() < this.suppressClickUntil) return;
    this.moverOrigin.set(event.currentTarget as HTMLElement);
    this.moverId.set(todo.id);
  }

  closeMover(): void {
    this.moverId.set(null);
  }

  /**
   * Auf den gewählten Tag. Landet die Karte ausserhalb der angezeigten Woche,
   * verschwindet sie aus dem Blick — dann sagt eine Meldung, wohin, und
   * bietet den Rückweg an.
   */
  moveTo(iso: string | null): void {
    const todo = this.moverTodo();
    this.closeMover();
    if (!todo || iso === todo.scheduledDate) return;

    const before = todo.scheduledDate;
    this.todoService.scheduleTodo(todo.id, iso);

    const stillVisible = iso !== null && this.week().some((day) => day.iso === iso);
    if (stillVisible) return;
    this.toast.show(iso === null ? 'Moved to Unscheduled' : `Moved to ${this.dayName(iso)}`, {
      actionLabel: 'Undo',
      action: () => this.todoService.scheduleTodo(todo.id, before),
      durationMs: 6000,
    });
  }

  /** „Thu, Nov 20" — eindeutig auch über die Woche hinaus. */
  private dayName(iso: string): string {
    return fromISODate(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Drag zwischen Tagen (und Backlog): setzt das Datum des Ziel-Containers. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drop(event: CdkDragDrop<any>) {
    if (event.previousContainer === event.container) return;
    const todo = event.item.data as Todo;
    const targetDate = event.container.data as string | null;
    this.todoService.scheduleTodo(todo.id, targetDate);
  }

  /** Was der Tag nicht geschafft hat, wandert geschlossen auf morgen. */
  rollOver(day: DayColumn) {
    const open = day.todos.filter((t) => !t.completed);
    if (open.length === 0) return;
    this.reschedule(open, shiftISODate(day.iso, 1), `${open.length} moved to the next day`);
  }

  /** Alles Liegengebliebene einsammeln und auf heute legen. */
  catchUp() {
    const items = this.overdue();
    if (items.length === 0) return;
    this.reschedule(items, todayISO(), `${items.length} overdue moved to today`);
    this.goToday();
  }

  /**
   * Umplanen mit Rückweg: der Stand davor wird festgehalten, bevor etwas
   * verschoben wird. Ein Massen-Verschieben ohne Undo wäre eine Falle.
   */
  private reschedule(items: Todo[], target: string, message: string) {
    const before = items.map((t) => ({ id: t.id, date: t.scheduledDate }));
    this.todoService.rescheduleAll(items.map((t) => t.id), target);

    this.toast.show(message, {
      actionLabel: 'Undo',
      action: () => {
        for (const item of before) this.todoService.scheduleTodo(item.id, item.date);
      },
      durationMs: 6000,
    });
  }

  quickAdd(iso: string, input: HTMLInputElement) {
    const value = input.value.trim();
    if (!value) return;
    // Mit Ordnerfilter landet die neue Aufgabe in diesem Ordner. Sonst wäre
    // sie nach dem Enter sofort weg, ausgefiltert, und sähe verloren aus.
    const folder = this.folderFilter();
    const title = typedTitle(value);
    if (title) this.todoService.addTodo(title, iso, null, undefined, folder ?? undefined);
    input.value = '';
  }

  toggle(id: string) {
    this.todoService.toggleTodo(id);
  }

  /** „**Überschrift**Text" in einer Zeile wie mit Umbruch, wie in der Liste. */
  displayTitle(title: string): string {
    return titleText(title);
  }

  /** Als Klartext, ohne Sternchen, Links kurz: für Tooltip und Vorlesesoftware. */
  plainTitle(title: string): string {
    return plainText(titleText(title));
  }

  /**
   * Die Priorität als Chip.
   *
   * Vorher schnitt displayTitle das Präfix ab und sonst nichts — in der Woche
   * war ein Must-have von einem Could-have nicht zu unterscheiden. Nur
   * MoSCoW: Main und Step sind eine Gliederung der Liste, in einer Tagesspalte
   * gibt es nichts, worunter ein Schritt hängen könnte.
   */
  badge(title: string): TitleToken | null {
    return priorityBadge(title);
  }


  /** Die Farbe des ersten Ordners als Fläche: Kante der Karte, abgehakter Kreis. */
  fillClass(todo: Todo): string {
    return folderColorClass(this.labelService.labelById(todo.labelIds[0] ?? null)?.color, 'fill');
  }

  /** Der erste Ordner für den Chip, und wie viele es darüber hinaus sind. */
  folderOf(todo: Todo): { name: string; color: string; more: number } | null {
    const label = this.labelService.labelById(todo.labelIds[0] ?? null);
    return label ? { name: label.name, color: label.color, more: todo.labelIds.length - 1 } : null;
  }
}
