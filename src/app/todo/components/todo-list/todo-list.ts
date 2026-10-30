import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { LucideIconData } from 'lucide-angular';
import {
  ConnectedPosition,
  OverlayModule,
} from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { HOLD_TO_DRAG_MS, HoldToDrag } from '../../../shared/hold-to-drag';

import { TodoService } from '../../services/todo';
import { NgClass } from '@angular/common';
import { RepeatRule, Todo } from '../../model/todo.model';
import { Autosize } from '../../../directives/autosize.directive';
import { folderColorClass } from '../../shared/folder-color';
import {
  MoscowLevel,
  TimeOfDay,
  durationOf,
  durationPrefix,
  formatDuration,
  setDuration,
  setTimeOfDay,
  stripPriorityPrefix,
  priorityBadge,
  subtaskGroups,
  taskLevel,
  TaskLevel,
  timeOfDay,
  withTaskLevel,
} from '../../shared/title-priority';
import { TaskIcon, splitLeadingEmoji, taskIcon } from '../../shared/task-icon';
import { Grouping, ListViewService, SortOrder } from '../../services/list-view.service';
import { Suggestion, suggestTasks } from '../../shared/suggestions';
import {
  TitleToken,
  joinTitle,
  splitTitle,
  tokenClass,
  tokenDescription,
  tokenIcon,
  tokenText,
  tokensOf,
  withToken,
} from '../../shared/title-token';
import { TokenChip } from '../../shared/token-chip';
import { FocusSessionService, formatFocus } from '../../services/focus-session.service';
import { folderIcon } from '../../shared/folder-icon';
import { LabelService, Label} from '../../services/label.service';
import { isOverdueDate, scheduleLabel, scheduleOptions } from '../../shared/schedule';
import { shiftISODate, todayISO } from '../../shared/week';
import { isSection, sectionName } from '../../shared/section';
import { DatePicker } from '../date-picker/date-picker';
import { tap } from '../../shared/haptics';
import { RewardService } from '../../../reward/reward.service';
import { ToastService } from '../../../shared/toast.service';
import { Rhythm, rhythmByTodo } from '../../shared/rhythm';

import {
  CalendarPlus,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  EllipsisVertical,
  GripVertical,
  LucideAngularModule,
  Star,
  Pencil,
  Trash2,
  Folder,
  Repeat,
  Archive,
  Undo2,
  FileText,
  Timer,
  X,
  ListIndentDecrease,
  ListIndentIncrease,
  ListPlus,
  Plus,
  Rows3,
  Sunrise,
  Sun,
  Moon,
  RefreshCw,
} from 'lucide-angular';

/**
 * Zugeklappte Hauptaufgaben, ueber das Neuladen hinweg.
 *
 * Eingeklappt bleibt eingeklappt: wer eine erledigte Teilliste wegraeumt, will
 * sie nicht beim naechsten Oeffnen wieder vor sich haben. Die IDs liegen
 * lokal, weil es eine Ansichtssache ist und keine Eigenschaft des Todos.
 */
const COLLAPSED_KEY = 'todos.collapsed';

function readCollapsed(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Eine Zeile, fertig gerechnet.
 *
 * Die Vorlage rief pro Zeile rund zwanzig Methoden auf, davon ein halbes
 * Dutzend mit String-Arbeit: Praefix abschneiden, an Zeilenumbruechen
 * zerlegen, Labelnamen zusammensetzen. Das lief bei JEDEM Durchlauf der
 * Aenderungserkennung, also bei jedem Tastendruck in der Suche, und zwar fuer
 * alle Zeilen. Bei zweihundert Todos sind das gut tausend String-Allokationen
 * pro Anschlag, fuer ein Ergebnis, das sich nur aendert, wenn sich der Titel
 * aendert.
 *
 * Hier steht es einmal je Datenstand. Die Vorlage liest danach nur noch
 * Eigenschaften.
 */
type ListItem =
  | { kind: 'row'; key: string; row: TodoRow; addFollows: boolean }
  | { kind: 'add'; key: string; headId: string; headTitle: string }
  | { kind: 'section'; key: string; row: TodoRow; collapsed: boolean }
  | { kind: 'addTodo'; key: string; sectionId: string; sectionName: string }
  | { kind: 'addSection'; key: string }
  | {
      kind: 'bucket';
      key: string;
      id: string;
      label: string;
      count: number;
      collapsed: boolean;
      tint: string;
      canAdd: boolean;
    }
  | { kind: 'bucketEmpty'; key: string; id: string; hint: string }
  | { kind: 'bucketAdd'; key: string; id: string; label: string };

/**
 * Die Fächer beim Gruppieren. Nach Termin: was drängt, steht oben; Erledigtes
 * mit vergangenem Datum heisst „Earlier", nicht „Overdue". Nach Priorität in
 * MoSCoW-Reihenfolge, Won't zuletzt.
 */
interface BucketDef {
  id: string;
  label: string;
  /** Farbe der Pille (todo-list.scss, .todo-section--tint-*). */
  tint: string;
  /** Leer zeigen statt weglassen — mit Platzhalter zum Anlegen. */
  keepEmpty?: boolean;
  /** Was im leeren Fach steht. */
  hint?: string;
}

const DATE_BUCKETS: readonly BucketDef[] = [
  { id: 'overdue', label: 'Overdue', tint: 'rose' },
  { id: 'today', label: 'Today', tint: 'teal', keepEmpty: true, hint: 'Nothing planned for today' },
  { id: 'tomorrow', label: 'Tomorrow', tint: 'sky' },
  { id: 'week', label: 'Next 7 days', tint: 'violet' },
  { id: 'later', label: 'Later', tint: 'neutral' },
  { id: 'earlier', label: 'Earlier', tint: 'neutral' },
  { id: 'none', label: 'No date', tint: 'neutral' },
];

/**
 * Nach Priorität stehen alle Fächer da, auch leere: wie viel „Must" gerade
 * ansteht, ist eine Auskunft — auch wenn sie null lautet.
 */
const PRIORITY_BUCKETS: readonly BucketDef[] = [
  { id: 'must', label: 'Must', tint: 'rose', keepEmpty: true, hint: 'Nothing that must happen' },
  { id: 'should', label: 'Should', tint: 'peach', keepEmpty: true, hint: 'Not urgent' },
  { id: 'could', label: 'Could', tint: 'sky', keepEmpty: true, hint: 'Nice to have, if time allows' },
  { id: 'none', label: 'To-do', tint: 'neutral' },
  { id: 'wont', label: "Won't", tint: 'violet' },
];

/** Tageszeit, wie in einem Tagesplan: jederzeit zuerst, dann der Tag entlang. */
const TIME_BUCKETS: readonly BucketDef[] = [
  { id: 'anytime', label: 'Anytime', tint: 'neutral', keepEmpty: true, hint: 'Anytime today works' },
  { id: 'morning', label: 'Morning', tint: 'peach', keepEmpty: true, hint: 'Nothing for the morning' },
  { id: 'afternoon', label: 'Afternoon', tint: 'sky', keepEmpty: true, hint: 'Nothing for the afternoon' },
  { id: 'evening', label: 'Evening', tint: 'violet', keepEmpty: true, hint: 'Nothing for the evening' },
];

/** Was ein neues Todo aus einem Fach mitbekommt. */
function bucketPrefix(mode: Grouping, id: string): string {
  if (mode === 'priority') {
    return id === 'must' ? '/must ' : id === 'should' ? '/should ' : id === 'could' ? '/could ' : id === 'wont' ? "/won't " : '';
  }
  if (mode === 'time') return id === 'anytime' ? '' : `/${id} `;
  return '';
}

function bucketDate(mode: Grouping, id: string): string | null {
  if (mode !== 'date') return null;
  if (id === 'today') return todayISO();
  if (id === 'tomorrow') return shiftISODate(todayISO(), 1);
  return null;
}

/** Fächer, in die man direkt anlegen kann. */
function bucketTakesNew(mode: Grouping, id: string): boolean {
  if (mode === 'date') return id === 'today' || id === 'tomorrow' || id === 'none';
  return mode === 'priority' || mode === 'time';
}

/**
 * Sortiert Blöcke (Aufgabe mit ihren Schritten). Stabil: was gleich ist,
 * bleibt in der gezogenen Reihenfolge.
 */
function sortBlocks(blocks: TodoRow[][], sort: SortOrder): TodoRow[][] {
  if (sort === 'manual') return blocks;
  const key = (block: TodoRow[]) => block[0];
  const byName = (a: TodoRow, b: TodoRow) => a.firstLine.localeCompare(b.firstLine, undefined, { sensitivity: 'base' });
  const cmp: Record<Exclude<SortOrder, 'manual'>, (a: TodoRow, b: TodoRow) => number> = {
    date: (a, b) => (a.todo.scheduledDate ?? '9999').localeCompare(b.todo.scheduledDate ?? '9999'),
    name: byName,
    duration: (a, b) => (durationOf(a.todo.title) ?? 1e9) - (durationOf(b.todo.title) ?? 1e9),
  };
  return [...blocks].sort((a, b) => cmp[sort](key(a), key(b)));
}

/** Zeilen → Blöcke aus Aufgabe und Schritten, Überschriften für sich. */
function blocksOf(rows: readonly TodoRow[]): TodoRow[][] {
  const blocks: TodoRow[][] = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (!row.isSection && row.parentId !== null && last && last[0].id === row.parentId) last.push(row);
    else blocks.push([row]);
  }
  return blocks;
}

