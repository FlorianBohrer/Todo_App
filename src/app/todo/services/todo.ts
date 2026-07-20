import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../../environments/enviroment';
import { Todo } from '../model/todo.model';
import { LabelService } from './label.service';
import { ToastService } from '../../shared/toast.service';

export type Filter = 'all' | 'active' | 'completed'| 'favorites';


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
  categoryId: string | null;
  createdAt: string;
  timerStartedAt: string | null;
  timerDurationSeconds: number | null;
}

/** Auswählbare Längen für einen Zeitblock (Minuten). */
export const TIMER_PRESETS_MINUTES = [5, 15, 25, 50] as const;

interface TodoListResponse {
  todo: TodoDto[];
  total: number;
}

// Schlüssel der alten, rein lokalen Speicherung (vor der Server-Anbindung).
const LEGACY_TODO_KEY = 'todos';

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly labelService = inject(LabelService);
  private readonly apiUrl = `${environment.apiUrl}/todo`;

  private readonly todos = signal<Todo[]>([]);
  readonly filter = signal<Filter>('all');

  private readonly todosInCategory = computed(() => {
    const labelId = this.labelService.activeLabelId();
    const items = this.todos();
    return labelId === null ? items : items.filter(i => i.labelId === labelId);
  });

  readonly filteredTodos = computed(() => {
    const f = this.filter();
    let items = this.todosInCategory();

    // Status-Filter
    if (f === 'active')    items = items.filter(i => !i.completed);
    if (f === 'completed') items = items.filter(i => i.completed);
    if (f === 'favorites') items = items.filter(i => i.isFavorite);

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

  /**
   * Fortschritt eines einzelnen Folders (für die Favoriten-Kacheln).
   * Liest das todos-Signal, ist im Template also automatisch reaktiv.
   */
  progressFor(labelId: string): { total: number; completed: number; percent: number } {
    const items = this.todos().filter(t => t.labelId === labelId);
    const completed = items.filter(t => t.completed).length;
    const total = items.length;
    return {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }

  private readonly clerk = inject(ClerkService);
  private readonly toast = inject(ToastService);

  /** true während des initialen Ladens nach dem Login. */
  readonly loading = signal(false);

  constructor() {
    // Ticker starten/stoppen, sobald sich die Timer-Lage ändert.
    effect(() => {
      this.todos();
      this.ensureTicking();
    });

    // Todos erst laden, wenn ein Nutzer eingeloggt ist. Bei Logout/Userwechsel
    // den lokalen Zustand leeren, damit keine fremden Todos stehen bleiben.
    // Nach dem ersten Laden werden evtl. vorhandene Alt-Daten aus dem
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
            this.toast.error('Todos konnten nicht geladen werden — bitte Seite neu laden');
          },
        });
      });
  }

  // ---- Zeitblock (Timer) ----
  // Der Server speichert Startzeit + Dauer; die Restzeit rechnen wir hier aus.
  // `now` tickt nur, solange irgendwo ein Block läuft.
  private readonly now = signal(Date.now());
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  private ensureTicking() {
    const anyRunning = this.todos().some((item) => item.timerStartedAt !== null);

    if (anyRunning && this.tickHandle === null) {
      // Sofort nachziehen: `now` ist stehen geblieben, solange kein Block lief —
      // sonst zeigt die erste Sekunde eine zu hohe Restzeit an.
      this.now.set(Date.now());
      this.tickHandle = setInterval(() => this.now.set(Date.now()), 1000);
    } else if (!anyRunning && this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  /** Restsekunden des Zeitblocks. 0 = abgelaufen oder kein Timer aktiv. */
  remainingSeconds(todo: Todo): number {
    if (todo.timerStartedAt === null || todo.timerDurationSeconds === null) {
      return 0;
    }
    const elapsedSeconds = (this.now() - todo.timerStartedAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(todo.timerDurationSeconds - elapsedSeconds));
  }

  startTimer(id: string, durationSeconds: number) {
    // Optimistisch mit lokaler Zeit starten, danach die Serverzeit übernehmen.
    const startedAt = new Date();
    this.todos.update((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, timerStartedAt: startedAt, timerDurationSeconds: durationSeconds }
          : item,
      ),
    );

    this.http
      .patch<TodoDto>(`${this.apiUrl}/${id}/timer`, { durationSeconds })
      .subscribe({
        next: (dto) =>
          this.todos.update((items) =>
            items.map((item) => (item.id === id ? this.toTodo(dto) : item)),
          ),
        error: (err) => {
          console.error('Zeitblock starten fehlgeschlagen', err);
          this.toast.error('Zeitblock konnte nicht gestartet werden');
          this.loadTodos();
        },
      });
  }

  stopTimer(id: string) {
    this.todos.update((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, timerStartedAt: null, timerDurationSeconds: null }
          : item,
      ),
    );

    this.http
      .patch<TodoDto>(`${this.apiUrl}/${id}/timer`, { durationSeconds: null })
      .subscribe({
        error: (err) => {
          console.error('Zeitblock beenden fehlgeschlagen', err);
          this.toast.error('Zeitblock konnte nicht beendet werden');
          this.loadTodos();
        },
      });
  }

  // ---- Laden ----
  private loadTodos() {
    this.http.get<TodoListResponse>(this.apiUrl).subscribe({
      next: (res) => this.todos.set(res.todo.map((t) => this.toTodo(t))),
      error: (err) => console.error('Todos laden fehlgeschlagen', err),
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

    let legacy: Array<Partial<Todo>>;
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
    labelId: dto.categoryId,
    createdAt: new Date(dto.createdAt),
    timerStartedAt: dto.timerStartedAt ? new Date(dto.timerStartedAt) : null,
    timerDurationSeconds: dto.timerDurationSeconds ?? null,
  };
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
  addTodo(title: string) {
    const t = title.trim();
    if (t === '') return;
    this.http
      .post<TodoDto>(this.apiUrl, {
        title: t,
        categoryId: this.labelService.activeLabelId(), // ← aktuelle Auswahl
      })
      .subscribe({
        next: (dto) => this.todos.update(items => [...items, this.toTodo(dto)]),
        error: (err) => {
          console.error('Todo anlegen fehlgeschlagen', err);
          this.toast.error('Todo konnte nicht angelegt werden');
        },
      });
  }

  renameTodo(id: string, title: string) {
    const t = title.trim();
    if (t === '') return;
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, title: t } : item),
    );
    this.updateOnServer(id, { title: t });
  }

  setTodoLabel(id: string, labelId: string | null) {
    this.todos.update(items =>
      items.map(item => item.id === id ? { ...item, labelId } : item),
    );
    this.updateOnServer(id, { categoryId: labelId });
  }

  clearLabel(labelId: string) {
    // Die DB setzt category_id beim Löschen der Kategorie selbst auf null
    // (ON DELETE SET NULL) — hier nur den lokalen Zustand angleichen.
    this.todos.update(list =>
      list.map(t => t.labelId === labelId ? { ...t, labelId: null } : t)
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
          this.toast.error('Sortierung konnte nicht gespeichert werden');
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

    const toastId = this.toast.show(`„${shortTitle}“ gelöscht`, {
      actionLabel: 'Rückgängig',
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
        this.toast.error('Todo konnte nicht gelöscht werden');
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
    this.updateOnServer(id, { completed });
  }

  private updateOnServer(
    id: string,
    changes: Partial<{
      title: string;
      completed: boolean;
      categoryId: string | null;
      isFavorite: boolean;
    }>  ) {
    this.http.put<TodoDto>(`${this.apiUrl}/${id}`, changes).subscribe({
      error: (err) => {
        console.error('Todo aktualisieren fehlgeschlagen', err);
        this.toast.error('Änderung konnte nicht gespeichert werden');
        this.loadTodos();
      },
    });
  }
}
