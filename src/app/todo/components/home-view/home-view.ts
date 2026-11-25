import {
  ChangeDetectionStrategy,
  Injector,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideAngularModule, Check, ChevronDown, Pause, Play, Repeat, Timer } from 'lucide-angular';

import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import {
  FocusSessionService,
  FocusSessionRecord,
  elapsedNow,
  formatClock,
  formatFocus,
} from '../../services/focus-session.service';
import { Todo } from '../../model/todo.model';
import { RichText } from '../../shared/rich-text';
import { TokenChip } from '../../shared/token-chip';
import { ProgressRing } from '../progress-ring/progress-ring';
import { TitleToken, typedTitle } from '../../shared/title-token';
import { priorityBadge } from '../../shared/title-priority';
import { plainText, titleText } from '../../shared/rich-title';
import { folderColorClass } from '../../shared/folder-color';
import { rankForFocus } from '../../shared/focus';
import { toISODate } from '../../shared/week';
import {
  HomeEntry,
  PlacedBlock,
  clockTime,
  dayRange,
  doneBlocks,
  doneOn,
  entryHas,
  focusBlocksOn,
  focusSecondsOn,
  homeEntries,
  layoutDay,
  offsetFor,
  openOn,
  stepIndex,
  totalFocusOn,
} from '../../shared/today';

/** Pixel je Stunde auf der Zeitleiste: 18 Stunden passen auf knapp 900px. */
const PX_PER_HOUR = 48;
/** So hoch ist ein Eintrag mindestens, sonst ist ein kurzer Block nicht lesbar. */
const MIN_BLOCK = 22;
/** Wie oft die Sitzungen aus Flow neu geholt werden, solange Home offen ist. */
const SESSIONS_MS = 120_000;

const DONE_COLLAPSED_KEY = 'home.doneCollapsed';

/**
 * Welche Hauptaufgaben eingeklappt sind — derselbe Speicher wie in der Liste.
 * Wer eine Aufgabe dort zuklappt, findet sie hier zugeklappt, und umgekehrt:
 * eine Aufgabe, ein Zustand.
 */
const FOLDED_KEY = 'todos.collapsed';