/** Sortiert je Abschnitt; die Überschriften bleiben, wo sie sind. */
function sortWithinSections(rows: readonly TodoRow[], sort: SortOrder): TodoRow[] {
  if (sort === 'manual') return [...rows];
  const out: TodoRow[] = [];
  let segment: TodoRow[][] = [];
  const flush = () => {
    out.push(...sortBlocks(segment, sort).flat());
    segment = [];
  };
  for (const block of blocksOf(rows)) {
    if (block[0].isSection) {
      flush();
      out.push(...block);
    } else {
      segment.push(block);
    }
  }
  flush();
  return out;
}

interface TodoRow {
  id: string;
  todo: Todo;
  /** Titel ohne Prioritaets-Praefix. */
  displayTitle: string;
  /**
   * Was im Feld steht, sobald man die Zeile bearbeitet.
   *
   * Bei einer Unteraufgabe ohne „/sub": das Praefix ist gesetzt, es steht als
   * Einzug in der Liste, und ein zweites Mal als Text davor will es niemand
   * lesen. Beim Speichern kommt es zurueck (siehe finishEditing). Bei den
   * MoSCoW-Praefixen bleibt der Rohtext stehen: sie sind der einzige Weg, eine
   * Stufe wieder zu aendern oder zu entfernen.
   */
  editTitle: string;
  /** Erste Zeile und der Rest, fuer den aufgeklappten Zustand. */
  firstLine: string;
  detailLines: string;
  /** Hat der Text ueberhaupt etwas unter der ersten Zeile? */
  hasDetail: boolean;
  /** Die Priorität, gezeigt als Zeichen (TokenChip). */
  badge: MoscowLevel | null;
  /** Haupt- oder Unteraufgabe. Traegt die Einrueckung in der Liste. */
  level: TaskLevel | null;
  /** Die Hauptaufgabe darueber, wenn diese Zeile eine Unteraufgabe ist. */
  parentId: string | null;
  /** Wie viele Unteraufgaben an dieser Zeile haengen. 0 = keine. */
  subCount: number;
  /** Letzte Unteraufgabe ihrer Gruppe — dort endet die Fuehrungslinie. */
  lastOfGroup: boolean;
  /** Erledigt von allen Schritten, im ganzen Folder. null = keine Schritte. */
  progress: { done: number; total: number } | null;
  /** Die Aufgabe darüber, deren Schritt diese Zeile werden kann. */
  indentTarget: { id: string; title: string } | null;
  /** Ein Schritt, der wieder eine eigene Aufgabe werden kann. */
  canOutdent: boolean;
  /** Eine Abschnitts-Überschrift statt eines Todos (section.ts). */
  isSection: boolean;
  /** Der Abschnitt, zu dem die Zeile gehört; null = vor dem ersten. */
  sectionId: string | null;
  /** Bei einer Überschrift: offene Aufgaben darin (ohne Schritte). */
  sectionCount: number;
  /** Das Bild im Kreis vor dem Titel (task-icon.ts). */
  icon: TaskIcon;
  /** Tönung des Kreises: die Farbe des primären Ordners. */
  iconClass: string;
  /** „15m", „1h 30m" — leer ohne Dauer. */
  durationText: string;
  /** Tageszeit, null = Anytime. */
  when: TimeOfDay | null;
  /** Steht unter dem Titel eine Meta-Zeile (Dauer, Zeit, Termin, Fortschritt)? */
  hasMeta: boolean;
  /** Farbe des primären Ordners, als Punkt vor dem Titel. */
  folderDotClass: string;
  folderDotTitle: string;
  primaryLabelId: string | null;
  /**
   * Trefferquote der Wiederholungsreihe, zu der diese Zeile gehört.
   * null = keine Wiederholung, oder noch zu wenige fällige Termine.
   */
  rhythm: Rhythm | null;
  /** Ein Punkt je Label, in Labelfarbe. */
  dotClasses: string[];
  labelTitle: string;
  scheduleText: string;
  isLate: boolean;
  /** Für heute geplant — der eine Termin, der in der Zeile hervortritt. */
  isToday: boolean;
  /** Versatz beim Einlaufen, gedeckelt. */
  stagger: number;
}

