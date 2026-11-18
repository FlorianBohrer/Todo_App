import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { LucideAngularModule, Check, Pause, Play, Plus, Search, Square } from 'lucide-angular';

import { FocusSessionService, formatFocus } from '../../services/focus-session.service';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { Todo } from '../../model/todo.model';
import { firstLineOf, stripBold } from '../../shared/rich-title';
import { stripPriorityPrefix } from '../../shared/title-priority';
import { folderColorClass } from '../../shared/folder-color';
import { searchableTitle, trackCandidates } from '../../shared/tracking';
import { todayISO } from '../../shared/week';

/** Eine Zeile der Auswahl: eine Aufgabe, oder „anlegen und erfassen". */
interface PickRow {
  id: string;
  kind: 'todo' | 'create';
  todo: Todo | null;
  label: string;
  section: string | null;
}

/**
 * Das Fenster der Zeiterfassung, an der Leiste oben rechts (flow-status).
 *
 * Oben, was gerade läuft, mit Pause, Stopp und Fertig. Darunter die Auswahl:
 * tippen, um zu suchen, oder aus dem, was heute dran ist und zuletzt erfasst
 * wurde. Pfeiltasten und Enter genügen; gibt es die Aufgabe noch nicht, legt
 * Enter sie für heute an und erfasst sie gleich. Am Telefon ein Blatt von
 * unten.
 */
