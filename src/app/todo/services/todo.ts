import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { Subject, distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../../environments/enviroment';
import { RepeatRule, Todo } from '../model/todo.model';
import { LabelService } from './label.service';
import { ToastService } from '../../shared/toast.service';
import {
  appendUnder,
  moveOutOfGroup,
  moveWithSubtasks,
  openGroups,
  orderWithSubtasks,
  setTaskLevel,
  stripPriorityPrefix,
  subtaskGroups,
  taskLevel,
} from '../shared/title-priority';
import {
  isSection,
  moveToSection,
  pruneEmptySections,
  sectionName,
  sectionTitle,
} from '../shared/section';
import { TitleToken, splitTitle } from '../shared/title-token';
import { normalize, score } from '../../search/search';
import { scheduleLabel } from '../shared/schedule';

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
  // Auch diese beiden optional: ein Server ohne die Migration liefert sie
  // nicht, und dann soll die App weiterlaufen und schweigen, statt auf
  // undefined zu rechnen.
  completedAt?: string | null;
  seriesId?: string | null;
  /**
   * Was beim Abhaken nebenbei entstanden ist. Nur bei PUT gesetzt.
   *
   * Der Server sagt es ausdruecklich, statt dass der Client es sich aus der
   * Wiederholungsregel zusammenreimt. Genau dieses Zusammenreimen hat vorher
   * nicht funktioniert, und weil es stillschweigend nicht funktionierte, sah
   * es aus, als tue die Wiederholung gar nichts.
   */
  nextOccurrence?: { id: string; scheduledDate: string | null } | null;
}

interface TodoListResponse {
  todo: TodoDto[];
  total: number;
}

// Schlüssel der alten, rein lokalen Speicherung (vor der Server-Anbindung).
const LEGACY_TODO_KEY = 'todos';

export type View = 'list' | 'week' | 'plans';

/**
 * Früher merkte sich die App hier die zuletzt gewählte Ansicht. Ein Neuladen
 * beginnt jetzt immer in der Liste (siehe `view`); der alte Eintrag wird beim
 * Start entfernt, damit er nicht für immer im Browser liegen bleibt.
 */
const LEGACY_VIEW_KEY = 'todo.view';

