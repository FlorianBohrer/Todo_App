import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../../environments/enviroment';
import { RepeatRule, Todo } from '../model/todo.model';
import { LabelService } from './label.service';
import { ToastService } from '../../shared/toast.service';
import { titlePriority } from '../shared/title-priority';

export type Filter = 'all' | 'active' | 'completed'| 'favorites';

/**
 * Die drei Wiederholungsspalten zu einer Regel zusammenziehen.
 *
 * Alle drei zusammen oder keine: eine halbe Regel (etwa "alle 2" ohne Einheit)
 * ist keine, und sie soll auch nicht als eine angezeigt werden.
 */
function toRepeat(dto: {
  repeatEvery?: number | null;
  repeatUnit?: string | null;
  repeatFrom?: string | null;
}): RepeatRule | null {
  const every = dto.repeatEvery ?? null;
  const unit = dto.repeatUnit ?? null;
  const from = dto.repeatFrom ?? null;

  if (every === null || every < 1) return null;
  if (unit !== 'day' && unit !== 'week' && unit !== 'month') return null;
  if (from !== 'due' && from !== 'completion') return null;

  return { every, unit, from };
}


export interface Stats {
  total: number;
  active: number;
  completed: number;
}

// So liefert das Backend ein Todo (zusätzliche Felder ignorieren wir).
interface TodoDto {
  id: string;
  title: string;
  completed: boolean;
  isFavorite: boolean;
  categoryId: string | null;   // primäres Label (Farb-Fallback)
  categoryIds: string[];       // alle Labels (n:m)
  createdAt: string;
  scheduledDate: string | null;
  // Ein Server ohne die Migration liefert diese Felder gar nicht. Alle
  // optional, damit die App dann weiterlaeuft statt auf undefined zu rechnen.
  archivedAt?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: string | null;
  repeatFrom?: string | null;
  planId?: string | null;
}

interface TodoListResponse {
  todo: TodoDto[];
  total: number;
}

// Schlüssel der alten, rein lokalen Speicherung (vor der Server-Anbindung).
const LEGACY_TODO_KEY = 'todos';

/** Zuletzt gewählte Ansicht — überlebt den Reload. */
const VIEW_KEY = 'todo.view';

export type View = 'list' | 'week' | 'plans';