@Component({
  selector: 'app-track-picker',
  imports: [OverlayModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './track-picker.html',
  styleUrl: './track-picker.scss',
})
export class TrackPicker {
  private readonly focus = inject(FocusSessionService);
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);

  /** Die Leiste, an der das Fenster hängt. */
  readonly origin = input.required<CdkOverlayOrigin>();
  /** Die laufende Uhr und der Titel — die Leiste rechnet sie ohnehin. */
  readonly clock = input('');
  readonly title = input('');
  readonly closed = output<void>();

  protected readonly PlayIcon = Play;
  protected readonly PauseIcon = Pause;
  protected readonly StopIcon = Square;
  protected readonly DoneIcon = Check;
  protected readonly SearchIcon = Search;
  protected readonly AddIcon = Plus;

  protected readonly active = this.focus.active;
  protected readonly busy = this.focus.busy;
  protected readonly activeTodo = computed(() => this.todoService.todoById(this.active()?.todoId));

  protected readonly since = computed(() => {
    const active = this.active();
    if (!active) return '';
    const d = new Date(active.startedAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  // ---- Auswahl ----
  protected readonly query = signal('');
  protected readonly highlighted = signal(0);
  private readonly recentIds = signal<string[]>([]);

  private readonly sections = computed(() =>
    trackCandidates(this.todoService.allTodos(), {
      query: this.query(),
      today: todayISO(),
      recentIds: this.recentIds(),
    }),
  );

  /**
   * Alle wählbaren Zeilen in Lese-Reihenfolge — die Pfeiltasten laufen über
   * diese Liste, egal in welchem Abschnitt eine Zeile steht.
   */
  protected readonly rows = computed<PickRow[]>(() => {
    const activeId = this.active()?.todoId ?? null;
    const rows: PickRow[] = [];
    for (const section of this.sections()) {
      let first = true;
      for (const todo of section.items) {
        if (todo.id === activeId) continue;
        rows.push({
          id: `track-${todo.id}`,
          kind: 'todo',
          todo,
          label: this.plainTitle(todo.title),
          section: first ? section.label : null,
        });
        first = false;
      }
    }
    // Ganz unten: die getippte Aufgabe anlegen, falls es sie so noch nicht gibt.
    const typed = this.query().trim();
    if (typed && !rows.some((row) => row.todo && searchableTitle(row.todo.title) === typed.toLowerCase())) {
      rows.push({ id: 'track-create', kind: 'create', todo: null, label: typed, section: null });
    }
    return rows;
  });

  /** Die oberste Aufgabe für heute bekommt den Hinweis, warum sie oben steht. */
  protected readonly upNextId = computed(() => {
    const first = this.sections()[0];
    return !this.query().trim() && first?.label === 'Today' ? (first.items[0]?.id ?? null) : null;
  });

  /** Die markierte Zeile, auf die Liste begrenzt, falls sie kürzer wurde. */
  protected readonly index = computed(() => Math.max(0, Math.min(this.highlighted(), this.rows().length - 1)));
  protected readonly activeRowId = computed(() => this.rows()[this.index()]?.id ?? null);

  /** Auf dem Telefon ein Blatt von unten, am Rechner ein Fenster an der Leiste. */
  protected readonly sheet =
    typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches;

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  constructor() {
    // Neue Suche, neue Auswahl: die Markierung springt an den Anfang. Nur bei
    // der Suche — lädt die Liste „Recently tracked" nach, während man schon
    // mit den Pfeilen unterwegs ist, bleibt die Markierung, wo sie ist.
    effect(() => {
      this.query();
      this.highlighted.set(0);
    });
    void this.loadRecent();
  }

  close(): void {
    this.closed.emit();
  }

  /** Das Suchfeld bekommt den Fokus, sobald das Fenster steht — am Telefon nicht (Tastatur). */
  onAttached(): void {
    if (this.sheet) return;
    requestAnimationFrame(() => this.search()?.nativeElement.focus());
  }

  private async loadRecent(): Promise<void> {
    const sessions = await this.focus.loadRecent(40);
    if (!sessions) return;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const s of [...sessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())) {
      if (s.todoId && !seen.has(s.todoId)) {
        seen.add(s.todoId);
        ids.push(s.todoId);
      }
    }
    this.recentIds.set(ids);
  }

  // ---- Tastatur ----

  onSearchKey(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (count > 0) this.highlighted.set((this.index() + 1) % count);
      this.revealHighlighted();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count > 0) this.highlighted.set((this.index() - 1 + count) % count);
      this.revealHighlighted();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.rows()[this.index()];
      if (row) void this.choose(row);
    }
  }

  private revealHighlighted(): void {
    const id = this.activeRowId();
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' }));
  }

  // ---- Handgriffe ----

  async choose(row: PickRow): Promise<void> {
    if (this.busy()) return;
    let todoId = row.todo?.id ?? null;
    if (row.kind === 'create') {
      todoId = await this.todoService.addTodo(row.label, todayISO());
    }
    if (!todoId) return;
    if (await this.focus.track(todoId)) this.close();
  }

  pauseOrResume(): void {
    const active = this.active();
    if (!active?.tracked) return;
    void (active.paused ? this.focus.resume() : this.focus.pause());
  }

  async stop(): Promise<void> {
    if (await this.focus.stop()) this.close();
  }

  /** Fertig: Erfassung beenden und die Aufgabe abhaken. */
  async finish(): Promise<void> {
    const todo = this.activeTodo();
    if (!(await this.focus.stop())) return;
    if (todo && !todo.completed) this.todoService.toggleTodo(todo.id);
    this.close();
  }

  show(): void {
    const todo = this.activeTodo();
    if (todo) this.todoService.reveal(todo);
    this.close();
  }

  // ---- Darstellung ----

  plainTitle(title: string): string {
    return stripBold(firstLineOf(stripPriorityPrefix(title)));
  }

  dotClass(todo: Todo | null): string {
    const color = this.labelService.labelById(todo?.labelIds[0] ?? null)?.color;
    return folderColorClass(color, 'dot');
  }

  folderName(todo: Todo | null): string {
    return this.labelService.labelById(todo?.labelIds[0] ?? null)?.name ?? '';
  }

  /** Bisherige Zeit auf der Aufgabe, über alle Tage — „1h 5m", leer ohne. */
  spent(todo: Todo | null): string {
    const seconds = todo ? (this.focus.totals().get(todo.id) ?? 0) : 0;
    return seconds >= 60 ? formatFocus(seconds) : '';
  }
}
