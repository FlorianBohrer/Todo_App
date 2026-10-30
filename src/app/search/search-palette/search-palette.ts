import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  Archive,
  Circle,
  CircleCheck,
  FileText,
  LucideAngularModule,
  Search,
  X,
} from 'lucide-angular';

import type { Plan } from '../../plan/plan.model';
import type { PlanService } from '../../plan/plan.service';
import { TodoService } from '../../todo/services/todo';
import { LabelService } from '../../todo/services/label.service';
import { rankForFocus } from '../../todo/shared/focus';
import { folderColorClass } from '../../todo/shared/folder-color';
import { folderIcon } from '../../todo/shared/folder-icon';
import { scheduleLabel } from '../../todo/shared/schedule';
import {
  TitleToken,
  splitTitle,
  tokenClass,
  tokenDescription,
  tokenIcon,
  tokenText,
} from '../../todo/shared/title-token';
import { TokenChip } from '../../todo/shared/token-chip';
import {
  FolderHit,
  PlanHit,
  Query,
  Segment,
  TodoHit,
  highlight,
  isEmptyQuery,
  normalize,
  searchFolders,
  searchPlans,
  searchTodos,
} from '../search';

type Hit = TodoHit | PlanHit | FolderHit;

interface Item {
  /** Platz in der Gesamtliste — für Pfeiltasten und aria-activedescendant. */
  index: number;
  key: string;
  hit: Hit;
}

interface Group {
  id: string;
  title: string;
  items: Item[];
  /** Wie viele Treffer nicht mehr angezeigt werden. */
  more: number;
}

/** Wie viele Treffer je Gruppe. Mehr ist keine Antwort, sondern wieder eine Liste. */
const LIMIT = { todos: 8, plans: 5, folders: 4 } as const;

/** Die Zeichen, nach denen sich filtern lässt, in der Reihenfolge der Fußzeile. */
const FILTER_TOKENS: readonly TitleToken[] = ['must', 'should', 'could', 'wont', 'main', 'sub'];

/**
 * Die Suche über alles.
 *
 * ⌘K (Strg+K) oder der Knopf in der Leiste öffnet sie, von überall — auch
 * aus einem Textfeld heraus und in jeder Ansicht. Getippt wird oben, gewählt
 * mit den Pfeiltasten, Enter springt hin: ein Todo wird in der Liste
 * gezeigt, ein Plan geöffnet, ein Ordner ausgewählt.
 *
 * Ohne Eingabe zeigt sie, was laut „Next up" als Nächstes dran ist — die
 * häufigste Frage, mit der man eine Suche öffnet, ist „wo war das, was ich
 * jetzt machen wollte".
 */
