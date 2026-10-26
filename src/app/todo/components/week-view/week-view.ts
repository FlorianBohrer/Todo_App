import {ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDropListGroup, CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePicker } from '../date-picker/date-picker';
import { HoldToDrag } from '../../../shared/hold-to-drag';
import {
  LucideAngularModule,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CalendarClock,
  Repeat,
} from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { ToastService } from '../../../shared/toast.service';
import { Todo } from '../../model/todo.model';
import {
  WeekDay,
  buildWeek,
  fromISODate,
  isoWeekNumber,
  shiftISODate,
  todayISO,
  weekRangeLabel,
} from '../../shared/week';
import { isTypingTarget } from '../../shared/keyboard';
import { pastThroughput } from '../../shared/focus';
import { priorityBadge, stripPriorityPrefix } from '../../shared/title-priority';
import { TitleToken } from '../../shared/title-token';
import { TokenChip } from '../../shared/token-chip';
import { folderColorClass } from '../../shared/folder-color';

/** Ein Wochentag mit allem, was seine Spalte zeigt — in einem Rutsch gerechnet. */
export interface DayColumn extends WeekDay {
  todos: Todo[];
  done: number;
  total: number;
  percent: number;
  /** Offene Aufgaben an einem Tag, der schon vorbei ist. */
  overdue: number;
}

/** Schlüssel für ungeplante Todos im Tages-Index (null taugt nicht als Map-Key-Doku). */
const UNSCHEDULED = '';

@Component({
  selector: 'app-week-view',
  imports: [
    LucideAngularModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
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
  private readonly toast = inject(ToastService);
  protected readonly labelService = inject(LabelService);

  protected readonly PrevIcon = ChevronLeft;
  protected readonly RepeatIcon = Repeat;
  protected readonly NextIcon = ChevronRight;
  protected readonly RollOverIcon = ChevronsRight;
  protected readonly OverdueIcon = CalendarClock;

  private readonly weekOffset = signal(0);

  protected readonly week = computed(() => buildWeek(this.weekOffset()));
  protected readonly rangeLabel = computed(() => weekRangeLabel(this.week()));
  protected readonly weekNumber = computed(() => isoWeekNumber(this.week()[0].date));
  protected readonly isCurrentWeek = computed(() => this.weekOffset() === 0);

  /**
   * Todos einmal nach Tag einsortieren, statt pro Spalte die ganze Liste zu
   * filtern. Vorher lief das sieben Mal pro Änderungsdurchlauf, jetzt einmal
   * pro tatsächlicher Änderung.
   */
  private readonly byDay = computed(() => {
    const index = new Map<string, Todo[]>();
    for (const todo of this.todoService.allTodos()) {
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

  /** Die sieben Spalten samt Zählern — das Template rechnet nichts mehr. */
  protected readonly days = computed<DayColumn[]>(() =>
    this.week().map((day) => {
      const todos = this.byDay().get(day.iso) ?? [];
      const done = todos.filter((t) => t.completed).length;
      const total = todos.length;
      return {
        ...day,
        todos,
        done,
        total,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
        overdue: day.isPast ? total - done : 0,
      };
    }),
  );

  /** Wochenbilanz für den Kopf: erledigt von geplant. */
  protected readonly weekProgress = computed(() => {
    let done = 0;
    let total = 0;
    for (const day of this.days()) {
      done += day.done;
      total += day.total;
    }
    return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
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
    return this.todoService
      .allTodos()
      .filter((t) => !t.completed && t.scheduledDate !== null && t.scheduledDate < today);
  });

  // ---- Backlog (ungeplante Todos) mit eigenen Filtern ----
  protected readonly labels = this.labelService.labels;
  protected readonly backlogStatus = signal<'all' | 'active'>('all');
  /** null = alle Kategorien. */
  protected readonly backlogCategory = signal<string | null>(null);

  private readonly unscheduled = computed(() => this.byDay().get(UNSCHEDULED) ?? []);

  /** Gibt es überhaupt ungeplante Todos (vor dem Filtern)? */
  protected readonly hasUnscheduled = computed(() => this.unscheduled().length > 0);

  /** Gefilterter Backlog: Status + Kategorie. */
  protected readonly backlog = computed(() => {
    let items = this.unscheduled();
    if (this.backlogStatus() === 'active') {
      items = items.filter((t) => !t.completed);
    }
    const cat = this.backlogCategory();
    if (cat !== null) {
      items = items.filter((t) => t.labelIds.includes(cat));
    }
    return items;
  });

  setBacklogStatus(status: 'all' | 'active') { this.backlogStatus.set(status); }
  setBacklogCategory(id: string | null) { this.backlogCategory.set(id); }

  // ---- Heute im Blick behalten ----
  // Sieben Spalten passen auf kein Telefon; der Streifen scrollt waagerecht.
  // Ohne Nachhelfen landet man dabei am Montag statt am heutigen Tag.
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  constructor() {
    afterNextRender(() => this.scrollTodayIntoView());

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
  goToday() { this.weekOffset.set(0); }

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

  onDragEnded(): void {
    this.suppressClickUntil = Date.now() + 300;
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

  /** Eine Karte einen Tag vor oder zurück schieben — ohne Ziehen. */
  shiftTodo(todo: Todo, days: number) {
    if (todo.scheduledDate === null) return;
    this.todoService.scheduleTodo(todo.id, shiftISODate(todo.scheduledDate, days));
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
    this.todoService.addTodo(value, iso);
    input.value = '';
  }

  toggle(id: string) {
    this.todoService.toggleTodo(id);
  }

  displayTitle(title: string): string {
    return stripPriorityPrefix(title);
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


  borderClass(todo: Todo): string {
    return this.labelService.borderClassFor(todo.labelIds[0] ?? null);
  }

  /** Der Punkt vor einer Karte ohne Haken (Ungeplant) — Farbe des ersten Ordners. */
  folderDot(todo: Todo): string {
    const color = this.labelService.labelById(todo.labelIds[0] ?? null)?.color;
    return color ? folderColorClass(color, 'dot') : 'text-zinc-500';
  }
}
