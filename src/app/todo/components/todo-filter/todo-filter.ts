import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, Search, X } from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { isTypingTarget } from '../../shared/keyboard';
import { TOKEN_DESCRIPTION, TOKEN_ICON, splitTitle, tokenClass } from '../../shared/title-token';

@Component({
  selector: 'app-todo-filter',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-filter.html',
  styleUrl: './todo-filter.scss',
})
export class TodoFilter {
  private readonly todoService = inject(TodoService);
  protected readonly filter = this.todoService.filter;
  protected readonly searchTerm = this.todoService.searchTerm;
  protected readonly searchToken = this.todoService.searchToken;
  protected readonly SearchIcon = Search;
  protected readonly ClearIcon = X;
  protected readonly tokenIcon = TOKEN_ICON;
  protected readonly tokenDescription = TOKEN_DESCRIPTION;
  protected readonly tokenClass = tokenClass;

  private readonly injector = inject(Injector);
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('todoSearch');
  private readonly searchToggle = viewChild<ElementRef<HTMLButtonElement>>('searchToggle');

  /**
   * Aufgezogen ist die Suche, solange man darin ist — und solange sie etwas
   * filtert. Sonst schlösse ein Tipp daneben die Leiste, die Liste bliebe
   * gefiltert, und nichts zeigte mehr, warum Aufgaben fehlen.
   */
  private readonly expanded = signal(false);
  protected readonly searchOpen = computed(
    () => this.expanded() || this.searchTerm() !== '' || this.searchToken() !== null,
  );

  /** Gesucht wird in der gewählten Lasche — das sagt der Platzhalter. */
  protected readonly placeholder = computed(() => {
    switch (this.filter()) {
      case 'active':
        return 'Search active todos…';
      case 'completed':
        return 'Search done todos…';
      case 'favorites':
        return 'Search favorites…';
      default:
        return 'Search all todos…';
    }
  });

  /**
   * Position der aktiven Lasche. Treibt die gleitende Pille im Template: vier
   * gleich breite Laschen, deshalb reicht der Index — ohne Messen im DOM.
   */
  protected readonly tabIndex = computed(() => {
    switch (this.filter()) {
      case 'active':
        return 0;
      case 'completed':
        return 1;
      case 'favorites':
        return 2;
      default:
        return 3;
    }
  });

  /** „/" springt in die Suche — die Taste, die im Web überall Suchfelder öffnet. */
  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent): void {
    if (event.key !== '/') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    this.openSearch();
  }

  /**
   * Fokus noch im Klick, nicht nach dem Rendern: iOS öffnet die Tastatur nur
   * innerhalb der Geste. Das Feld ist dafür auch zugeklappt im DOM, nur
   * durchsichtig — ein verstecktes (visibility/display) nähme keinen Fokus.
   */
  openSearch(focus = true): void {
    this.expanded.set(true);
    if (focus) this.searchField()?.nativeElement.focus();
  }

  /** ✕ leert und klappt zu; der Fokus geht zurück auf die Lupe. */
  closeSearch(field: HTMLInputElement): void {
    this.clearSearch();
    field.value = '';
    this.expanded.set(false);
    field.blur();
    afterNextRender(() => this.searchToggle()?.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  /** Leer verlassen klappt zu; mit Suchbegriff bleibt die Leiste offen. */
  onBlur(): void {
    this.expanded.set(false);
  }

  /** Esc leert zuerst, das zweite Esc klappt zu. */
  onEscape(field: HTMLInputElement): void {
    if (this.searchTerm() || this.searchToken()) {
      this.clearSearch();
      field.value = '';
      return;
    }
    this.closeSearch(field);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.searchToken.set(null);
  }

  /** Ein vorn getipptes Präfix wird zum Filter-Zeichen, wie beim Anlegen. */
  onInput(field: HTMLInputElement): void {
    const { tokens, text } = splitTitle(field.value);
    if (tokens.length > 0) {
      this.searchToken.set(tokens[0]);
      field.value = text;
    }
    this.searchTerm.set(field.value);
  }

  /** Backspace ganz vorn nimmt das Zeichen weg. */
  onBackspace(event: Event, field: HTMLInputElement): void {
    if (this.searchToken() === null) return;
    if (field.selectionStart !== 0 || field.selectionEnd !== 0) return;
    event.preventDefault();
    this.searchToken.set(null);
  }
}