function storedView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === 'week' || value === 'plans' ? value : 'list';
  } catch {
    // Privater Modus / blockierte Site-Daten: dann eben die Standardansicht.
    return 'list';
  }
}

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly labelService = inject(LabelService);
  private readonly apiUrl = `${environment.apiUrl}/todo`;

  private readonly todos = signal<Todo[]>([]);

  /**
   * Alle Todos, ungefiltert. Die Wochenansicht sortiert sie selbst in Tage —
   * einmal durchlaufen ist billiger, als sieben Mal die ganze Liste zu filtern.
   */
  readonly allTodos = this.todos.asReadonly();

  readonly filter = signal<Filter>('all');
   readonly searchTerm = signal('');

  /**
   * Alle Todos des aktiven Folders, ohne Status- und Suchfilter. Das ist der
   * Ausschnitt, über den Kopfzeile und Statistik sprechen — und über den die
   * Priorisierung sprechen muss, damit beide dasselbe meinen.
   */
  readonly scopedTodos = computed(() => this.todosInCategory());

  private readonly todosInCategory = computed(() => {
    const labelId = this.labelService.activeLabelId();
    const items = this.todos();
    return labelId === null ? items : items.filter(i => i.labelIds.includes(labelId));
  });

  /**
   * Im aktuellen Ausschnitt gibt es Favoriten, aber alle sind erledigt.
   *
   * Nur für die leere Liste unter "Favorites": ohne diese Unterscheidung
   * stünde dort "No favorites yet, tap the star" — ausgerechnet dann, wenn man
   * gerade den letzten abgehakt hat. Man suchte einen Stern, den man längst
   * gesetzt hat, statt zu lesen, dass man fertig ist.
   */
  readonly favoritesAllDone = computed(() => {
    const favorites = this.todosInCategory().filter((i) => i.isFavorite);
    return favorites.length > 0 && favorites.every((i) => i.completed);
  });

  readonly filteredTodos = computed(() => {
    const f = this.filter();
    let items = this.todosInCategory();

    // Status-Filter
    //
    // "Favorites" zeigt nur die OFFENEN Favoriten. Ein Favorit ist etwas, das
    // man im Blick behalten will — erledigt ist er das nicht mehr, und
    // abgehakte Zeilen verdrängten sonst genau die, derentwegen man den Filter
    // überhaupt anklickt. Wer die erledigten sehen will, hat dafür "Done".
    //
    // Die Kachel oben zählt weiter alle (19 von 22): sie zeigt den
    // Fortschritt, die Liste das, was noch aussteht.
    if (f === 'active')    items = items.filter(i => !i.completed);
    if (f === 'completed') items = items.filter(i => i.completed);
    if (f === 'favorites') items = items.filter(i => i.isFavorite && !i.completed);

        // Titel-Suche (case-insensitive)
    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      items = items.filter(i => i.title.toLowerCase().includes(term));
    }

    // Priorität per Titel-Präfix: /must-have zuerst, /could-have danach.
    // Stabile Sortierung -> Reihenfolge innerhalb jeder Gruppe bleibt erhalten.
    items = [...items].sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

    return items;
  });

  readonly stats = computed(() => {
    const items = this.todosInCategory();
    return {
      total: items.length,
      active: items.filter(item => !item.completed).length,
      completed: items.filter(item => item.completed).length,
    };
  });

  
  progressFor(labelId: string): { total: number; completed: number; percent: number } {
    const items = this.todos().filter(t => t.labelIds.includes(labelId));
    const completed = items.filter(t => t.completed).length;
    const total = items.length;
    return {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }

 
  readonly favoriteProgress = computed(() => {
    const items = this.todos().filter(t => t.isFavorite);
    const completed = items.filter(t => t.completed).length;
    const total = items.length;
    return {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  });

  private readonly clerk = inject(ClerkService);
  private readonly toast = inject(ToastService);

  /**
   * true während des initialen Ladens nach dem Login.
   *
   * Startet bewusst auf true: zwischen Appstart und der ersten Clerk-Antwort
   * läge sonst ein Moment mit leerer Liste — also der Satz „No todos yet",
   * bevor überhaupt jemand gefragt hat. Die Liste erscheint erst mit einem
   * angemeldeten Nutzer, dieser Zustand kann also nicht hängen bleiben.
   */
  readonly loading = signal(true);

  constructor() {
    // Die Ansicht merken. Wer in der Woche plant, will nach einem Reload nicht
    // wieder in der Liste landen.
    effect(() => {
      const view = this.view();
      try {
        localStorage.setItem(VIEW_KEY, view);
      } catch {
        /* Speichern ist ein Komfort, kein Muss. */
      }
    });

    // Todos erst laden, wenn ein Nutzer eingeloggt ist. Bei logout/userwechsel
    // den lokalen zustand leeren, damit keine fremden todos stehen bleiben.
    // Nach dem ersten laden werden evtl. vorhandene alt-daten aus dem
    // localStorage einmalig übernommen.
    this.clerk.user$
      .pipe(
        map((user) => user?.id ?? null),
        distinctUntilChanged(),
      )
      .subscribe((userId) => {
        if (!userId) {
          this.todos.set([]);
          return;
        }
        this.loading.set(true);
        this.http.get<TodoListResponse>(this.apiUrl).subscribe({
          next: (res) => {
            this.todos.set(res.todo.map((t) => this.toTodo(t)));
            this.loading.set(false);
            this.importLegacyTodos();
          },
          error: (err) => {
            console.error('Todos laden fehlgeschlagen', err);
            this.loading.set(false);
            this.toast.error('Could not load todos. Please reload the page');
          },
        });
      });
  }

  // ---- Laden ----
  private loadTodos() {
    // Das Archiv kommt nur mit, wenn man es sehen will. Der Server laesst es
    // sonst gar nicht erst durch, und damit rechnen alle abgeleiteten Werte
    // von selbst ohne die weggelegten Zeilen.
    const url = this.showArchived()
      ? `${this.apiUrl}?archived=true`
      : this.apiUrl;

    this.http.get<TodoListResponse>(url).subscribe({
      next: (res) => this.todos.set(res.todo.map((t) => this.toTodo(t))),
      error: (err) => console.error('Todos laden fehlgeschlagen', err),
    });
  }

  /** Zeigt die Liste gerade auch das Archiv? */
  readonly showArchived = signal(false);

  toggleArchiveView() {
    this.showArchived.update((on) => !on);
    this.loadTodos();
  }

  /** Ein weggelegtes Todo zurueck in die Liste holen. */
  unarchiveTodo(id: string) {
    this.http
      .patch<TodoDto>(`${this.apiUrl}/${id}/archive`, { archived: false })
      .subscribe({
        next: (dto) =>
          this.todos.update((items) =>
            items.map((item) => (item.id === id ? this.toTodo(dto) : item)),
          ),
        error: (err) => {
          console.error('Zurueckholen fehlgeschlagen', err);
          this.toast.error('Could not restore');
        },
      });
  }

  /**
   * Übernimmt einmalig die früher nur lokal (localStorage) gespeicherten Todos
   * ans Backend. Läuft sequenziell, damit die ursprüngliche Reihenfolge erhalten
   * bleibt. Danach wird der localStorage-Eintrag gelöscht, sodass die Übernahme
   * nicht erneut passiert.
   */
  private importLegacyTodos() {
    const raw = localStorage.getItem(LEGACY_TODO_KEY);
    if (!raw) return;

    // Altes localStorage-Format: einzelnes labelId, kein labelIds.
    let legacy: Array<{ title?: string; completed?: boolean; labelId?: string | null }>;
    try {
      legacy = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LEGACY_TODO_KEY);
      return;
    }
    if (!Array.isArray(legacy) || legacy.length === 0) {
      localStorage.removeItem(LEGACY_TODO_KEY);
      return;
    }

    // Alte labelId nur übernehmen, wenn sie zu einer aktuellen Server-Kategorie
    // passt — sonst landet das Todo ohne Kategorie (verhindert FK-Fehler).
    const validLabelIds = new Set(this.labelService.labels().map((l) => l.id));

    const importOne = (index: number) => {
      if (index >= legacy.length) {
        localStorage.removeItem(LEGACY_TODO_KEY);
        this.loadTodos();
        return;
      }

      const item = legacy[index];
      const title = (item.title ?? '').trim();
      if (!title) {
        importOne(index + 1);
        return;
      }

      const categoryId =
        item.labelId && validLabelIds.has(item.labelId) ? item.labelId : null;

      this.http.post<TodoDto>(this.apiUrl, { title, categoryId }).subscribe({
        next: (dto) => {
          // Erledigt-Status nachziehen (POST legt Todos immer als offen an).
          if (item.completed) {
            this.http
              .put<TodoDto>(`${this.apiUrl}/${dto.id}`, { completed: true })
              .subscribe({
                next: () => importOne(index + 1),
                error: () => importOne(index + 1),
              });
          } else {
            importOne(index + 1);
          }
        },
        error: (err) => {
          console.error('Alt-Todo übernehmen fehlgeschlagen', err);
          importOne(index + 1);
        },
      });
    };

    importOne(0);
  }


  private toTodo(dto: TodoDto): Todo {
  return {
    id: dto.id,
    title: dto.title,
    completed: dto.completed,
    isFavorite: dto.isFavorite ?? false,
    labelIds: dto.categoryIds ?? (dto.categoryId ? [dto.categoryId] : []),
    createdAt: new Date(dto.createdAt),
    scheduledDate: dto.scheduledDate ?? null,
    archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
    repeat: toRepeat(dto),
    planId: dto.planId ?? null,
  };
}

  // ---- Wochenansicht ----
  /** Liste vs. Woche vs. Pläne. Startet dort, wo man zuletzt war. */
  readonly view = signal<View>(storedView());

  /** Mehrere Todos auf denselben Tag umplanen. */
  rescheduleAll(ids: string[], scheduledDate: string | null) {
    for (const id of ids) this.scheduleTodo(id, scheduledDate);
  }

  /** Todo einem Tag zuordnen ('YYYY-MM-DD') oder in den Backlog zurück (null). */
  scheduleTodo(id: string, scheduledDate: string | null) {
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, scheduledDate } : item),
    );
    this.updateOnServer(id, { scheduledDate });
  }

  /** Todos eines Tags ('YYYY-MM-DD'). null = ungeplante (Backlog). */
  todosForDate(date: string | null) {
    return this.todos().filter(t => t.scheduledDate === date);
  }