/** Ein Schritt (/sub) — für moveToSection, das die Präfixe nicht selbst liest. */
const isStepTitle = (title: string) => taskLevel(title) === 'sub';

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
   *
   * Ohne Abschnitts-Überschriften (section.ts): die sind Gliederung der Liste,
   * keine Aufgaben, und gehören weder in die Woche noch in die Suche.
   */
  readonly allTodos = computed(() => this.todos().filter((t) => !isSection(t.title)));

  /**
   * Startet auf „Active": nach dem Neuladen steht da, was noch zu tun ist —
   * nicht das Erledigte von gestern dazwischen. Gewählt wird danach wie
   * gehabt; gemerkt wird die Wahl bewusst nicht.
   */
  readonly filter = signal<Filter>('active');
   readonly searchTerm = signal('');

  /**
   * Ein Präfix als Filter der Listensuche: „/must " im Suchfeld wird zum
   * Zeichen und zeigt nur noch Must-haves — dasselbe Verhalten wie beim
   * Anlegen, nur dass hier gefiltert statt gesetzt wird.
   */
  readonly searchToken = signal<TitleToken | null>(null);

  /**
   * Alle Todos des aktiven Folders, ohne Status- und Suchfilter. Das ist der
   * Ausschnitt, über den Kopfzeile und Statistik sprechen — und über den die
   * Priorisierung sprechen muss, damit beide dasselbe meinen.
   */
  readonly scopedTodos = computed(() =>
    this.todosInCategory().filter((t) => !isSection(t.title)),
  );

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
    // "Active" behält erledigte Schritte, solange ihre Aufgabe offen ist
    // (openGroups): man sieht, wie weit sie ist.
    //
    // Abschnitts-Überschriften laufen durch jeden Filter mit; wo der Filter
    // aussiebt (Done, Favorites, Suche), fallen die leeren unten weg.
    if (f === 'active')    items = openGroups(items);
    if (f === 'completed') items = items.filter(i => i.completed || isSection(i.title));
    if (f === 'favorites') items = items.filter(i => (i.isFavorite && !i.completed) || isSection(i.title));

    // Titel-Suche: im TEXT, nicht im Präfix.
    //
    // Vorher lief sie über den rohen Titel. Seit das Präfix nur noch als
    // Zeichen erscheint, fand „must" jedes Must-have, ohne dass das Wort
    // irgendwo zu sehen war. Jetzt dieselbe Regel wie in der grossen Suche:
    // jedes Wort muss vorkommen, Reihenfolge, Akzente und Grossschreibung egal.
    const terms = normalize(this.searchTerm()).split(/\s+/).filter((t) => t.length > 0);
    if (terms.length > 0) {
      items = items.filter(
        (i) => isSection(i.title) || score(splitTitle(i.title).text, terms) !== null,
      );
    }

    const token = this.searchToken();
    if (token !== null) {
      items = items.filter((i) => isSection(i.title) || splitTitle(i.title).tokens.includes(token));
    }

    // Priorität per Titel-Präfix: /must zuerst, /could danach. Unteraufgaben
    // (/sub) bleiben dabei bei ihrer Hauptaufgabe — ohne das waere die
    // Einrueckung in der Liste eine Luege, weil eine Unteraufgabe keine
    // eigene Stufe traegt und allein zurueckbliebe, sobald ihre Hauptaufgabe
    // nach oben rutscht.
    items = orderWithSubtasks(items);

    if (f === 'completed' || f === 'favorites' || terms.length > 0 || token !== null) {
      items = pruneEmptySections(items);
    }

    return items;
  });

  /**
   * Fortschritt je Aufgabe mit Schritten: erledigt von allen, im offenen
   * Folder und unabhängig vom Filter. Unter „Active" fehlen sonst nie
   * Schritte, unter „Favorites" schon — die Zahl soll trotzdem stimmen.
   */
  readonly stepProgress = computed(() => {
    const progress = new Map<string, { done: number; total: number }>();
    for (const [head, ...steps] of subtaskGroups(this.todosInCategory())) {
      if (steps.length === 0) continue;
      progress.set(head.id, {
        done: steps.filter((s) => s.completed).length,
        total: steps.length,
      });
    }
    return progress;
  });

  /** Die Schritte einer Aufgabe, im offenen Folder. */
  stepsOf(headId: string): Todo[] {
    const group = subtaskGroups(this.todosInCategory()).find((g) => g[0].id === headId);
    return group ? group.slice(1) : [];
  }

  /** Die Aufgabe, zu der ein Schritt gehört; null, wenn er keine hat. */
  headOf(stepId: string): Todo | null {
    for (const [head, ...steps] of subtaskGroups(this.todosInCategory())) {
      if (steps.some((s) => s.id === stepId)) return head;
    }
    return null;
  }

  // ---- Ein- und Ausrücken ----
  //
  // Die Zugehörigkeit hängt am Präfix „/sub" und an der Position: ein Schritt
  // gehört zur nächsten Aufgabe darüber. Beides muss sich also zusammen
  // ändern, sonst rückt ein Todo zwar ein, landet aber unter der falschen
  // Aufgabe — etwa, weil die Liste nach Priorität sortiert anders aussieht,
  // als die Reihenfolge darunter ist.

  /**
   * Macht ein Todo zum Schritt einer Aufgabe. Es rückt ans Ende ihrer
   * Schritte, ausser `inPlace`: dann steht es schon dort, wo es hingehört
   * (nach einem Zug), und nur die Stufe ändert sich.
   *
   * Eine Aufgabe, die selbst Schritte hat, wird kein Schritt — drei Ebenen
   * gibt es nicht. false, wenn nichts geschah.
   */
  makeStepOf(id: string, headId: string, inPlace = false): boolean {
    const todo = this.todoById(id);
    if (!todo || id === headId) return false;
    if (this.stepsOf(id).length > 0 && taskLevel(todo.title) !== 'sub') {
      this.toast.show('A task with steps can\'t become a step');
      return false;
    }
    const title = setTaskLevel(todo.title, 'sub');
    this.todos.update((items) => {
      const renamed = items.map((item) => (item.id === id ? { ...item, title } : item));
      return inPlace ? renamed : appendUnder(renamed, id, headId);
    });
    this.updateOnServer(id, { title });
    this.persistOrder();
    return true;
  }

  /** Ein Schritt wird wieder eine eigene Aufgabe, direkt hinter seiner Gruppe. */
  makeOwnTask(id: string): boolean {
    const todo = this.todoById(id);
    if (!todo || taskLevel(todo.title) !== 'sub') return false;
    const title = setTaskLevel(todo.title, null);
    this.todos.update((items) =>
      moveOutOfGroup(items, id).map((item) => (item.id === id ? { ...item, title } : item)),
    );
    this.updateOnServer(id, { title });
    this.persistOrder();
    return true;
  }

  readonly stats = computed(() => {
    const items = this.scopedTodos();
    return {
      total: items.length,
      active: items.filter(item => !item.completed).length,
      completed: items.filter(item => item.completed).length,
    };
  });

  
  progressFor(labelId: string): { total: number; completed: number; percent: number } {
    const items = this.allTodos().filter(t => t.labelIds.includes(labelId));
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
    try {
      localStorage.removeItem(LEGACY_VIEW_KEY);
    } catch {
      /* Privater Modus / blockierte Site-Daten: dann liegt dort auch nichts. */
    }

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
          // Auch das Archiv: sonst stünde im Rückblick des nächsten Nutzers
          // die Woche des vorigen.
          this.archive.set([]);
          return;
        }
        this.loading.set(true);
        this.http.get<TodoListResponse>(this.apiUrl).subscribe({
          next: (res) => {
            this.todos.set(res.todo.map((t) => this.toTodo(t)));
            this.loading.set(false);
            this.importLegacyTodos();
            // Erst nach der Liste: die braucht man sofort, das Archiv nicht.
            this.loadArchive();
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
        next: (dto) => {
          this.todos.update((items) =>
            items.map((item) => (item.id === id ? this.toTodo(dto) : item)),
          );
          // Zurück in der Liste heißt: nicht mehr im Archiv. Bliebe es dort,
          // tauchte es nach einem späteren Löschen in den Zahlen wieder auf.
          this.archive.update((list) => list.filter((item) => item.id !== id));
        },
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
    completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
    seriesId: dto.seriesId ?? null,
    repeat: toRepeat(dto),
    planId: dto.planId ?? null,
  };
}

  /**
   * Gibt es ueberhaupt Erledigungszeiten?
   *
   * Die Frage entscheidet, ob die App zeitlich reden darf. Vor der Migration
   * (und in jeder Zeile, die davor abgehakt wurde) steht hier null, und eine
   * Wochenbilanz aus null-Werten waere keine Bilanz, sondern eine Behauptung.
   */
  readonly hasCompletionTimes = computed(() =>
    this.withArchive().some((todo) => !!todo.completedAt),
  );

  // ---- Das Archiv, nur für Zeitliches ----
  //
  // Weggelegte Zeilen fehlen der Liste mit Absicht: dort sollen sie den Blick
  // nicht verstellen, und die Zähler oben sollen ohne sie rechnen. Für alles,
  // was über die VERGANGENHEIT spricht, ist genau das aber falsch. Wer
  // sonntags „Archive 11 completed" drückt, hätte montags einen leeren
  // Wochenrückblick, und jede wiederkehrende Aufgabe verlöre ihre Historie.
  //
  // Deshalb einmal im Hintergrund das Archiv dazu — über denselben Endpunkt,
  // den „Show archive" schon benutzt — und eine Vereinigung, die nur dort
  // gelesen wird, wo es um Zeit geht. Die Liste und ihre Zähler bleiben, wie
  // sie sind.

  /** Weggelegte Zeilen, nur für Rückblick, Rhythmus und Tagesbilanz. */
  private readonly archive = signal<Todo[]>([]);

  /**
   * Die aktuelle Liste plus das Archiv. Bei doppelter id gewinnt die Liste:
   * sie ist der frischere Stand (ein gerade abgehaktes Todo steht dort schon,
   * im Archiv-Schnappschuss noch nicht).
   */
  readonly withArchive = computed(() => {
    const current = this.allTodos();
    const archived = this.archive();
    if (archived.length === 0) return current;

    const listed = new Set(current.map((todo) => todo.id));
    return [...current, ...archived.filter((todo) => !listed.has(todo.id))];
  });

  /** Dasselbe, auf den offenen Ordner beschränkt — wie scopedTodos. */
  readonly scopedWithArchive = computed(() => {
    const labelId = this.labelService.activeLabelId();
    const items = this.withArchive();
    return labelId === null ? items : items.filter((i) => i.labelIds.includes(labelId));
  });

  /**
   * Das Archiv einmal nachladen.
   *
   * Still, wenn es scheitert: ohne Archiv rechnen Rückblick und Rhythmus über
   * die Liste allein, und das ist weniger, aber nicht falsch. Eine Fehlermeldung
   * für etwas, das man nicht angefordert hat, wäre Lärm.
   */
  private loadArchive() {
    this.http.get<TodoListResponse>(`${this.apiUrl}?archived=true`).subscribe({
      next: (res) =>
        this.archive.set(
          res.todo.filter((dto) => !!dto.archivedAt).map((dto) => this.toTodo(dto)),
        ),
      error: (err) => console.error('Archiv laden fehlgeschlagen', err),
    });
  }

  /** Was gerade weggelegt wurde, ins Archiv übernehmen — ohne neu zu laden. */
  private moveToArchive(items: readonly Todo[]) {
    if (items.length === 0) return;
    const archivedAt = new Date();
    const moved = new Set(items.map((todo) => todo.id));
    this.archive.update((list) => [
      ...list.filter((todo) => !moved.has(todo.id)),
      ...items.map((todo) => ({ ...todo, archivedAt })),
    ]);
  }

  // ---- Wochenansicht ----
  /**
   * Liste vs. Woche vs. Pläne.
   *
   * Startet immer in der Liste — mit dem Filter „Active" heißt Neuladen:
   * zeig mir, was offen ist. Vorher kam man dorthin zurück, wo man zuletzt
   * war, und landete nach einem Reload in der Woche oder in einem Plan statt
   * bei den eigenen Aufgaben.
   */
  readonly view = signal<View>('list');

  // ---- Hinspringen ----

  /**
   * Welche Zeile die Liste zeigen soll — gesetzt von der Suche, abgeholt und
   * zurückgesetzt von der Liste. Die Zahl macht zwei Sprünge zum selben Todo
   * zu zwei Ereignissen.
   */
  readonly revealRequest = signal<{ id: string; seq: number } | null>(null);
  private revealSeq = 0;

  /**
   * Ein Todo in der Liste zeigen, egal wo es gerade steht.
   *
   * Stellt dafür um, was es verdecken würde: einen anderen Ordner, einen
   * Status-Filter, eine Suche, das ausgeblendete Archiv. Nur so viel wie
   * nötig — wer in „Work" sucht und dort fündig wird, bleibt in „Work".
   */
  reveal(todo: Todo) {
    const folder = this.labelService.activeLabelId();
    if (folder !== null && !todo.labelIds.includes(folder)) {
      this.labelService.activeLabelId.set(null);
    }

    this.searchTerm.set('');
    this.searchToken.set(null);

    const f = this.filter();
    const visible =
      f === 'all' ||
      (f === 'active' && !todo.completed) ||
      (f === 'completed' && todo.completed) ||
      (f === 'favorites' && todo.isFavorite && !todo.completed);
    if (!visible) this.filter.set('all');

    if (todo.archivedAt !== null && !this.showArchived()) this.toggleArchiveView();

    this.view.set('list');
    this.revealRequest.set({ id: todo.id, seq: ++this.revealSeq });
  }

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
  addTodo(
    title: string,
    scheduledDate: string | null = null,
    parentId: string | null = null,
    sectionId?: string | null,
  ) {
    const t = title.trim();
    if (t === '') return;
    this.http
      .post<TodoDto>(this.apiUrl, {
        title: t,
        categoryId: this.labelService.activeLabelId(), // ← aktuelle Auswahl
        scheduledDate,                                  // Woche: direkt auf einen Tag
      })
      .subscribe({
        next: (dto) => {
          this.todos.update(items => [...items, this.toTodo(dto)]);
          this.placeNew(dto.id, dto.title, parentId, sectionId);
        },
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

  /**
   * Der Stand aller Todos als Signal — fuer Ansichten, die daran haengen,
   * ohne ihn zu aendern. Zum Schreiben gibt es die Methoden darueber.
   */
  readonly snapshot = this.todos.asReadonly();

  /** Ein Todo in konstanter Zeit. null, wenn es keins (mehr) gibt. */
  private readonly todosById = computed(
    () => new Map(this.todos().map((todo) => [todo.id, todo])),
  );

  todoById(id: string | null | undefined): Todo | null {
    return id ? this.todosById().get(id) ?? null : null;
  }

  addTodos(
    titles: string[],
    parentId: string | null = null,
    scheduledDate: string | null = null,
    sectionId?: string | null,
  ) {
    const clean = titles.map((t) => t.trim()).filter((t) => t.length > 0);
    if (clean.length === 0) return;
    if (clean.length === 1) {
      this.addTodo(clean[0], scheduledDate, parentId, sectionId);
      return;
    }

    const categoryId = this.labelService.activeLabelId();
    let hadError = false;

    const postNext = (index: number) => {
      if (index >= clean.length) {
        if (hadError) {
          this.toast.error('Could not create some todos');
        }
        this.persistOrder();
        return;
      }
      this.http
        .post<TodoDto>(this.apiUrl, { title: clean[index], categoryId, scheduledDate })
        .subscribe({
          next: (dto) => {
            this.todos.update((items) => [...items, this.toTodo(dto)]);
            // Einsortieren ja, sichern erst am Ende: sonst geht fuer jede
            // eingefuegte Zeile eine eigene Reihenfolge an den Server.
            this.placeNew(dto.id, dto.title, parentId, sectionId, false);
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
   * Ein Zug in der Liste: `movedId` an die Stelle von `targetId`, mit allem,
   * was dazugehört (moveWithSubtasks).
   *
   * Gerechnet wird auf dem GANZEN Ordner, nicht auf der sichtbaren Liste.
   * Vorher wurde die sichtbare umsortiert und eingesetzt, und ausgeblendete
   * Zeilen behielten ihren absoluten Platz. In einer flachen Liste ging das
   * gut; mit Gruppen und Abschnitten nicht mehr: zog man „Später" nach oben,
   * blieb das erledigte Todo daraus an seinem alten Index stehen, mitten in
   * einer fremden Gruppe, und wurde dort zum Kopf ihrer restlichen Schritte.
   * Jetzt bewegt sich nur der gezogene Block, samt dem, was gerade nicht zu
   * sehen ist: erledigte Todos eines Abschnitts, Schritte, die eine Suche
   * ausblendet.
   *
   * In der Reihenfolge, in der die Liste steht (orderWithSubtasks): sonst
   * hiesse „nach oben" im gespeicherten Stand manchmal „nach unten".
   */
  moveTo(movedId: string, targetId: string) {
    const scope = orderWithSubtasks(this.todosInCategory());
    const ordered = moveWithSubtasks(scope, movedId, targetId);
    if (!ordered) return;
    const byId = new Map(scope.map((t) => [t.id, t]));
    this.reorderScope(() => ordered.map((id) => byId.get(id)!));
    this.persistOrder();
  }

  /**
   * Ordnet die Todos des offenen Ordners neu. Die anderer Ordner behalten
   * ihre Plätze — ihre Gliederung wird in ihrem eigenen Ordner gelesen, und
   * dort zählt nur, dass ihre Reihenfolge untereinander bleibt.
   */
  private reorderScope(next: (scope: Todo[]) => Todo[]) {
    const scope = this.todosInCategory();
    const ordered = next(scope);
    if (ordered.length !== scope.length) return;
    const ids = new Set(scope.map((t) => t.id));
    let i = 0;
    this.todos.update((all) => all.map((item) => (ids.has(item.id) ? ordered[i++] : item)));
  }

  /** Komplette Reihenfolge sichern (Index = Position). */
  private persistOrder() {
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

  // ---- Unteraufgaben anlegen ----
  //
  // „/sub" allein haengt einen Schritt an die Zeile darueber — beim Tippen
  // unten im Feld ist das die letzte Aufgabe der Liste, nicht die, um die es
  // geht. Deshalb laesst sich eine Hauptaufgabe anklicken: sie ist dann das
  // Ziel, und was man anlegt, landet bei ihr.

  /** Hauptaufgabe, unter der neue Todos landen. null = ans Ende. */
  private readonly parentId = signal<string | null>(null);

  readonly activeParentId = this.parentId.asReadonly();

  /** Die gewaehlte Hauptaufgabe — null, sobald es sie nicht mehr gibt. */
  readonly activeParent = computed<Todo | null>(() => this.todoById(this.parentId()));

  selectParent(id: string | null) {
    this.parentId.set(id);
  }

  /**
   * Wohin ein neues Todo kommt.
   *
   * - unter eine Aufgabe (parentId): ans Ende ihrer Schritte,
   * - in einen Abschnitt (sectionId): an dessen Ende; null = in den Bereich
   *   vor dem ersten Abschnitt,
   * - sonst, sobald der Ordner Abschnitte hat: ebenfalls in den Bereich vor
   *   dem ersten. Am Listenende landete es im letzten Abschnitt („Später"),
   *   und das hat man beim Tippen oben nicht gemeint.
   * Ein Abschnitt selbst kommt ans Ende.
   */
  private placeNew(
    id: string,
    title: string,
    parentId: string | null,
    sectionId: string | null | undefined,
    persist = true,
  ) {
    if (parentId) {
      this.placeUnder(id, parentId, persist);
      return;
    }
    if (isSection(title)) return;
    const target =
      sectionId !== undefined
        ? sectionId
        : this.todosInCategory().some((t) => isSection(t.title))
          ? null
          : undefined;
    if (target === undefined) return;
    this.reorderScope((scope) => moveToSection(scope, id, target, isStepTitle));
    if (persist) this.persistOrder();
  }

  // ---- Abschnitte ----

  /** Ein neuer Abschnitt im offenen Ordner, am Ende der Liste. */
  addSection(name: string) {
    if (!name.trim()) return;
    this.addTodo(sectionTitle(name));
  }

  renameSection(id: string, name: string) {
    if (!name.trim()) return;
    this.renameTodo(id, sectionTitle(name));
  }

  /** Ein Todo samt Schritten in einen Abschnitt (null: vor den ersten). */
  moveTodoToSection(id: string, sectionId: string | null) {
    this.reorderScope((scope) => moveToSection(scope, id, sectionId, isStepTitle));
    this.persistOrder();
  }

  /**
   * Schiebt ein frisch angelegtes Todo ans Ende der Gruppe seiner
   * Hauptaufgabe.
   *
   * Ans ENDE, nicht direkt dahinter: wer drei Schritte nacheinander tippt,
   * meint ihre Reihenfolge. Direkt hinter die Hauptaufgabe gesetzt stuende der
   * zuletzt getippte oben, und die Liste laese sich rueckwaerts.
   */
  private placeUnder(movedId: string, parentId: string, persist = true) {
    this.todos.update(items => appendUnder(items, movedId, parentId));
    if (persist) this.persistOrder();
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

    // Ohne Präfix: „/must Steuer" ist ein Steuerzeichen, kein Name.
    const plain = isSection(removed.title)
      ? sectionName(removed.title)
      : stripPriorityPrefix(removed.title).split('\n')[0];
    const shortTitle = plain.length > 30 ? `${plain.slice(0, 30)}…` : plain;

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

  /**
   * Jedes Abhaken, als Ereignis.
   *
   * Für die Belohnung (reward/reward.service.ts). Sie hängt sich hier an,
   * statt dass jede Stelle, die abhakt — Liste, Woche, Next up, Pläne —
   * selbst an sie denken muss. Zurücknehmen meldet nichts: die XP gehen dann
   * von allein zurück, weil sie aus den erledigten Todos gerechnet werden.
   */
  private readonly completedSubject = new Subject<Todo>();
  readonly completions = this.completedSubject.asObservable();

  toggleTodo(id: string) {
    const current = this.todos().find(item => item.id === id);
    if (!current) return;
    const completed = !current.completed;

    // Optimistisch auch den Zeitpunkt, damit die Wochenbilanz nicht erst nach
    // der Serverantwort stimmt. Es bleibt eine Schaetzung der eigenen Uhr —
    // der echte Wert kommt gleich darunter aus der Antwort.
    this.todos.update(items =>
      items.map(item =>
        item.id === id
          ? { ...item, completed, completedAt: completed ? new Date() : null }
          : item,
      ),
    );

    if (completed) {
      const done = this.todoById(id);
      if (done) this.completedSubject.next(done);
    }

    // Beim Abhaken einer wiederkehrenden Aufgabe legt der SERVER die naechste
    // Ausgabe an, und nur seine Antwort weiss sicher, ob das passiert ist.
    //
    // Vorher entschied das der Client anhand seiner eigenen Kopie der Regel.
    // Das war eine Vermutung ueber fremden Zustand: lag die Regel dort aus
    // irgendeinem Grund nicht vor, wurde nicht nachgeladen, waehrend der
    // Server sehr wohl angelegt hatte. Die neue Zeile blieb bis zum naechsten
    // Reload unsichtbar, und von aussen sah es aus, als tue die Wiederholung
    // gar nichts.
    this.updateOnServer(id, { completed }, (dto) => {
      // Den Zeitpunkt vom Server uebernehmen, nicht den geschaetzten behalten.
      //
      // Kurz vor Mitternacht entscheidet eine um Minuten falsch gehende
      // Browseruhr, in welche WOCHE eine Erledigung faellt. Genau dafuer setzt
      // der Server den Wert, und genau deshalb wird er hier gelesen. Nur
      // dieses eine Feld: alles andere koennte einen laufenden Tastendruck
      // ueberschreiben.
      this.todos.update((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
              }
            : item,
        ),
      );

      const next = dto.nextOccurrence;
      if (!next) return;

      // Die neue Zeile holen, und sagen, wann es wieder soweit ist. Der Hinweis
      // ist nicht nur Bestaetigung: in der Wochenansicht steht die naechste
      // Ausgabe in einer anderen Woche, dort saehe man sonst ueberhaupt nichts
      // passieren.
      this.loadTodos();
      this.toast.show(
        next.scheduledDate
          ? `Repeats. Next one on ${scheduleLabel(next.scheduledDate)}`
          : 'Repeats. Next one added',
      );
    });
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
    const archived = snapshot.find((item) => item.id === id);
    this.todos.update((items) => items.filter((item) => item.id !== id));

    this.http
      .patch<TodoDto>(`${this.apiUrl}/${id}/archive`, { archived: true })
      .subscribe({
        // Erst nach der Bestätigung ins Archiv, damit ein gescheiterter Request
        // keine Zeile in zwei Mengen zurücklässt.
        next: () => {
          if (archived) this.moveToArchive([archived]);
        },
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
    // Was jetzt weggelegt wird, vorher festhalten: nach dem Neuladen steht es
    // nicht mehr in der Liste, und der Rückblick soll es trotzdem kennen.
    const completed = this.todos().filter((t) => t.completed && t.archivedAt === null);

    this.http
      .post<{ archived: number }>(`${this.apiUrl}/archive-completed`, {})
      .subscribe({
        next: (res) => {
          this.moveToArchive(completed);
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
    const current = this.todos().find((item) => item.id === id);

    this.todos.update((items) =>
      items.map((item) => (item.id === id ? { ...item, repeat } : item)),
    );

    // Auf etwas bereits Erledigtem passiert erst einmal nichts, und das ist
    // die unangenehmste Art von nichts: still. Die naechste Ausgabe entsteht
    // beim UEBERGANG auf erledigt, und der liegt hier schon in der
    // Vergangenheit. Ohne diesen Satz wartet man auf etwas, das nicht kommt.
    if (repeat && current?.completed) {
      this.toast.show('Saved. The next one appears when you tick it off again');
    }

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
    /**
     * Bekommt die Antwort des Servers. Dort steht, was wirklich passiert ist —
     * der Aufrufer muss es nicht aus dem eigenen Zustand ableiten.
     */
    onSaved?: (dto: TodoDto) => void,
  ) {
    this.http.put<TodoDto>(`${this.apiUrl}/${id}`, changes).subscribe({
      next: (dto) => onSaved?.(dto),
      error: (err) => {
        console.error('Todo aktualisieren fehlgeschlagen', err);
        this.toast.error('Could not save change');
        this.loadTodos();
      },
    });
  }
}