@Component({
  selector: 'app-todo-list',
  imports: [
    Autosize,
    LucideAngularModule,
    OverlayModule,
    CdkDropList,
    CdkDrag,
    HoldToDrag,
    
    CdkDragPlaceholder,
    TokenChip,
    DatePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-list.html',
  styleUrl: './todo-list.scss',
})
export class TodoList {
  private readonly todoService = inject(TodoService);
  private readonly rewards = inject(RewardService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Die Zeile, zu der die Suche gerade gesprungen ist — sie leuchtet kurz auf. */
  protected readonly revealedId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const request = this.todoService.revealRequest();
      if (request) untracked(() => this.reveal(request.id));
    });
  }

  /**
   * Zur Zeile scrollen, sie aufleuchten lassen und ihr den Fokus geben.
   *
   * Die Zeile ist nicht immer sofort da: nach dem Wechsel aus der Woche wird
   * die Liste erst gebaut, und archivierte Todos kommen erst mit der Antwort
   * des Servers. Deshalb wird ein paar Bilder lang nachgesehen statt einmal.
   * Der Fokus geht auf den Haken — die Suche hat ihn abgegeben, und er soll
   * nicht im Nichts landen.
   */
  private reveal(id: string): void {
    let frames = 0;

    const attempt = () => {
      // Unteraufgabe einer zugeklappten Hauptaufgabe: erst aufklappen.
      const row = this.rows().find((r) => r.id === id);
      if (row?.parentId && this.isCollapsed(row.parentId)) this.toggleSubtasks(row.parentId);

      const element = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-todo-id="${CSS.escape(id)}"]`,
      );
      if (!element) {
        // Rund zwei Sekunden, dann aufgeben — die Ansicht steht trotzdem richtig.
        if (++frames < 120) requestAnimationFrame(attempt);
        else this.todoService.revealRequest.set(null);
        return;
      }

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      element.querySelector<HTMLElement>('.todo-checkbox')?.focus({ preventScroll: true });

      this.revealedId.set(id);
      window.setTimeout(() => {
        if (this.revealedId() === id) this.revealedId.set(null);
      }, 1800);
      this.todoService.revealRequest.set(null);
    };

    requestAnimationFrame(attempt);
  }

  protected readonly labelService = inject(LabelService);

  protected readonly todos = this.todoService.filteredTodos;

  /**
   * Die Zeilen, fertig gerechnet.
   *
   * Laeuft neu, wenn sich die gefilterten Todos oder die Folder aendern, und
   * sonst nie. Der Zustand, der sich beim Bedienen aendert (aufgeklappt, in
   * Bearbeitung, verschwindend), steht bewusst NICHT drin: sonst wuerde ein
   * Klick auf einen Pfeil alle zweihundert Zeilen neu rechnen. Der bleibt in
   * eigenen Signalen und wird in der Vorlage abgefragt, wo er billig ist.
   */
  /**
   * Trefferquote je Zeile.
   *
   * Über ALLE Todos, nicht über die gefilterten: die vergangenen Ausgaben
   * einer wiederkehrenden Aufgabe sind erledigt, und unter „Active" stünden
   * sie nicht in der Liste. Eine Quote, die sich mit dem Filter ändert, wäre
   * keine.
   */
  private readonly rhythms = computed(() => rhythmByTodo(this.todoService.withArchive()));

  protected readonly rows = computed<TodoRow[]>(() => {
    const items = this.todos();
    const rhythms = this.rhythms();

    // Wer gehoert zu wem: ein Durchgang, dieselbe Regel wie beim Sortieren.
    const parentOf = new Map<string, string>();
    const subCounts = new Map<string, number>();
    const lastSubs = new Set<string>();
    for (const [head, ...subs] of subtaskGroups(items)) {
      if (subs.length === 0) continue;
      subCounts.set(head.id, subs.length);
      for (const sub of subs) parentOf.set(sub.id, head.id);
      lastSubs.add(subs[subs.length - 1].id);
    }

    const today = todayISO();
    const progress = this.todoService.stepProgress();
    const byId = new Map(items.map((todo) => [todo.id, todo]));

    // Zu welchem Abschnitt jede Zeile gehört, und wie viel darin offen ist.
    const sectionOf = new Map<string, string | null>();
    const openIn = new Map<string, number>();
    let current: string | null = null;
    for (const todo of items) {
      if (isSection(todo.title)) {
        current = todo.id;
        openIn.set(todo.id, 0);
      } else if (current !== null && !todo.completed && taskLevel(todo.title) !== 'sub') {
        openIn.set(current, (openIn.get(current) ?? 0) + 1);
      }
      sectionOf.set(todo.id, current);
    }

    return items.map((todo, index) => {
      const section = isSection(todo.title);
      const badge = section ? null : priorityBadge(todo.title);
      const stripped = section ? sectionName(todo.title) : stripPriorityPrefix(todo.title);
      // Ein Emoji vorn im Titel steht im Kreis, nicht noch einmal im Text.
      const shown = section ? stripped : splitLeadingEmoji(stripped).rest;
      const [first, ...rest] = shown.split('\n');
      const detail = rest.join('\n').trim();
      const level = taskLevel(todo.title);
      const minutes = section ? null : durationOf(todo.title);
      const when = section ? null : timeOfDay(todo.title);
      const steps = progress.get(todo.id) ?? null;

      return {
        id: todo.id,
        todo,
        displayTitle: shown,
        // Auch beim Bearbeiten ohne Präfix: es steht als Chip davor.
        editTitle: stripped,
        icon: taskIcon(stripped),
        iconClass: this.iconClass(todo.labelIds),
        durationText: minutes === null ? '' : formatDuration(minutes),
        when,
        hasMeta:
          !section &&
          (badge !== null ||
            minutes !== null ||
            when !== null ||
            todo.scheduledDate !== null ||
            todo.repeat !== null ||
            steps !== null),
        firstLine: first.trim(),
        detailLines: detail,
        hasDetail: detail.length > 0,
        badge,
        level,
        parentId: parentOf.get(todo.id) ?? null,
        subCount: subCounts.get(todo.id) ?? 0,
        lastOfGroup: lastSubs.has(todo.id),
        progress: steps,
        indentTarget: section ? null : this.indentTargetFor(items, index, parentOf, subCounts, byId),
        canOutdent: level === 'sub' && parentOf.has(todo.id),
        isSection: section,
        sectionId: sectionOf.get(todo.id) ?? null,
        sectionCount: openIn.get(todo.id) ?? 0,
        folderDotClass: this.folderDotClass(todo.labelIds),
        folderDotTitle: this.folderDotTitle(todo.labelIds),
        primaryLabelId: todo.labelIds[0] ?? null,
        rhythm: rhythms.get(todo.id) ?? null,
        dotClasses: todo.labelIds.map((id) => this.dotClass(id)),
        labelTitle: this.labelTitle(todo.labelIds),
        scheduleText:
          todo.scheduledDate === null ? '' : scheduleLabel(todo.scheduledDate),
        isLate: !todo.completed && isOverdueDate(todo.scheduledDate),
        isToday: todo.scheduledDate === today,
        stagger: Math.min(index, 5),
      };
    });
  });

  /**
   * Wessen Schritt diese Zeile werden kann: die Aufgabe, die in der Liste
   * direkt darüber steht (bei einem Schritt darüber dessen Aufgabe). Nicht
   * für Schritte (die sind es schon) und nicht für Aufgaben mit eigenen
   * Schritten — drei Ebenen gibt es nicht.
   */
  private indentTargetFor(
    items: readonly Todo[],
    index: number,
    parentOf: ReadonlyMap<string, string>,
    subCounts: ReadonlyMap<string, number>,
    byId: ReadonlyMap<string, Todo>,
  ): { id: string; title: string } | null {
    const todo = items[index];
    if (index === 0 || taskLevel(todo.title) === 'sub' || subCounts.has(todo.id)) return null;
    const above = items[index - 1];
    if (isSection(above.title)) return null;
    const head = byId.get(parentOf.get(above.id) ?? above.id);
    if (!head) return null;
    return { id: head.id, title: stripPriorityPrefix(head.title).split('\n')[0].trim() };
  }

  /**
   * Die Zeilen, die wirklich dastehen: ohne die Unteraufgaben zugeklappter
   * Hauptaufgaben.
   *
   * Bewusst eine zweite Ebene ueber `rows`. Das Zuklappen ist Bedienzustand;
   * stuende es in `rows`, wuerde ein Klick auf ein Dreieck saemtliche Titel neu
   * zerlegen. Hier wird nur gefiltert, und im Normalfall — nichts zugeklappt —
   * faellt auch das weg.
   */
  protected readonly visibleRows = computed<TodoRow[]>(() => {
    const collapsed = this.collapsedIds();
    if (collapsed.size === 0) return this.rows();
    return this.rows().filter(
      (row) =>
        (row.parentId === null || !collapsed.has(row.parentId)) &&
        (row.isSection || row.sectionId === null || !collapsed.has(row.sectionId)),
    );
  });
  /**
   * Was die Liste zeichnet: die Zeilen und, am Ende jeder aufgeklappten
   * Gruppe, eine Zeile „+ Add step".
   *
   * Eine Liste mit Schlüsseln statt der Zeilen allein, damit die Eingabe
   * beim Anlegen nicht neu entsteht: der neue Schritt wird VOR ihr
   * eingefügt, sie selbst bleibt dasselbe Element — mit Fokus und offener
   * Tastatur. Hinge sie an der jeweils letzten Zeile, würde sie mit jedem
   * Schritt abgebaut und neu gebaut.
   *
   * Nur unter „Active" und „All": unter „Done" oder „Favorites" stünde ein
   * neuer, offener Schritt gar nicht in der Liste.
   */
  protected readonly listItems = computed<ListItem[]>(() => {
    const sort = this.sort();
    const rows = sortWithinSections(this.visibleRows(), sort);
    const filter = this.filter();
    const canAdd = filter === 'active' || filter === 'all';
    const mode = this.grouping();
    if (mode !== 'manual') return this.bucketItems(this.rows(), mode, canAdd, sort);

    const collapsed = this.collapsedIds();
    const addingStep = this.stepInputFor();
    const addingIn = this.sectionInputFor();
    const byId = new Map(rows.map((row) => [row.id, row]));

    const out: ListItem[] = [];
    rows.forEach((row, i) => {
      const next = rows[i + 1];
      if (row.isSection) {
        out.push({ kind: 'section', key: row.id, row, collapsed: collapsed.has(row.id) });
      } else {
        const headId = row.parentId ?? row.id;
        const endsGroup = !next || (next.parentId ?? next.id) !== headId;
        const head = byId.get(headId);
        const showAdd =
          canAdd &&
          endsGroup &&
          head !== undefined &&
          ((head.subCount > 0 && !collapsed.has(headId)) || addingStep === headId);

        out.push({ kind: 'row', key: row.id, row, addFollows: showAdd });
        if (showAdd) {
          out.push({ kind: 'add', key: 'add:' + headId, headId, headTitle: head.firstLine });
        }
      }

      // Am Ende eines Abschnitts: die Eingabe für ein neues Todo darin.
      const sectionId = row.isSection ? row.id : row.sectionId;
      const endsSection = !next || next.isSection;
      if (canAdd && endsSection && sectionId !== null && addingIn === sectionId) {
        const name = byId.get(sectionId)?.firstLine ?? '';
        out.push({ kind: 'addTodo', key: 'addin:' + sectionId, sectionId, sectionName: name });
      }
    });

    if (canAdd) out.push({ kind: 'addSection', key: 'add-section' });
    return out;
  });

  /**
   * Gruppiert nach Termin oder Priorität: jede Aufgabe mit ihren Schritten
   * in ein Fach. Abschnitte treten zurück — sie sind die eigene Ordnung, und
   * die ist gerade nicht gewählt. Deshalb aus allen Zeilen, nicht aus den
   * sichtbaren: was in einem zugeklappten Abschnitt steht, fehlte sonst.
   *
   * Nach Termin zählt der früheste offene in der Gruppe. Eine Aufgabe ohne
   * Datum, deren Schritt heute fällig ist, gehört unter „Today" — dort sucht
   * man sie, und unter „No date" läge der Schritt versteckt.
   */
  private bucketItems(rows: readonly TodoRow[], mode: Grouping, canAdd: boolean, sort: SortOrder): ListItem[] {
    const today = todayISO();
    const tomorrow = shiftISODate(today, 1);
    const inWeek = shiftISODate(today, 7);
    const bucketOf = (block: readonly TodoRow[]): string => {
      const head = block[0];
      if (mode === 'priority') return head.badge ?? 'none';
      if (mode === 'time') return head.when ?? 'anytime';
      const open = block
        .filter((row) => !row.todo.completed && row.todo.scheduledDate !== null)
        .map((row) => row.todo.scheduledDate!)
        .sort();
      const date = open[0] ?? head.todo.scheduledDate;
      if (date === null) return 'none';
      if (date < today) return open.length > 0 ? 'overdue' : 'earlier';
      if (date === today) return 'today';
      if (date === tomorrow) return 'tomorrow';
      return date <= inWeek ? 'week' : 'later';
    };

    // Blöcke: eine Aufgabe und ihre Schritte, in der Reihenfolge der Liste.
    const blocks = blocksOf(rows).filter((block) => !block[0].isSection);

    const buckets = mode === 'date' ? DATE_BUCKETS : mode === 'time' ? TIME_BUCKETS : PRIORITY_BUCKETS;
    const collapsed = this.collapsedBuckets();
    const addingStep = this.stepInputFor();
    const addingIn = this.bucketInputFor();
    const out: ListItem[] = [];
    for (const bucket of buckets) {
      const inside = sortBlocks(blocks.filter((block) => bucketOf(block) === bucket.id), sort);
      const takesNew = canAdd && bucketTakesNew(mode, bucket.id);
      const adding = takesNew && addingIn === bucket.id;
      if (inside.length === 0 && !adding && !(bucket.keepEmpty && canAdd)) continue;
      const id = `${mode}:${bucket.id}`;
      const shut = collapsed.has(id);
      out.push({
        kind: 'bucket',
        key: 'bucket:' + id,
        id,
        label: bucket.label,
        count: inside.length,
        collapsed: shut,
        tint: bucket.tint,
        canAdd: takesNew,
      });
      if (shut) continue;
      for (const block of inside) {
        const head = block[0];
        const open = !this.isCollapsed(head.id);
        const shown = open ? block : [head];
        const showAdd = canAdd && ((head.subCount > 0 && open) || addingStep === head.id);
        shown.forEach((row, i) =>
          out.push({ kind: 'row', key: row.id, row, addFollows: showAdd && i === shown.length - 1 }),
        );
        if (showAdd) out.push({ kind: 'add', key: 'add:' + head.id, headId: head.id, headTitle: head.firstLine });
      }
      if (adding) {
        out.push({ kind: 'bucketAdd', key: 'bucketadd:' + id, id: bucket.id, label: bucket.label });
      } else if (inside.length === 0) {
        out.push({ kind: 'bucketEmpty', key: 'bucketempty:' + id, id: bucket.id, hint: bucket.hint ?? 'Nothing here' });
      }
    }
    return out;
  }

  /** Ob irgendeine Zeile Unteraufgaben hat — nur dann braucht die Liste die
   *  Spalte fuer das Gliederungs-Dreieck. */
  protected readonly hasOutline = computed(() => this.rows().some((row) => row.subCount > 0));
  protected readonly stats = this.todoService.stats;
  protected readonly filter = this.todoService.filter;
  protected readonly favoritesAllDone = this.todoService.favoritesAllDone;

  /**
   * Die Suche filtert nur, was die Lasche zeigt. Findet sie dort nichts,
   * stand vorher „No active todos at the moment" — als gäbe es keine, dabei
   * passte nur keine. Und die Laschen liegen während der Suche unter der
   * Leiste; der Weg zu „All" muss also hier stehen.
   */
  protected readonly isSearching = computed(
    () => this.todoService.searchTerm().trim() !== '' || this.todoService.searchToken() !== null,
  );

  protected searchEverywhere(): void {
    this.filter.set('all');
  }

  protected clearSearch(): void {
    this.todoService.searchTerm.set('');
    this.todoService.searchToken.set(null);
  }
  protected readonly labels = this.labelService.labels;
  protected readonly FolderIcon = Folder;

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly GripIcon = GripVertical;
  protected readonly StarIcon = Star;
  protected readonly ExpandIcon = ChevronsUpDown;
  protected readonly OptionsIcon = EllipsisVertical;
  protected readonly TrashIcon = Trash2;
    protected readonly PencilIcon = Pencil;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly ScheduleIcon = CalendarPlus;
  protected readonly SectionIcon = Rows3;
  protected readonly IndentIcon = ListIndentIncrease;
  protected readonly OutdentIcon = ListIndentDecrease;
  protected readonly AddStepIcon = ListPlus;
  protected readonly PlusIcon = Plus;
  protected readonly CalendarIcon = CalendarDays;
  protected readonly RepeatIcon = Repeat;
  protected readonly ArchiveIcon = Archive;
  protected readonly RestoreIcon = Undo2;
  protected readonly FromPlanIcon = FileText;
  protected readonly FocusIcon = Timer;

  /** Fokuszeit aus Flow, je Todo in Sekunden. */
  protected readonly focusTotals = inject(FocusSessionService).totals;
  protected readonly formatFocus = formatFocus;
  protected readonly ClearIcon = X;

  protected readonly tokenIcon = tokenIcon;
  protected readonly tokenDescription = tokenDescription;
  protected readonly tokenText = tokenText;
  protected readonly tokenClass = tokenClass;

  /**
   * Die Präfixe der Zeile, die gerade bearbeitet wird — als Chips vor dem Feld,
   * höchstens eine Priorität und eine Gliederung.
   *
   * Im Feld selbst steht nur der Text. Ein vorn getipptes „/should " wird
   * sofort zum Chip und ersetzt nur die Priorität, nicht die Gliederung.
   * Backspace ganz vorn nimmt den letzten Chip weg, ein Klick genau diesen.
   * Gespeichert wird beim Verlassen, wie bisher.
   */
  protected readonly editTokens = signal<TitleToken[]>([]);


  /** true, solange die erste Ladung Todos unterwegs ist. */
  protected readonly loading = this.todoService.loading;
  /** Platzhalterzeilen, damit @for etwas zu zaehlen hat. */
  protected readonly skeletonRows = [0, 1, 2];
  protected readonly folderListOpen = signal(false);
  /** Das Monatsblatt im Telefon-Menü; zu, bis man „Pick date" tippt. */
  protected readonly sheetCalendarOpen = signal(false);
  /** Das Menü nur mit dem Termin, geöffnet über die Datumszeile. */
  protected readonly sheetDateOnly = signal(false);

toggleFolderList(): void {
  this.folderListOpen.update(open => !open);
}

  protected readonly openMenuId =
    signal<string | null>(null);

  protected readonly openScheduleId =
    signal<string | null>(null);

  protected readonly openOptionsId =
    signal<string | null>(null);

  protected readonly completingTodoIds =
    signal<ReadonlySet<string>>(new Set());

  protected readonly leavingTodoIds =
    signal<ReadonlySet<string>>(new Set());

  protected readonly newTodoId =
    signal<string | null>(null);

  private readonly expandedIds =
    signal<ReadonlySet<string>>(new Set());

  /**
   * Hauptaufgaben, deren Unteraufgaben gerade eingeklappt sind.
   *
   * Nicht dasselbe wie expandedIds: dort geht es um langen Text in EINER
   * Zeile, hier um die Zeilen darunter.
   */
  private readonly collapsedIds =
    signal<ReadonlySet<string>>(readCollapsed());

    protected readonly editingId = signal<string | null>(null);

  protected readonly overlayPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ];
  /** Touch: dieselbe Haltezeit wie ueberall (hold-to-drag.ts). Maus: 200ms,
   *  damit ein Klick in die Zeile kein Ziehen beginnt. */
  protected readonly dragStartDelay = { touch: HOLD_TO_DRAG_MS, mouse: 200 };



  handleToggleTodo(todo: Todo): void {
    if (this.leavingTodoIds().has(todo.id)) {
      return;
    }

    if (todo.completed) {
      this.todoService.toggleTodo(todo.id);
      return;
    }

    // Was beim Abhaken mitgeht: die offenen Schritte einer Aufgabe. Jetzt
    // festgehalten, nicht nach der Animation — bis dahin könnte jemand
    // einen davon schon selbst abgehakt haben.
    const openSteps = this.todoService.stepsOf(todo.id).filter((step) => !step.completed);
    const head = taskLevel(todo.title) === 'sub' ? this.todoService.headOf(todo.id) : null;

    // Der Impuls im selben Frame wie das Bild, nicht danach.
    //
    // Haptik, die hinter dem Bild herläuft, fühlt sich nicht wie eine
    // Bestätigung an, sondern wie ein zweites Ereignis. Deshalb steht der
    // Aufruf vor dem Zustandswechsel und nicht in einem Timeout: der Haken
    // füllt sich im nächsten Frame, und bis dahin hat das Gerät gezuckt.
    tap();

    // Die Belohnung ebenso: Funke und Klang im Moment des Klicks, nicht
    // erst nach der Ausblende-Animation. Der Haken selbst folgt unten.
    this.rewards.reward(todo);

    this.updateIdSet(
      this.completingTodoIds,
      todo.id,
      true,
    );

    // Bleibt die Zeile nach dem Abhaken stehen (ein Schritt einer offenen
    // Aufgabe unter „Active", alles unter „All"), fährt sie nicht erst
    // hinaus, um dann wieder aufzutauchen.
    const stays = this.staysAfterDone(todo, head);
    if (!stays) {
      window.setTimeout(() => {
        this.updateIdSet(
          this.leavingTodoIds,
          todo.id,
          true,
        );
      }, 280);
    }

    window.setTimeout(() => {
      try {
        this.todoService.toggleTodo(todo.id);
        for (const step of openSteps) this.todoService.toggleTodo(step.id);
      } finally {
        this.clearTodoAnimationState(todo.id);
      }
      if (openSteps.length > 0) this.offerUndoSteps(todo, openSteps);
      else if (head) this.offerHeadCompletion(head);
    }, stays ? 320 : 540);
  }

  /** Ob eine Zeile nach dem Abhaken in der Liste bleibt. */
  private staysAfterDone(todo: Todo, head: Todo | null): boolean {
    const filter = this.filter();
    if (filter === 'all') return true;
    if (filter !== 'active') return false;
    // Unter „Active" bleibt ein Schritt stehen, solange in seiner Gruppe noch
    // etwas offen ist (openGroups im Service).
    if (!head) return false;
    if (!head.completed) return true;
    return this.todoService.stepsOf(head.id).some((s) => !s.completed && s.id !== todo.id);
  }

  /**
   * Eine Aufgabe abgehakt, deren Schritte noch offen waren: die gingen mit.
   * Das sagt eine Meldung, und Undo nimmt alles zurück — wer sich vertippt
   * hat, will nicht fünf Schritte einzeln wieder aufmachen.
   */
  private offerUndoSteps(todo: Todo, steps: Todo[]): void {
    const n = steps.length;
    this.toast.show(`Done, with ${n} open ${n === 1 ? 'step' : 'steps'}`, {
      actionLabel: 'Undo',
      durationMs: 6000,
      action: () => {
        for (const id of [todo.id, ...steps.map((s) => s.id)]) {
          if (this.todoService.todoById(id)?.completed) this.todoService.toggleTodo(id);
        }
      },
    });
  }

  /**
   * Der letzte offene Schritt ist erledigt, die Aufgabe selbst noch nicht:
   * anbieten, sie auch abzuhaken. Nicht von selbst — manchmal gehört zur
   * Aufgabe mehr als ihre Schritte, und das weiss nur, wer sie angelegt hat.
   */
  private offerHeadCompletion(head: Todo): void {
    const current = this.todoService.todoById(head.id);
    if (!current || current.completed) return;
    const steps = this.todoService.stepsOf(head.id);
    if (steps.length === 0 || steps.some((s) => !s.completed)) return;
    const title = stripPriorityPrefix(current.title).split('\n')[0].trim();
    this.toast.show(`All steps done: ${title}`, {
      actionLabel: 'Complete',
      durationMs: 6000,
      action: () => {
        const latest = this.todoService.todoById(head.id);
        if (latest && !latest.completed) this.handleToggleTodo(latest);
      },
    });
  }

  // ---- Schritte direkt unter der Aufgabe anlegen ----
  //
  // Vorher: Aufgabe anklicken (unsichtbar ausgewählt) und oben ins Feld
  // tippen. Jetzt steht unter jeder aufgeklappten Aufgabe „+ Add step", und
  // für eine Aufgabe ohne Schritte öffnet ihr Menü dieselbe Zeile.

  /** Unter welcher Aufgabe gerade ein Schritt eingetippt wird. */
  protected readonly stepInputFor = signal<string | null>(null);
  private readonly injector = inject(Injector);

  openStepInput(headId: string): void {
    if (this.isCollapsed(headId)) this.toggleSubtasks(headId);
    this.stepInputFor.set(headId);
    this.focusLater(`[data-step-for="${headId}"]`);
  }

  closeStepInput(): void {
    this.stepInputFor.set(null);
  }

  /** Enter legt an, das Feld bleibt offen für den nächsten Schritt. */
  addStep(headId: string, field: HTMLInputElement): void {
    const text = field.value.trim();
    if (!text) {
      this.closeStepInput();
      return;
    }
    this.todoService.addTodos([withTaskLevel(text, 'sub')], headId);
    field.value = '';
  }

  /** Leer verlassen schliesst; mit Text bleibt es stehen. */
  onStepBlur(field: HTMLInputElement): void {
    if (!field.value.trim()) this.closeStepInput();
  }

  // ---- Abschnitte ----
  //
  // Überschriften im Ordner: „Diese Woche", „Warten auf", „Später". Sie
  // klappen ein wie Hauptaufgaben (dieselbe Menge collapsedIds), haben ein
  // „+" zum Anlegen darin und lassen sich umbenennen und löschen. Gelöscht
  // wird nur die Überschrift; ihre Todos rutschen in den Abschnitt darüber.

  /** Unter welchem Abschnitt gerade ein neues Todo eingetippt wird. */
  protected readonly sectionInputFor = signal<string | null>(null);
  protected readonly renamingSectionId = signal<string | null>(null);
  protected readonly addingSection = signal(false);
  /** Im Telefon-Menü: die Liste der Abschnitte zum Verschieben. */
  protected readonly sectionListOpen = signal(false);

  /** Die Abschnitte in der Liste, für das Menü „Section". */
  protected readonly sectionsInList = computed(() =>
    this.rows()
      .filter((row) => row.isSection)
      .map((row) => ({ id: row.id, name: row.firstLine })),
  );

  protected sectionNameOf(id: string | null): string {
    if (id === null) return 'None';
    return this.sectionsInList().find((s) => s.id === id)?.name ?? 'None';
  }

  openSectionInput(sectionId: string): void {
    if (this.isCollapsed(sectionId)) this.toggleSubtasks(sectionId);
    this.sectionInputFor.set(sectionId);
    this.focusLater(`[data-section-input="${sectionId}"]`);
  }

  closeSectionInput(): void {
    this.sectionInputFor.set(null);
  }

  /** Enter legt ans Ende des Abschnitts an; das Feld bleibt offen. */
  addTodoToSection(sectionId: string, field: HTMLInputElement): void {
    const text = field.value.trim();
    if (!text) {
      this.closeSectionInput();
      return;
    }
    this.todoService.addTodos([text], null, null, sectionId);
    field.value = '';
  }

  onSectionInputBlur(field: HTMLInputElement): void {
    if (!field.value.trim()) this.closeSectionInput();
  }

  startRenameSection(id: string): void {
    this.renamingSectionId.set(id);
    this.focusLater(`[data-section-rename="${id}"]`, true);
  }

  commitRenameSection(row: TodoRow, field: HTMLInputElement): void {
    if (this.renamingSectionId() !== row.id) return;
    this.renamingSectionId.set(null);
    const name = field.value.trim();
    if (name && name !== row.firstLine) this.todoService.renameSection(row.id, name);
  }

  /** Nur die Überschrift geht; mit Undo, wie jedes Löschen. */
  deleteSection(row: TodoRow): void {
    this.todoService.removeTodo(row.id);
  }

  openAddSection(): void {
    this.addingSection.set(true);
    this.focusLater('.todo-add-section__input');
  }

  commitAddSection(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (name) this.todoService.addSection(name);
    field.value = '';
    this.addingSection.set(false);
  }

  moveRowToSection(row: TodoRow, sectionId: string | null): void {
    this.todoService.moveTodoToSection(row.id, sectionId);
  }

  private focusLater(selector: string, select = false): void {
    afterNextRender(
      () => {
        const el = this.host.nativeElement.querySelector<HTMLInputElement>(selector);
        el?.focus();
        if (select) el?.select();
      },
      { injector: this.injector },
    );
  }

  // ---- Gruppieren ----

  private readonly listView = inject(ListViewService);
  protected readonly grouping = this.listView.grouping;
  protected readonly sort = this.listView.sort;
  protected readonly showIcons = this.listView.showIcons;
  /** Zugeklappte Fächer, nur für diese Sitzung. */
  protected readonly collapsedBuckets = signal<ReadonlySet<string>>(new Set());

  // ---- Vorschläge ----

  protected readonly showSuggestions = computed(
    () => this.listView.showSuggestions() && (this.filter() === 'active' || this.filter() === 'all') && !this.isSearching(),
  );
  private readonly suggestionSeed = signal(0);

  protected readonly suggestions = computed(() =>
    suggestTasks(this.todoService.scopedWithArchive(), { seed: this.suggestionSeed(), limit: 4 }).map((s) => ({
      ...s,
      icon: taskIcon(s.text),
      durationText: s.minutes ? formatDuration(s.minutes) : '',
    })),
  );

  refreshSuggestions(): void {
    this.suggestionSeed.update((n) => n + 1);
  }

  addSuggestion(s: Suggestion): void {
    this.todoService.addTodo((s.minutes ? durationPrefix(s.minutes) : '') + s.text);
    tap();
  }

  /** Ziehen nur, wo die gezeigte Reihenfolge die gespeicherte ist. */
  protected readonly canDrag = computed(() => this.grouping() === 'manual' && this.sort() === 'manual');

  setGrouping(value: Grouping): void {
    this.listView.setGrouping(value);
  }

  // ---- Neues Todo direkt in einem Fach ----

  /** Das Fach, in dem gerade eine Eingabe offen ist (Fach-id ohne Modus). */
  protected readonly bucketInputFor = signal<string | null>(null);

  openBucketInput(id: string): void {
    const full = `${this.grouping()}:${id}`;
    if (this.collapsedBuckets().has(full)) this.toggleBucket(full);
    this.bucketInputFor.set(id);
    this.focusLater(`[data-bucket-input="${CSS.escape(id)}"]`);
  }

  addTodoToBucket(id: string, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) {
      this.bucketInputFor.set(null);
      return;
    }
    const mode = this.grouping();
    this.todoService.addTodo(bucketPrefix(mode, id) + text, bucketDate(mode, id));
    input.value = '';
  }

  onBucketInputBlur(input: HTMLInputElement): void {
    if (!input.value.trim()) this.bucketInputFor.set(null);
  }

  toggleBucket(id: string): void {
    this.collapsedBuckets.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // ---- Ein- und Ausrücken ----

  indent(row: TodoRow): void {
    if (row.indentTarget) this.todoService.makeStepOf(row.id, row.indentTarget.id);
  }

  outdent(row: TodoRow): void {
    this.todoService.makeOwnTask(row.id);
  }

  /**
   * Tab beim Bearbeiten rückt ein, Shift+Tab aus — wie in jedem Gliederungs-
   * editor. Erst wird der Text gesichert, dann bleibt man im Feld. Nicht
   * bearbeitet ist Tab, was es immer ist: der Sprung zum nächsten Element.
   */
  onEditTab(event: Event, row: TodoRow, textarea: HTMLTextAreaElement, out: boolean): void {
    if (this.editingId() !== row.id) return;
    if (out ? !row.canOutdent : !row.indentTarget) return;
    event.preventDefault();
    this.finishEditing(row.todo, textarea);
    if (out) this.outdent(row);
    else this.indent(row);
    afterNextRender(
      () => {
        const todo = this.todoService.todoById(row.id);
        if (todo) this.startEditing(todo, textarea);
      },
      { injector: this.injector },
    );
  }

  // ---- Seitlich ziehen ----
  //
  // Beim Ziehen sagt der seitliche Versatz, wohin die Zeile gehört: ein
  // Stück nach rechts macht sie zum Schritt der Aufgabe darüber, nach links
  // wieder zur eigenen Aufgabe. Der Platzhalter rückt mit, damit man es vor
  // dem Loslassen sieht.

  /** 1 = wird Schritt, -1 = wird eigene Aufgabe, 0 = bleibt, was sie ist. */
  protected readonly dragIndent = signal<-1 | 0 | 1>(0);

  onDragMoved(event: CdkDragMove<unknown>, row: TodoRow): void {
    const dx = event.distance.x;
    let next: -1 | 0 | 1 = 0;
    if (dx > 36 && row.level !== 'sub' && row.subCount === 0 && !row.isSection) next = 1;
    else if (dx < -36 && row.level === 'sub') next = -1;
    if (next !== this.dragIndent()) this.dragIndent.set(next);
  }

  private clearTodoAnimationState(todoId: string): void {
    this.updateIdSet(
      this.completingTodoIds,
      todoId,
      false,
    );

    this.updateIdSet(
      this.leavingTodoIds,
      todoId,
      false,
    );
  }

  /**
   * Versatz einer Zeile beim Einlaufen, gedeckelt.
   *
   * Ungedeckelt wuerde die letzte von 200 Zeilen erst nach viereinhalb
   * Sekunden erscheinen. Nach ein paar Zeilen ist der Effekt ohnehin gelesen.
   *
   * Der Deckel lag zuerst bei acht: mit 22ms Schritt und 380ms Dauer war die
   * letzte Zeile erst nach gut einer halben Sekunde da. Waehrend der
   * Verzoegerung steht eine Zeile auf Deckkraft 0, und wer schnell zwischen
   * den Filtern klickt, sieht sie blinken statt einlaufen. Fuenf Schritte
   * reichen fuer den Eindruck und bleiben unter Apples Richtwert von 0,3-0,4s.
   */
  stagger(index: number): number {
    return Math.min(index, 5);
  }

  // ---- Ziel fuer neue Unteraufgaben ----
  //
  // „/sub" haengt einen Schritt an die Zeile darueber. Unten im Eingabefeld
  // ist das die letzte Aufgabe der Liste — fast nie die, um die es geht. Ein
  // Klick auf die Hauptaufgabe sagt stattdessen, wohin.

  protected readonly activeParentId = this.todoService.activeParentId;

  /**
   * Klick auf die Zeile waehlt sie als Ziel; ein zweiter Klick loest wieder.
   *
   * Auf eine Unteraufgabe geklickt ist IHRE Hauptaufgabe gemeint: von dort aus
   * will man den naechsten Schritt danebenlegen, nicht darunter.
   */
  /** Waehrend und unmittelbar nach dem Ziehen ist ein Klick kein Klick. */
  private dragging = false;

  onDragStarted(): void {
    this.dragging = true;
  }

  onDragEnded(): void {
    // Das click-Ereignis kommt nach dem Loslassen noch hinterher; erst danach
    // darf wieder ausgewaehlt werden, sonst waehlt jedes Verschieben mit aus.
    setTimeout(() => (this.dragging = false));
  }

  selectParent(row: TodoRow, event: MouseEvent): void {
    if (this.dragging) return;

    // Sterne, Haken, Menues und das Textfeld haben ihre eigene Bedeutung.
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="listbox"]')) return;

    const id = row.level === 'sub' ? row.parentId : row.id;
    if (!id) return;

    if (this.activeParentId() === id) {
      this.todoService.selectParent(null);
      return;
    }

    this.todoService.selectParent(id);
    // Zugeklappt waere der neue Schritt unsichtbar angelegt. Wer eine Aufgabe
    // als Ziel waehlt, will sehen, was schon darunter steht.
    if (this.isCollapsed(id)) this.toggleSubtasks(id);
  }

  // ---- Unteraufgaben ein- und ausklappen ----

  isCollapsed(id: string): boolean {
    return this.collapsedIds().has(id);
  }

  toggleSubtasks(id: string): void {
    this.collapsedIds.update((current) => {
      const updated = new Set(current);
      if (!updated.delete(id)) updated.add(id);
      return updated;
    });

    // Beim Sichern ausduennen: eine Hauptaufgabe kann geloescht, erledigt oder
    // zur gewoehnlichen Aufgabe geworden sein. Ohne das waechst die Liste
    // still vor sich hin und haelt IDs fest, die es nicht mehr gibt.
    const alive = new Set(this.rows().filter((r) => r.subCount > 0 || r.isSection).map((r) => r.id));
    const keep = [...this.collapsedIds()].filter((known) => alive.has(known));
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(keep));
    } catch {
      // Privater Modus, volles Kontingent: das Einklappen soll trotzdem gehen.
    }
  }

  /** Was beim Bearbeiten im Feld steht — der Text ohne Präfix. */
  private editText(todo: Todo): string {
    return splitTitle(todo.title).text;
  }

  startEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    this.editTokens.set(tokensOf(todo.title));
    this.editingId.set(todo.id);
    if (this.clampedIds().has(todo.id) && !this.isExpanded(todo.id)) {
      this.toggleExpanded(todo.id, textarea);
    }
    requestAnimationFrame(() => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  /**
   * Beim Verlassen des Felds speichern; leerer Text wird verworfen.
   *
   * Das Feld zeigt den Text ohne Präfix. Gespeichert wird mit dem Präfix des
   * Chips — sonst haette jede Bearbeitung die Prioritaet verloren oder eine
   * Unteraufgabe aus ihrer Hauptaufgabe herausgeloest, und zwar unsichtbar.
   */
  finishEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    if (this.editingId() !== todo.id) return;
    this.editingId.set(null);
    const typed = textarea.value.trim();
    const title = joinTitle(this.editTokens(), typed);
    if (typed && title !== todo.title) {
      this.renameTodo(todo.id, title);
    } else {
      textarea.value = this.editText(todo);
    }
  }

  /** Escape: Änderung verwerfen. */
  cancelEditing(todo: Todo, textarea: HTMLTextAreaElement): void {
    textarea.value = this.editText(todo);
    this.editTokens.set(tokensOf(todo.title));
    this.editingId.set(null);
    textarea.blur();
  }

  /** Beim Tippen: ein fertiges Präfix ganz vorn wird zum Chip. */
  onEditInput(textarea: HTMLTextAreaElement): void {
    const { tokens, text } = splitTitle(textarea.value);
    if (tokens.length === 0) return;

    this.editTokens.update((current) => tokens.reduce(withToken, current));
    textarea.value = text;
    // Der Cursor stand hinter dem getippten Leerzeichen, also ganz vorn im
    // eigentlichen Text. Dort bleibt er.
    textarea.setSelectionRange(0, 0);
  }

  /** Backspace ganz vorn nimmt den letzten Chip weg, wie jedes Zeichen links vom Cursor. */
  onEditBackspace(event: Event, textarea: HTMLTextAreaElement): void {
    if (this.editTokens().length === 0) return;
    if (textarea.selectionStart !== 0 || textarea.selectionEnd !== 0) return;

    event.preventDefault();
    this.editTokens.update((current) => current.slice(0, -1));
  }

  clearEditToken(token: TitleToken, textarea: HTMLTextAreaElement): void {
    this.editTokens.update((current) => current.filter((t) => t !== token));
    textarea.focus();
  }

  private updateIdSet(
    target:
      | typeof this.completingTodoIds
      | typeof this.leavingTodoIds,
    todoId: string,
    add: boolean,
  ): void {
    target.update((current) => {
      const updated = new Set(current);

      if (add) {
        updated.add(todoId);
      } else {
        updated.delete(todoId);
      }

      return updated;
    });
  }

 toggleOptionsMenu(id: string): void {
  this.openOptionsId.update(current => current === id ? null : id);
  this.folderListOpen.set(false);
  this.sheetCalendarOpen.set(false);
  this.sheetDateOnly.set(false);
  this.sectionListOpen.set(false);
}

closeOptionsMenu(): void {
  this.openOptionsId.set(null);
  this.folderListOpen.set(false);
  this.sheetCalendarOpen.set(false);
  this.sheetDateOnly.set(false);
}

/** Von der Datumszeile aus: dasselbe Blatt, nur der Termin, Kalender offen. */
openDateSheet(id: string): void {
  this.folderListOpen.set(false);
  this.sheetCalendarOpen.set(true);
  this.sheetDateOnly.set(true);
  this.openOptionsId.set(id);
}

  toggleMenu(id: string): void {
    this.openMenuId.update(
      current => current === id ? null : id,
    );
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  // ---- Termin ----
  // Ein Todo trug schon immer ein Datum, nur gesetzt wurde es allein per Ziehen
  // in der Wochenansicht. Die Liste zeigt es jetzt und vergibt es auch.

  /** Heute, morgen, Wochenende, nächste Woche — jeweils frisch gerechnet. */
  scheduleChoices() {
    return scheduleOptions();
  }

  /** Kurze Beschriftung des Termins, z.B. „Tomorrow" oder „Sep 24". */
  scheduleText(todo: Todo): string {
    return todo.scheduledDate === null ? '' : scheduleLabel(todo.scheduledDate);
  }

  /** Termin verstrichen und noch offen — nur dann ist die Warnfarbe ehrlich. */
  isLate(todo: Todo): boolean {
    return !todo.completed && isOverdueDate(todo.scheduledDate);
  }

  /** Ein Termin, den keine Schnellwahl trifft, etwa in drei Wochen. */
  isCustomDate(todo: Todo): boolean {
    const date = todo.scheduledDate;
    return date !== null && !this.scheduleChoices().some((choice) => choice.iso === date);
  }

  /**
   * Woran das Termin-Menü hängt: am Chip, wenn ein Termin steht, sonst am
   * Kalender in der Hover-Leiste. Zwei Knöpfe, ein Menü.
   */
  protected readonly scheduleOrigin = signal<HTMLElement>(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);

  toggleScheduleMenu(id: string, event: Event): void {
    this.scheduleOrigin.set(event.currentTarget as HTMLElement);
    this.openScheduleId.update(current => current === id ? null : id);
  }

  closeScheduleMenu(): void {
    this.openScheduleId.set(null);
  }

  schedule(id: string, iso: string | null): void {
    this.todoService.scheduleTodo(id, iso);
    this.closeScheduleMenu();
  }

  /**
   * Aufgeklappt trennt die Karte den Titel von den Unterpunkten: die erste
   * Zeile bleibt in der Kopfzeile neben Checkbox und Bedienelementen, alles
   * danach steht eingerueckt darunter. Zusammengeklappt bleibt der ganze Text
   * stehen und wird per CSS auf zwei Zeilen begrenzt.
   */
  firstLine(title: string): string {
    return stripPriorityPrefix(title).split('\n')[0].trim();
  }

  /** Alles nach der ersten Zeile; leer, wenn der Text einzeilig ist. */
  detailLines(title: string): string {
    const [, ...rest] = stripPriorityPrefix(title).split('\n');
    return rest.join('\n').trim();
  }

  /**
   * Nur im aufgeklappten Zustand und ausserhalb des Bearbeitens aufteilen.
   *
   * Nimmt die fertige Zeile statt des Todos: ob es ueberhaupt etwas unter der
   * ersten Zeile gibt, steht dort schon. Vorher zerlegte diese Methode den
   * Titel bei jedem Aufruf neu, und die Vorlage ruft sie dreimal je Zeile.
   */
  showsDetail(row: TodoRow): boolean {
    return (
      row.hasDetail &&
      this.isExpanded(row.id) &&
      this.editingId() !== row.id
    );
  }

  /**
   * Zeilen, deren Text zugeklappt nicht in zwei Zeilen passt — gemessen von
   * Autosize. Nur sie bekommen den Auslauf am unteren Rand und den Knopf zum
   * Aufklappen. Vorher entschied die Zeichenzahl (über 40): auch ein Titel,
   * der vollständig in zwei Zeilen stand, lief unten aus, als ginge er
   * weiter.
   */
  protected readonly clampedIds = signal<ReadonlySet<string>>(new Set());

  protected setClamped(id: string, clamped: boolean): void {
    this.clampedIds.update((current) => {
      if (current.has(id) === clamped) return current;
      const next = new Set(current);
      if (clamped) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(
    id: string,
    textarea?: HTMLTextAreaElement,
  ): void {
    const expanding = !this.isExpanded(id);

    this.expandedIds.update((current) => {
      const updated = new Set(current);

      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }

      return updated;
    });

    if (expanding && textarea) {
      requestAnimationFrame(() => {
        textarea.style.height = 'auto';
        textarea.style.height =
          `${textarea.scrollHeight}px`;
      });
    }
  }

  /** Label an-/abwählen — Menü bleibt offen (Mehrfachauswahl). */
  toggleLabel(id: string, labelId: string): void {
    this.todoService.toggleLabel(id, labelId);
  }

  // ---- Wiederholung ----
  //
  // Vier Angebote statt eines freien Zahlenfelds: taeglich, woechentlich,
  // monatlich decken praktisch alles ab, was man von Hand pflegt. Wer "alle
  // drei Tage" braucht, soll es bekommen, aber nicht auf Kosten dessen, dass
  // die haeufigen Faelle einen Klick brauchen.
  protected readonly repeatChoices: {
    key: string;
    label: string;
    rule: RepeatRule | null;
  }[] = [
    { key: 'none', label: 'Never', rule: null },
    { key: 'day', label: 'Daily', rule: { every: 1, unit: 'day', from: 'due' } },
    { key: 'week', label: 'Weekly', rule: { every: 1, unit: 'week', from: 'due' } },
    { key: 'month', label: 'Monthly', rule: { every: 1, unit: 'month', from: 'due' } },
  ];

  /**
   * Ist dieses Angebot das eingestellte?
   *
   * Vergleicht Anzahl und Einheit, NICHT den Bezugspunkt: „woechentlich" und
   * „woechentlich ab Erledigung" sind derselbe Rhythmus, und der Umschalter
   * darunter regelt den Rest. Sonst fiele die Auswahl heraus, sobald man ihn
   * umlegt.
   */
  repeatMatches(todo: Todo, rule: RepeatRule | null): boolean {
    if (rule === null) return todo.repeat === null;
    return (
      todo.repeat !== null &&
      todo.repeat.every === rule.every &&
      todo.repeat.unit === rule.unit
    );
  }

  setRepeat(todo: Todo, rule: RepeatRule | null): void {
    // Den Bezugspunkt behalten, wenn schon einer gewaehlt war: wer ihn einmal
    // auf „ab Erledigung" gestellt hat, meint das auch beim Wechsel von
    // woechentlich auf monatlich.
    const from = todo.repeat?.from ?? 'due';
    this.todoService.setRepeat(todo.id, rule ? { ...rule, from } : null);
  }

  toggleRepeatFrom(todo: Todo): void {
    if (!todo.repeat) return;
    this.todoService.setRepeat(todo.id, {
      ...todo.repeat,
      from: todo.repeat.from === 'completion' ? 'due' : 'completion',
    });
  }

  /** Kurzform fuer die Zeile, etwa „weekly". */
  repeatLabel(rule: RepeatRule): string {
    const unit = rule.every === 1 ? rule.unit : `${rule.every} ${rule.unit}s`;
    return rule.every === 1 ? `${unit}ly`.replace('dayly', 'daily') : `every ${unit}`;
  }

  // ---- Archiv ----

  protected readonly archivableCount = this.todoService.archivableCount;
  protected readonly showArchived = this.todoService.showArchived;

  archiveCompleted(): void {
    this.todoService.archiveCompleted();
  }

  toggleArchiveView(): void {
    this.todoService.toggleArchiveView();
  }

  unarchive(id: string): void {
    this.todoService.unarchiveTodo(id);
  }

  /** Alle Labels eines Todos entfernen. */
  clearLabels(id: string): void {
    this.todoService.setLabels(id, []);
    this.closeMenu();
  }

  /** Primäres Label (erste ID) — bestimmt Rand-/Punktfarbe. */
  primaryLabelId(labelIds: string[]): string | null {
    return labelIds[0] ?? null;
  }

  private primaryLabel(labelIds: string[]) {
    const id = labelIds[0];
    return this.labelService.labelById(id);
  }

  labelIcon(label: Label){
    return folderIcon(label.icon);
  }

  labelTitleClass(label: Label): string {
    return folderColorClass(label.color, 'text');
  }

  /**
   * Die Farb-Identität der Zeile — als Punkt, nicht mehr als Glaskachel.
   *
   * Hier stand ein 28 Pixel grosses Quadrat mit Farbverlauf, Innenrand und
   * dem Symbol des Ordners darin. In jeder Zeile. Bei zwanzig Aufgaben waren
   * das zwanzig Verläufe, und das Symbol wiederholte in jeder Zeile, was
   * der Ordnername oben schon sagt.
   *
   * Was die Kachel wirklich leistete, war eine Farbe. Die trägt ein Punkt
   * genauso — und er fällt nicht mehr ins Auge als der Titel daneben.
   */
  folderDotClass(labelIds: string[]): string {
    return folderColorClass(this.primaryLabel(labelIds)?.color, 'dot');
  }

  /** Die Tönung des Kreises um das Bild: Ordnerfarbe, gedämpft. */
  private iconClass(labelIds: string[]): string {
    return folderColorClass(this.primaryLabel(labelIds)?.color, 'iconBox');
  }

  private static readonly WHEN_ICON: Record<TimeOfDay, LucideIconData> = {
    morning: Sunrise,
    afternoon: Sun,
    evening: Moon,
  };

  private static readonly WHEN_LABEL: Record<TimeOfDay, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
  };

  protected whenIcon(when: TimeOfDay): LucideIconData {
    return TodoList.WHEN_ICON[when];
  }

  protected whenLabel(when: TimeOfDay): string {
    return TodoList.WHEN_LABEL[when];
  }

  // ---- Tageszeit und Dauer ----

  protected readonly timeChoices: readonly { value: TimeOfDay | null; label: string }[] = [
    { value: null, label: 'Anytime' },
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ];

  protected readonly durationChoices: readonly (number | null)[] = [null, 5, 15, 30, 45, 60, 90];

  protected whenOf(todo: Todo): TimeOfDay | null {
    return timeOfDay(todo.title);
  }

  protected minutesOf(todo: Todo): number | null {
    return durationOf(todo.title);
  }

  protected formatDurationText(minutes: number): string {
    return formatDuration(minutes);
  }

  protected setWhen(todo: Todo, when: TimeOfDay | null): void {
    const title = setTimeOfDay(todo.title, when);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  protected setMinutes(todo: Todo, minutes: number | null): void {
    const title = setDuration(todo.title, minutes);
    if (title !== todo.title) this.todoService.renameTodo(todo.id, title);
  }

  /**
   * Der Termin in der Meta-Zeile: am Rechner das Kalenderblatt neben der
   * Zeile, auf dem Telefon das Blatt von unten.
   */
  protected openDate(id: string, event: Event): void {
    if (window.matchMedia('(min-width: 640px)').matches) this.toggleScheduleMenu(id, event);
    else this.openDateSheet(id);
  }

  /** Der Name des primären Ordners, für den Tooltip am Punkt. */
  folderDotTitle(labelIds: string[]): string {
    const label = this.primaryLabel(labelIds);
    return label ? label.name : 'No folder';
  }

  isLabelActive(labelIds: string[], labelId: string): boolean {
    return labelIds.includes(labelId);
  }

  labelName(labelId: string | null): string {
    if (labelId === null) {
      return 'No category';
    }

    return this.labelService.labelById(labelId)?.name ?? 'No category';
  }

  /** Namen aller Labels als Tooltip-Text (Punkte in der Zeile zeigen keine Namen). */
  labelTitle(labelIds: string[]): string {
    if (labelIds.length === 0) return 'No labels';
    return labelIds.map(id => this.labelName(id)).join(', ');
  }

  dotClass(labelId: string | null): string {
    if (labelId === null) {
      return 'text-zinc-400';
    }

    return folderColorClass(this.labelService.labelById(labelId)?.color, 'dot');
  }

  renameTodo(
    id: string,
    title: string,
  ): void {
    this.todoService.renameTodo(id, title);
  }

  removeTodos(id: string): void {
    this.todoService.removeTodo(id);
  }

  toggleTodo(id: string): void {
    this.todoService.toggleTodo(id);
  }

  toggleFavorite(id: string): void {
    this.todoService.toggleFavorite(id);
  }

  /**
   * Die Indizes des CDK zaehlen die SICHTBAREN Zeilen; zugeklappte
   * Unteraufgaben stehen nicht darin. Deshalb nur die beiden IDs weitergeben
   * und die neue Reihenfolge dort ausrechnen, wo die Gliederung bekannt ist.
   */
  drop(event: CdkDragDrop<unknown>): void {
    const shift = this.dragIndent();
    this.dragIndent.set(0);
    const visible = this.visibleRows();
    const moved = visible[event.previousIndex];
    const target = visible[event.currentIndex];
    if (!moved || !target) return;

    if (event.previousIndex !== event.currentIndex) {
      this.todoService.moveTo(moved.id, target.id);
    }

    // Erst an den neuen Platz, dann die Stufe: was „darüber" ist, entscheidet
    // die Liste nach dem Zug.
    if (shift === 1) {
      const rows = this.visibleRows();
      const at = rows.findIndex((r) => r.id === moved.id);
      const above = at > 0 ? rows[at - 1] : null;
      if (above && !above.isSection) {
        this.todoService.makeStepOf(moved.id, above.parentId ?? above.id, true);
      }
    } else if (shift === -1) {
      this.todoService.makeOwnTask(moved.id);
    }
  }

}