function readFolded(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? 'null');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(DONE_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Home: was heute schon geschafft ist und woran man gerade sitzt.
 *
 * Links der Tag als Liste — oben die Aufgabe, die in Flow läuft (oder, wenn
 * nichts läuft, die wichtigste offene), darunter der Rest für heute und
 * eingeklappt das Erledigte. Rechts derselbe Tag auf einer Uhr: Fokusblöcke
 * aus Flow und die Momente, in denen etwas abgehakt wurde, mit einer Linie
 * für jetzt.
 */
@Component({
  selector: 'app-home-view',
  imports: [NgTemplateOutlet, LucideAngularModule, RichText, TokenChip, ProgressRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-view.html',
  styleUrl: './home-view.scss',
})
export class HomeView {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);
  private readonly focus = inject(FocusSessionService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly CheckIcon = Check;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly PauseIcon = Pause;
  protected readonly PlayIcon = Play;
  protected readonly RepeatIcon = Repeat;
  protected readonly TimerIcon = Timer;

  // ---- Die Uhr der Ansicht ----
  // Jede halbe Minute für die Jetzt-Linie und den Tageswechsel; jede Sekunde,
  // solange in Flow ein Block läuft und dessen Restzeit an der Karte steht.
  protected readonly now = signal(Date.now());
  protected readonly today = computed(() => toISODate(new Date(this.now())));
  protected readonly dateTitle = computed(() =>
    new Date(this.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );
  /** Auf dem Telefon kürzer: „Wednesday, Nov 18" passt in eine Zeile. */
  protected readonly dateTitleShort = computed(() =>
    new Date(this.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
  );

  // ---- Aufgaben ----
  protected readonly done = computed(() => doneOn(this.todoService.allTodos(), this.today()));
  private readonly open = computed(() => openOn(this.todoService.allTodos(), this.today()));

  /** Die Aufgabe, an der gerade gearbeitet wird, solange sie offen ist. */
  protected readonly running = computed(() => {
    const todo = this.todoService.todoById(this.focus.active()?.todoId);
    return todo && !todo.completed ? todo : null;
  });
  protected readonly paused = computed(() => this.focus.active()?.paused ?? false);
  protected readonly runningSince = computed(() => {
    const active = this.focus.active();
    return active ? clockTime(new Date(active.startedAt)) : '';
  });

  /**
   * Läuft nichts, steht die wichtigste offene Aufgabe für heute oben — nach
   * derselben Rangfolge wie „Next up" in der Liste. Das kann auch ein Schritt
   * sein; dann steht seine Hauptaufgabe oben, und er ist darin markiert.
   */
  protected readonly upNextId = computed(() =>
    this.running() ? null : (rankForFocus(this.open(), this.today())[0]?.id ?? null),
  );

  // ---- Hauptaufgaben mit Schritten ----
  private readonly index = computed(() => stepIndex(this.todoService.snapshot()));

  /**
   * Der Tag als Einträge: Hauptaufgaben mit allen Schritten, der Rest
   * einzeln. Oben, woran gerade gearbeitet wird — oder was als Nächstes dran
   * ist —, samt der Hauptaufgabe, zu der es gehört.
   */
  protected readonly entries = computed<HomeEntry[]>(() => {
    const list = homeEntries(this.open(), this.index());
    const running = this.running();
    const firstId = running?.id ?? this.upNextId();
    if (!firstId) return list;

    const at = list.findIndex((entry) => entryHas(entry, firstId));
    if (at >= 0) return [list[at], ...list.slice(0, at), ...list.slice(at + 1)];
    // Läuft eine Aufgabe, die nicht für heute geplant ist: trotzdem oben.
    return running ? [...homeEntries([running], this.index()), ...list] : list;
  });

  /**
   * Erledigt heute, ebenso gruppiert. Ein Schritt rückt nur unter seine
   * Hauptaufgabe, wenn die heute auch fertig wurde; sonst steht er allein da,
   * mit dem Namen der Aufgabe darunter.
   */
  protected readonly doneEntries = computed<HomeEntry[]>(() => {
    const doneIds = new Set(this.done().map((t) => t.id));
    return homeEntries(this.done(), this.index(), (_step, head) => doneIds.has(head.id));
  });

  /** Die Rolle einer Aufgabe auf Home: läuft, ist als Nächstes dran, offen oder erledigt. */
  roleOf(todo: Todo): 'running' | 'next' | 'open' | 'done' {
    if (todo.id === this.running()?.id) return 'running';
    if (todo.id === this.upNextId()) return 'next';
    return todo.completed ? 'done' : 'open';
  }

  /** Läuft gerade einer ihrer Schritte? Dann ist die ganze Gruppe leise gerahmt. */
  stepRunning(entry: HomeEntry): boolean {
    const id = this.running()?.id;
    return entry.kind === 'group' && !!id && entry.steps.some((s) => s.id === id);
  }

  stepsDone(entry: HomeEntry): number {
    return entry.kind === 'group' ? entry.steps.filter((s) => s.completed).length : 0;
  }

  /** Der Name der Hauptaufgabe, wenn eine Aufgabe ein Schritt ist und allein steht. */
  headTitle(todo: Todo): string {
    const head = this.index().headOf.get(todo.id);
    return head ? this.plainTitle(head.title) : '';
  }

  // ---- Einklappen ----
  protected readonly folded = signal(readFolded());

  toggleFold(headId: string, event: Event): void {
    event.stopPropagation();
    const next = new Set(this.folded());
    if (next.has(headId)) next.delete(headId);
    else next.add(headId);
    this.folded.set(next);
    try {
      // Mit dem frischen Stand aus dem Speicher zusammenführen: die Liste
      // schreibt denselben Schlüssel.
      const stored = new Set(readFolded());
      if (next.has(headId)) stored.add(headId);
      else stored.delete(headId);
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...stored]));
    } catch {
      /* dann eben nur für diese Sitzung */
    }
  }

  /** Einen Schritt abhaken: er bleibt in seiner Gruppe stehen, nur sein Haken ändert sich. */
  toggleStep(step: Todo, event: Event): void {
    event.stopPropagation();
    this.todoService.toggleTodo(step.id);
  }

  protected readonly openCount = computed(() => this.open().length);

  protected readonly score = computed(() => {
    const done = this.done().length;
    const total = done + this.open().length;
    return { done, total };
  });

  /** Wie lange schon an der aktiven Aufgabe gearbeitet wird, hochzählend. */
  protected readonly clock = computed(() => {
    const active = this.focus.active();
    return active ? formatClock(elapsedNow(active, this.now())) : '';
  });

  protected readonly busy = this.focus.busy;

  // ---- Fokus aus Flow ----
  private readonly sessions = signal<FocusSessionRecord[]>([]);
  private fetchedAt = 0;

  /** Hat dieses Konto Flow je benutzt? Sonst ist eine Fokuszeit von 0 nur Lärm. */
  protected readonly usesFlow = computed(
    () => (this.focus.sessionCount() ?? 0) > 0 || this.sessions().length > 0,
  );

  private readonly secondsByTodo = computed(() => focusSecondsOn(this.sessions(), this.today()));

  /** Fokus heute, der laufende Block bis zu dieser Sekunde mitgerechnet. */
  protected readonly focusToday = computed(() => {
    let seconds = totalFocusOn(this.sessions(), this.today());
    const active = this.focus.active();
    if (active && !active.paused && this.sessions().some((s) => s.id === active.id && s.endedAt === null)) {
      seconds += Math.max(0, (this.now() - this.fetchedAt) / 1000);
    }
    return formatFocus(seconds);
  });

  /**
   * Die Zeile unter dem Datum, in Teilen mit Punkten dazwischen — wie die
   * Woche ihre Bilanz schreibt: woran gerade gearbeitet wird, wie viel von
   * heute erledigt ist, wie lange im Fokus.
   */
  protected readonly headParts = computed(() => {
    const parts: string[] = [];
    const running = this.running();
    const { done, total } = this.score();
    if (running) parts.push(`Working on it since ${this.runningSince()}`);
    if (total > 0) parts.push(`${done} of ${total} done`);
    else if (!running) parts.push('Nothing planned for today yet');
    if (this.usesFlow()) parts.push(`${this.focusToday()} in focus`);
    return parts;
  });

  // ---- Zeitleiste ----
  private readonly blocks = computed(() => [
    ...focusBlocksOn(this.sessions(), this.today(), new Date(this.now())),
    ...doneBlocks(this.done()),
  ]);
  private readonly range = computed(() => dayRange(this.blocks(), this.today()));
  protected readonly hours = computed(() => {
    const { startHour, endHour } = this.range();
    return Array.from({ length: endHour - startHour }, (_, i) => ({
      label: `${startHour + i}:00`,
      top: i * PX_PER_HOUR,
    }));
  });
  protected readonly trackHeight = computed(() => (this.range().endHour - this.range().startHour) * PX_PER_HOUR);
  protected readonly placed = computed(() =>
    layoutDay(this.blocks(), this.today(), this.range(), PX_PER_HOUR, MIN_BLOCK),
  );
  protected readonly nowTop = computed(() =>
    offsetFor(new Date(this.now()), this.today(), this.range(), PX_PER_HOUR),
  );
  protected readonly nowLabel = computed(() => clockTime(new Date(this.now())));

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  // ---- Erledigtes einklappen ----
  protected readonly doneCollapsed = signal(readCollapsed());

  toggleDoneList(): void {
    const next = !this.doneCollapsed();
    this.doneCollapsed.set(next);
    try {
      localStorage.setItem(DONE_COLLAPSED_KEY, String(next));
    } catch {
      /* dann eben nur für diese Sitzung */
    }
  }

  constructor() {
    void this.loadSessions();

    // Ein Block fängt an, endet oder pausiert: die Zeitleiste holt nach.
    let lastKey: string | undefined;
    effect(() => {
      const active = this.focus.active();
      const key = active ? `${active.id}:${active.paused}` : 'none';
      if (lastKey !== undefined && key !== lastKey) untracked(() => void this.loadSessions());
      lastKey = key;
    });

    // Der Takt der Uhr: schnell, solange ein Block läuft, sonst gemächlich.
    let ticker: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const fast = this.focus.active() !== null && !this.focus.active()!.paused;
      if (ticker !== null) clearInterval(ticker);
      ticker = setInterval(() => this.now.set(Date.now()), fast ? 1000 : 30_000);
    });

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.loadSessions();
    }, SESSIONS_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        this.now.set(Date.now());
        void this.loadSessions();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    this.destroyRef.onDestroy(() => {
      if (ticker !== null) clearInterval(ticker);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    });

    // Die Zeitleiste öffnet bei jetzt, nicht um sechs Uhr morgens.
    afterNextRender(() => this.scrollToNow());
  }

  private async loadSessions(): Promise<void> {
    const sessions = await this.focus.loadRecent(80);
    if (sessions === null) return;
    this.fetchedAt = Date.now();
    this.sessions.set(sessions);
  }

  private scrollToNow(): void {
    const el = this.scroller()?.nativeElement;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    el.scrollTop = Math.max(0, this.nowTop() - el.clientHeight * 0.4);
  }

  // ---- Handgriffe ----

  quickAdd(input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) return;
    const title = typedTitle(value);
    if (title) this.todoService.addTodo(title, this.today());
    input.value = '';
  }

  /**
   * Abhaken — und die Karte gleitet dorthin, wo sie jetzt hingehört: in
   * „Done today" oder von dort zurück nach oben. Ohne diese Bewegung
   * verschwände sie an der einen Stelle und tauchte an einer anderen auf,
   * und man suchte, wo sie geblieben ist.
   *
   * View Transitions: der Browser fotografiert vorher und nachher und lässt
   * jede Karte mit eigenem Namen von ihrem alten an den neuen Platz gleiten.
   * Wo der Browser das nicht kann oder weniger Bewegung gewünscht ist, wird
   * einfach abgehakt.
   */
  toggle(todo: Todo): void {
    const doc = document as Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!doc.startViewTransition || calm) {
      this.todoService.toggleTodo(todo.id);
      return;
    }

    const root = document.documentElement;
    root.classList.add('home-moving');
    const transition = doc.startViewTransition(() => {
      this.todoService.toggleTodo(todo.id);
      // Das neue Bild muss stehen, bevor der Browser es fotografiert: erst
      // nach dem nächsten Zeichnen weitermachen. Ein eigenes tick() an dieser
      // Stelle lief Angular in die laufende Änderungserkennung. Kommt kein
      // Zeichnen (nichts hat sich geändert), nach 300ms trotzdem.
      return new Promise<void>((resolve) => {
        afterNextRender(() => resolve(), { injector: this.injector });
        setTimeout(resolve, 300);
      });
    });
    transition.finished.finally(() => root.classList.remove('home-moving'));
  }

  /**
   * Zeit auf die vorgeschlagene Aufgabe erfassen — ein Tipp, statt sie oben
   * erst zu suchen.
   */
  start(todo: Todo, event: Event): void {
    event.stopPropagation();
    void this.focus.track(todo.id);
  }

  /** Zur Aufgabe in der Liste, wo sie sich bearbeiten lässt. */
  show(todo: Todo): void {
    this.todoService.reveal(todo);
  }

  // ---- Darstellung ----

  displayTitle(title: string): string {
    return titleText(title);
  }

  plainTitle(title: string): string {
    return plainText(titleText(title));
  }

  badge(title: string): TitleToken | null {
    return priorityBadge(title);
  }

  fillClass(todo: Todo): string {
    return folderColorClass(this.labelService.labelById(todo.labelIds[0] ?? null)?.color, 'fill');
  }

  dotClass(color: string): string {
    return folderColorClass(color, 'dot');
  }

  folderOf(todo: Todo): { name: string; color: string; more: number } | null {
    const label = this.labelService.labelById(todo.labelIds[0] ?? null);
    return label ? { name: label.name, color: label.color, more: todo.labelIds.length - 1 } : null;
  }

  /** Fokus heute auf dieser Aufgabe, „25m" — leer, wenn es keinen gab. */
  spent(todo: Todo): string {
    const seconds = this.secondsByTodo().get(todo.id) ?? 0;
    return seconds >= 60 ? formatFocus(seconds) : '';
  }

  /** Die Farbe eines Eintrags der Zeitleiste: die des Ordners seiner Aufgabe. */
  blockColor(block: PlacedBlock): string {
    const todo = this.todoService.todoById(block.todoId);
    const color = this.labelService.labelById(todo?.labelIds[0] ?? null)?.color;
    return folderColorClass(color, 'dot');
  }

  blockTitle(block: PlacedBlock): string {
    return plainText(titleText(block.title)).split('\n')[0];
  }

  blockTime(block: PlacedBlock): string {
    if (block.kind === 'done') return `done ${clockTime(block.start)}`;
    return `${clockTime(block.start)} – ${block.running ? 'now' : clockTime(block.end)}`;
  }

  blockLeft(block: PlacedBlock): string {
    return `calc(var(--gutter) + (100% - var(--gutter) - 0.5rem) * ${block.lane / block.lanes})`;
  }

  blockWidth(block: PlacedBlock): string {
    return `calc((100% - var(--gutter) - 0.5rem) / ${block.lanes} - 3px)`;
  }
}
