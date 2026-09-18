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
import {
  LucideAngularModule,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CalendarClock,
} from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { ToastService } from '../../../shared/toast.service';
import { Todo } from '../../model/todo.model';
import {
  WeekDay,
  buildWeek,
  isoWeekNumber,
  shiftISODate,
  todayISO,
  weekRangeLabel,
} from '../../shared/week';
import { isTypingTarget } from '../../shared/keyboard';
import { pastThroughput } from '../../shared/focus';
import { stripPriorityPrefix } from '../../shared/title-priority';
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
  imports: [LucideAngularModule, CdkDropListGroup, CdkDropList, CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
})
export class WeekView {
  private readonly todoService = inject(TodoService);
  private readonly toast = inject(ToastService);
  protected readonly labelService = inject(LabelService);

  protected readonly PrevIcon = ChevronLeft;
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
    if (!host || host.scrollWidth <= host.clientWidth) return;

    const column = host.querySelector<HTMLElement>('[data-today="true"]');
    if (!column) {
      host.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const left = column.offsetLeft - (host.clientWidth - column.clientWidth) / 2;
    host.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
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

  borderClass(todo: Todo): string {
    return this.labelService.borderClassFor(todo.labelIds[0] ?? null);
  }
}