toggleFavorite(id: string) {
  const current = this.todos().find(todo => todo.id === id);
  if (!current) return;

  const isFavorite = !current.isFavorite;

  this.todos.update(items =>
    items.map(item =>
      item.id === id ? { ...item, isFavorite } : item
    ),
  );

  this.updateOnServer(id, { isFavorite });
}

  // ---- Schreiben ----
  // Änderungen werden sofort lokal angezeigt (optimistic update) und ans
  // Backend geschickt. Schlägt der Request fehl, laden wir den Serverstand neu.
  addTodo(title: string, scheduledDate: string | null = null) {
    const t = title.trim();
    if (t === '') return;
    this.http
      .post<TodoDto>(this.apiUrl, {
        title: t,
        categoryId: this.labelService.activeLabelId(), // ← aktuelle Auswahl
        scheduledDate,                                  // Woche: direkt auf einen Tag
      })
      .subscribe({
        next: (dto) => this.todos.update(items => [...items, this.toTodo(dto)]),
        error: (err) => {
          console.error('Todo anlegen fehlgeschlagen', err);
          this.toast.error('Could not create todo');
        },
      });

  }
  /**
   * Ein Todo aus einem Plan heraus anlegen.
   *
   * Gibt die neue ID an den Aufrufer zurück, damit der Checklisten-Eintrag im
   * Plan sie sich merken kann. Ab dann ist der Eintrag ein Verweis auf das
   * Todo, und das Todo ist die einzige Wahrheit über seinen Zustand — es gibt
   * keinen zweiten Haken, der auseinanderlaufen könnte.
   */
  addTodoFromPlan(title: string, planId: string): Promise<string | null> {
    const clean = title.trim();
    if (clean === '') return Promise.resolve(null);

    return new Promise((resolve) => {
      this.http
        .post<TodoDto>(this.apiUrl, {
          title: clean,
          categoryId: this.labelService.activeLabelId(),
          planId,
        })
        .subscribe({
          next: (dto) => {
            this.todos.update((items) => [...items, this.toTodo(dto)]);
            resolve(dto.id);
          },
          error: (err) => {
            console.error('Todo aus Plan anlegen fehlgeschlagen', err);
            this.toast.error('Could not create todo');
            resolve(null);
          },
        });
    });
  }

  /** Ein Todo in konstanter Zeit. null, wenn es keins (mehr) gibt. */
  private readonly todosById = computed(
    () => new Map(this.todos().map((todo) => [todo.id, todo])),
  );

  todoById(id: string | null | undefined): Todo | null {
    return id ? this.todosById().get(id) ?? null : null;
  }

  addTodos(titles: string[]) {
    const clean = titles.map((t) => t.trim()).filter((t) => t.length > 0);
    if (clean.length === 0) return;
    if (clean.length === 1) {
      this.addTodo(clean[0]);
      return;
    }

    const categoryId = this.labelService.activeLabelId();
    let hadError = false;

    const postNext = (index: number) => {
      if (index >= clean.length) {
        if (hadError) {
          this.toast.error('Could not create some todos');
        }
        return;
      }
      this.http
        .post<TodoDto>(this.apiUrl, { title: clean[index], categoryId })
        .subscribe({
          next: (dto) => {
            this.todos.update((items) => [...items, this.toTodo(dto)]);
            postNext(index + 1);
          },
          error: (err) => {
            console.error('Todo anlegen fehlgeschlagen', err);
            hadError = true;
            postNext(index + 1);
          },
        });
    };

    postNext(0);
  }

  renameTodo(id: string, title: string) {
    const t = title.trim();
    if (t === '') return;
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, title: t } : item),
    );
    this.updateOnServer(id, { title: t });
  }

  /** Ein Label an-/abwählen (Mehrfach-Zuweisung). Optimistisch + Server. */
  toggleLabel(id: string, labelId: string) {
    const current = this.todos().find(item => item.id === id);
    if (!current) return;

    const labelIds = current.labelIds.includes(labelId)
      ? current.labelIds.filter(l => l !== labelId)
      : [...current.labelIds, labelId];

    this.setLabels(id, labelIds);
  }

  /** Komplette Label-Menge eines Todos setzen. */
  setLabels(id: string, labelIds: string[]) {
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, labelIds } : item),
    );

    this.http
      .put<TodoDto>(`${this.apiUrl}/${id}/categories`, { categoryIds: labelIds })
      .subscribe({
        // Server sortiert die IDs (nach Folder-Position) — Antwort übernehmen.
        next: (dto) => this.todos.update(items =>
          items.map(item => item.id === id ? this.toTodo(dto) : item),
        ),
        error: (err) => {
          console.error('Labels speichern fehlgeschlagen', err);
          this.toast.error('Could not save labels');
          this.loadTodos();
        },
      });
  }

  clearLabel(labelId: string) {
    // Die DB räumt die Zuweisung beim Löschen der Kategorie selbst auf
    // (ON DELETE CASCADE) — hier nur den lokalen Zustand angleichen.
    this.todos.update(list =>
      list.map(t => t.labelIds.includes(labelId)
        ? { ...t, labelIds: t.labelIds.filter(l => l !== labelId) }
        : t)
    );
  }


  /**
   * Sortiert die aktuell SICHTBARE (gefilterte) Liste um. Die Indizes beziehen
   * sich auf `filteredTodos()`. Ausgefilterte Todos behalten ihre absolute Position.
   */
  reorder(previousIndex: number, currentIndex: number) {
    if (previousIndex === currentIndex) return;
    const visible = this.filteredTodos();
    if (
      previousIndex < 0 || currentIndex < 0 ||
      previousIndex >= visible.length || currentIndex >= visible.length
    ) return;

    const reordered = [...visible];
    const [moved] = reordered.splice(previousIndex, 1);
    reordered.splice(currentIndex, 0, moved);

    const visibleIds = new Set(visible.map(t => t.id));
    let qi = 0;
    this.todos.update(all =>
      all.map(item => (visibleIds.has(item.id) ? reordered[qi++] : item)),
    );

    // Komplette neue Reihenfolge persistieren (Index = Position).
    this.http
      .put<void>(`${this.apiUrl}/reorder`, { ids: this.todos().map(t => t.id) })
      .subscribe({
        error: (err) => {
          console.error('Sortierung speichern fehlgeschlagen', err);
          this.toast.error('Could not save order');
          this.loadTodos();
        },
      });
  }

  /**
   * Löschen mit Undo: sofort aus der Liste nehmen, aber das DELETE erst nach
   * 5 s senden. "Rückgängig" bricht den Timer ab und stellt das Todo an der
   * alten Position wieder her — es war dann nie weg vom Server.
   */
  removeTodo(id: string) {
    const items = this.todos();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return;
    const removed = items[index];

    this.todos.update(list => list.filter(item => item.id !== id));

    const shortTitle =
      removed.title.length > 30 ? `${removed.title.slice(0, 30)}…` : removed.title;

    const deleteTimeout = setTimeout(() => {
      this.toast.dismiss(toastId);
      this.deleteOnServer(id);
    }, 5000);

    const toastId = this.toast.show(`“${shortTitle}” deleted`, {
      actionLabel: 'Undo',
      action: () => {
        clearTimeout(deleteTimeout);
        this.todos.update(list => {
          const next = [...list];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
      },
      durationMs: 5000,
    });
  }

  private deleteOnServer(id: string) {
    this.http.delete<void>(`${this.apiUrl}/${id}`).subscribe({
      error: (err) => {
        console.error('Todo löschen fehlgeschlagen', err);
        this.toast.error('Could not delete todo');
        this.loadTodos();
      },
    });
  }

  toggleTodo(id: string) {
    const current = this.todos().find(item => item.id === id);
    if (!current) return;
    const completed = !current.completed;
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, completed } : item),
    );

    // Beim Abhaken einer wiederkehrenden Aufgabe legt der SERVER die naechste
    // Ausgabe an. Der Client kann sie nicht erraten, also holt er die Liste
    // danach neu; sonst fehlt die neue Zeile bis zum naechsten Reload.
    const spawnsNext = completed && current.repeat !== null;
    this.updateOnServer(id, { completed }, spawnsNext);
  }

  // ---- Archiv ----
  //
  // Weggelegt heisst: nicht mehr in der Liste, nicht mehr in der Statistik,
  // aber auch nicht geloescht. Der Server liefert Archiviertes gar nicht erst
  // mit, solange niemand danach fragt — deshalb genuegt es hier, die Zeile
  // lokal zu entfernen.

  /** Zahl der erledigten Todos, die noch in der Liste stehen. */
  readonly archivableCount = computed(
    () => this.todos().filter((t) => t.completed && t.archivedAt === null).length,
  );

  /** Ein einzelnes Todo weglegen. */
  archiveTodo(id: string) {
    const snapshot = this.todos();
    this.todos.update((items) => items.filter((item) => item.id !== id));

    this.http
      .patch<TodoDto>(`${this.apiUrl}/${id}/archive`, { archived: true })
      .subscribe({
        error: (err) => {
          console.error('Archivieren fehlgeschlagen', err);
          this.toast.error('Could not archive');
          this.todos.set(snapshot);
        },
      });
  }

  /**
   * Alles Erledigte auf einmal weglegen.
   *
   * Ohne Vorwegnahme in der Oberflaeche: hier verschwinden auf einen Schlag
   * hunderte Zeilen, und das ist kein Zustand, den man raten sollte. Erst die
   * Antwort, dann die neue Liste.
   */
  archiveCompleted() {
    this.http
      .post<{ archived: number }>(`${this.apiUrl}/archive-completed`, {})
      .subscribe({
        next: (res) => {
          this.loadTodos();
          this.toast.show(
            res.archived === 1
              ? '1 todo archived'
              : `${res.archived} todos archived`,
          );
        },
        error: (err) => {
          console.error('Archivieren fehlgeschlagen', err);
          this.toast.error('Could not archive');
        },
      });
  }

  // ---- Wiederholung ----

  /** Wiederholung setzen oder (mit null) abschalten. */
  setRepeat(id: string, repeat: RepeatRule | null) {
    this.todos.update((items) =>
      items.map((item) => (item.id === id ? { ...item, repeat } : item)),
    );

    this.updateOnServer(id, {
      repeatEvery: repeat?.every ?? null,
      repeatUnit: repeat?.unit ?? null,
      repeatFrom: repeat?.from ?? null,
    });
  }

  private updateOnServer(
    id: string,
    changes: Partial<{
      title: string;
      completed: boolean;
      isFavorite: boolean;
      scheduledDate: string | null;
      repeatEvery: number | null;
      repeatUnit: string | null;
      repeatFrom: string | null;
      planId: string | null;
    }>,
    /** true, wenn der Server dabei etwas anlegt, das der Client nicht kennt. */
    reloadAfter = false,
  ) {
    this.http.put<TodoDto>(`${this.apiUrl}/${id}`, changes).subscribe({
      next: () => {
        if (reloadAfter) this.loadTodos();
      },
      error: (err) => {
        console.error('Todo aktualisieren fehlgeschlagen', err);
        this.toast.error('Could not save change');
        this.loadTodos();
      },
    });
  }
}