@Component({
  selector: 'app-search-palette',
  imports: [LucideAngularModule, TokenChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-palette.html',
  styles: `
    /* Der Treffer im Text: eine Fläche in der Farbe der Ansicht, keine
       andere Schrift — markiert wird, nicht umgeschrieben. */
    .search-mark {
      border-radius: 0.2em;
      background: color-mix(in srgb, var(--color-highlight2) 30%, transparent);
      color: var(--color-text);
    }

    /* Der Dialog selbst zeigt, wo der Fokus ist; ein zweiter Ring um das
       einzige Feld darin wäre Lärm. Die globale :focus-visible-Regel steht
       ausserhalb der Tailwind-Schichten, deshalb hier. */
    .search-field:focus-visible {
      outline: none;
    }
  `,
})
export class SearchPalette {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);
  private readonly injector = inject(Injector);
  private readonly changes = inject(ChangeDetectorRef);

  protected readonly SearchIcon = Search;
  protected readonly ClearIcon = X;
  protected readonly PlanIcon = FileText;
  protected readonly OpenIcon = Circle;
  protected readonly DoneIcon = CircleCheck;
  protected readonly ArchivedIcon = Archive;
  protected readonly tokenIcon = tokenIcon;
  protected readonly tokenDescription = tokenDescription;
  protected readonly tokenText = tokenText;
  protected readonly tokenClass = tokenClass;
  protected readonly filterTokens = FILTER_TOKENS;

  readonly isOpen = signal(false);
  protected readonly text = signal('');
  protected readonly token = signal<TitleToken | null>(null);
  protected readonly active = signal(0);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly results = viewChild<ElementRef<HTMLElement>>('results');

  /** Wer den Fokus hatte, bevor die Suche aufging — dorthin geht er zurück. */
  private returnFocus: HTMLElement | null = null;

  // ---- Pläne, erst bei Bedarf ----
  //
  // Der Plan-Dienst steckt im nachgeladenen Teil der Pläne-Ansicht. Ihn hier
  // fest einzubinden, zöge ihn ins Start-Bundle und schickte bei jedem
  // Anmelden eine Anfrage nach Plänen ab, die vielleicht nie jemand sucht.
  // Also erst beim ersten Öffnen der Suche.

  private planService: PlanService | null = null;
  private readonly planSource = signal<Signal<Plan[]> | null>(null);
  private readonly plans = computed(() => this.planSource()?.() ?? []);

  private async loadPlans(): Promise<void> {
    if (this.planService) return;
    const { PlanService } = await import('../../plan/plan.service');
    this.planService = this.injector.get(PlanService);
    this.planSource.set(this.planService.plans);
  }

  // ---- Treffer ----

  protected readonly query = computed<Query>(() => ({
    token: this.token(),
    terms: normalize(this.text()).split(/\s+/).filter((t) => t.length > 0),
  }));

  protected readonly searching = computed(() => !isEmptyQuery(this.query()));

  protected readonly groups = computed<Group[]>(() => {
    const query = this.query();
    let index = 0;
    const group = (id: string, title: string, hits: Hit[], limit: number): Group => ({
      id,
      title,
      items: hits.slice(0, limit).map((hit) => ({ index: index++, key: keyOf(hit), hit })),
      more: Math.max(0, hits.length - limit),
    });

    if (!this.searching()) {
      const next = rankForFocus(this.todoService.allTodos())
        .slice(0, 5)
        .map((todo): TodoHit => {
          const { tokens, text } = splitTitle(todo.title);
          return { kind: 'todo', todo, tokens, title: text.split('\n')[0].trim(), score: 0 };
        });
      const recent = [...this.plans()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3)
        .map((plan): PlanHit => ({ kind: 'plan', plan, snippet: null, score: 0 }));

      return [group('next', 'Next up', next, 5), group('recent', 'Recent plans', recent, 3)].filter(
        (g) => g.items.length > 0,
      );
    }

    return [
      group('todos', 'Todos', searchTodos(this.todoService.withArchive(), query), LIMIT.todos),
      group('plans', 'Plans', searchPlans(this.plans(), query), LIMIT.plans),
      group('folders', 'Folders', searchFolders(this.labelService.labels(), query), LIMIT.folders),
    ].filter((g) => g.items.length > 0);
  });

  private readonly flat = computed(() => this.groups().flatMap((g) => g.items));

  protected readonly activeId = computed(() =>
    this.flat().length > 0 ? `search-option-${this.active()}` : null,
  );

  // ---- Öffnen und Schließen ----

  open(): void {
    if (this.isOpen()) {
      this.field()?.nativeElement.select();
      return;
    }

    const focused = document.activeElement;
    this.returnFocus = focused instanceof HTMLElement ? focused : null;
    this.text.set('');
    this.token.set(null);
    this.active.set(0);
    this.isOpen.set(true);
    void this.loadPlans();

    // Sofort zeichnen und sofort fokussieren, noch in diesem Tastendruck.
    //
    // Mit eventCoalescing (siehe app.config.ts) rendert Angular erst im
    // nächsten Bild. Bis dahin gab es das Feld nicht, der Fokus blieb am
    // <body>, und wer sofort lostippte, verlor den ersten Buchstaben — oder
    // löste ein Kürzel aus: „n" springt ins Anlegen-Feld.
    this.changes.detectChanges();
    this.field()?.nativeElement.focus();
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  /** `restore`: false, wenn ein Treffer gewählt wurde — dann gehört der Fokus dem Ziel. */
  close(restore = true): void {
    this.isOpen.set(false);
    if (restore) this.returnFocus?.focus();
    this.returnFocus = null;
  }

  // ---- Tippen ----

  protected onInput(field: HTMLInputElement): void {
    // Wie beim Anlegen: ein vorn getipptes Präfix wird zum Zeichen — hier
    // eines, das filtert.
    const { tokens, text } = splitTitle(field.value);
    if (tokens.length > 0) {
      this.token.set(tokens[0]);
      field.value = text;
    }
    this.text.set(field.value);
    this.active.set(0);
  }

  protected onKeydown(event: KeyboardEvent, field: HTMLInputElement): void {
    const count = this.flat().length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) this.moveTo((this.active() + 1) % count);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) this.moveTo((this.active() - 1 + count) % count);
        return;
      case 'Enter': {
        event.preventDefault();
        const item = this.flat()[this.active()];
        if (item) this.choose(item.hit);
        return;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      case 'Tab':
        // Ein Dialog hält den Fokus. Das einzige, was hier Fokus braucht, ist
        // das Feld; die Treffer erreicht man mit den Pfeilen.
        event.preventDefault();
        return;
      case 'Backspace':
        if (this.token() !== null && field.selectionStart === 0 && field.selectionEnd === 0) {
          event.preventDefault();
          this.token.set(null);
          this.active.set(0);
        }
        return;
    }
  }

  protected setToken(token: TitleToken | null): void {
    this.token.set(this.token() === token ? null : token);
    this.active.set(0);
    this.field()?.nativeElement.focus();
  }

  protected moveTo(index: number): void {
    this.active.set(index);
    afterNextRender(
      {
        read: () =>
          this.results()
            ?.nativeElement.querySelector(`#search-option-${index}`)
            ?.scrollIntoView({ block: 'nearest' }),
      },
      { injector: this.injector },
    );
  }

  // ---- Wählen ----

  protected choose(hit: Hit): void {
    this.close(false);

    switch (hit.kind) {
      case 'todo':
        this.todoService.reveal(hit.todo);
        return;
      case 'plan':
        this.planService?.select(hit.plan.id);
        this.todoService.view.set('plans');
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      case 'folder':
        this.labelService.selectLabel(hit.label.id);
        this.todoService.view.set('list');
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
    }
  }

  // ---- Anzeige ----

  protected segments(text: string): Segment[] {
    return highlight(text, this.query().terms);
  }

  /** Ordner und Tag eines Todos, so knapp wie möglich. */
  protected todoMeta(todo: TodoHit['todo']): string {
    const parts: string[] = [];
    const folder = this.labelService.labelById(todo.labelIds[0]);
    if (folder) parts.push(folder.name);
    if (todo.scheduledDate) parts.push(scheduleLabel(todo.scheduledDate));
    if (todo.archivedAt) parts.push('archived');
    else if (todo.completed) parts.push('done');
    return parts.join(' · ');
  }

  protected planFolder(plan: Plan): string {
    return plan.categoryId ? this.labelService.labelById(plan.categoryId)?.name ?? '' : '';
  }

  protected folderIconOf(hit: FolderHit) {
    return folderIcon(hit.label.icon);
  }

  protected folderClass(hit: FolderHit): string {
    return folderColorClass(hit.label.color, 'text');
  }
}

function keyOf(hit: Hit): string {
  switch (hit.kind) {
    case 'todo':
      return `todo-${hit.todo.id}`;
    case 'plan':
      return `plan-${hit.plan.id}`;
    case 'folder':
      return `folder-${hit.label.id}`;
  }
}
