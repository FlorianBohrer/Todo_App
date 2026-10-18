import {ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo';
import { isTypingTarget } from '../../shared/keyboard';
import { stripPriorityPrefix, withTaskLevel } from '../../shared/title-priority';
import {
  TOKEN_DESCRIPTION,
  TOKEN_ICON,
  TitleToken,
  joinTitle,
  splitTitle,
  tokenClass,
  withToken,
} from '../../shared/title-token';
import { CornerDownRight, Plus, X, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-todo-add',
  imports: [FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-add.html',
  // Der Fokusring gehört dem Rahmen um Chip und Text. Die globale
  // :focus-visible-Regel steht ausserhalb der Tailwind-Schichten und schlüge
  // jede Utility — deshalb hier, mit der höheren Spezifität der Komponente.
  styles: `
    .todo-add-field:focus-within {
      outline: 2px solid var(--color-highlight2);
      outline-offset: 2px;
    }

    .todo-add-field textarea:focus-visible {
      outline: none;
    }
  `,
})
export class TodoAdd {
  protected readonly todoService = inject(TodoService);
  readonly Plus = Plus;
  protected readonly SubIcon = CornerDownRight;
  protected readonly ClearIcon = X;

  /** Die angeklickte Hauptaufgabe; neue Todos landen bei ihr. */
  protected readonly parent = this.todoService.activeParent;

  /** Ihr Titel ohne Präfix — im Feld steht nichts Technisches. */
  protected parentTitle(): string {
    const parent = this.parent();
    return parent ? stripPriorityPrefix(parent.title).split('\n')[0] : '';
  }

  newTitle = '';

  /**
   * Die getippten Präfixe, als Chips vor dem Feld — höchstens eine Priorität
   * und eine Gliederung.
   *
   * „/must " bleibt nicht als Text stehen: sobald das Leerzeichen dahinter
   * fällt, wird es zum Zeichen, und im Feld steht nur noch, worum es geht.
   * Gespeichert wird trotzdem mit Präfix — das trägt Sortierung und XP.
   */
  protected readonly tokens = signal<TitleToken[]>([]);

  /** Was die Vorlesesoftware zum Feld sagt: es selbst und seine Chips. */
  protected fieldLabel(): string {
    return ['New todo', ...this.tokens().map((t) => TOKEN_DESCRIPTION[t])].join(', ');
  }

  protected readonly tokenIcon = TOKEN_ICON;
  protected readonly tokenDescription = TOKEN_DESCRIPTION;
  protected readonly tokenClass = tokenClass;

  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('newTodoField');

  /** „n" für eine neue Aufgabe, ohne zur Maus zu greifen. */
  @HostListener('document:keydown', ['$event'])
  onNewTodoShortcut(event: KeyboardEvent): void {
    if (event.key !== 'n' && event.key !== 'N') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    this.field()?.nativeElement.focus();
  }

  /**
   * Anlegen — und zwar dort, wo es hingehoert.
   *
   * Ist eine Hauptaufgabe angeklickt, wird daraus ein Schritt von ihr: das
   * Praefix setzt die Einrueckung, die ID sagt, wohin in der Liste. Eine
   * Prioritaet kommt dazu, statt den Schritt aus seiner Hauptaufgabe zu
   * loesen; nur ein ausdruecklich getipptes „/main" macht daraus wieder eine
   * eigene Aufgabe (withTaskLevel).
   */
  addTodo() {
    const parent = this.parent();
    const tokens = this.tokens();
    const titles = this.parseTitles(this.newTitle).map((title) => {
      // Die Chips gelten für jede Zeile — wer drei Zeilen als Must einfügt,
      // meint drei Must-haves. Ein Präfix in der Zeile selbst gewinnt.
      const joined = joinTitle(tokens, title);
      return parent ? withTaskLevel(joined, 'sub') : joined;
    });
    if (titles.length === 0) return;

    this.todoService.addTodos(titles, parent?.id ?? null);
    this.newTitle = '';
    this.tokens.set([]);
  }

  /**
   * Jeder Tastendruck: steht vorn ein fertiges Präfix, wird es zum Chip. Ein
   * neues ersetzt das derselben Achse; „/must " und dann „/sub " sind zwei.
   */
  onInput(value: string): void {
    const { tokens, text } = splitTitle(value);
    if (tokens.length > 0) {
      this.tokens.update((current) => tokens.reduce(withToken, current));
      this.newTitle = text;
      // Direkt ins Feld: war es vorher leer und wird „/must " eingefügt, sähe
      // ngModel keinen neuen Wert (leer bleibt leer) und liesse den Text stehen.
      const field = this.field()?.nativeElement;
      if (field && field.value !== text) field.value = text;
      return;
    }
    this.newTitle = value;
  }

  /**
   * Backspace ganz vorn nimmt den letzten Chip weg — wie jedes andere Zeichen,
   * das links vom Cursor steht.
   */
  onBackspace(event: Event): void {
    const field = event.target as HTMLTextAreaElement;
    if (this.tokens().length === 0) return;
    if (field.selectionStart !== 0 || field.selectionEnd !== 0) return;

    event.preventDefault();
    this.tokens.update((current) => current.slice(0, -1));
  }

  clearToken(token: TitleToken): void {
    this.tokens.update((current) => current.filter((t) => t !== token));
    this.field()?.nativeElement.focus();
  }

  clearParent(): void {
    this.todoService.selectParent(null);
  }

  /** Escape im Feld: erst das Ziel loslassen, dann den Text samt Chip. */
  onEscape(): void {
    if (this.parent()) {
      this.clearParent();
      return;
    }
    this.newTitle = '';
    this.tokens.set([]);
  }

     private parseTitles(raw: string): string[] {
    return raw
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, '').trim())
      .filter((line) => line.length > 0);
  }

  /** Enter legt an; Shift+Enter fügt eine neue Zeile ein. */
  onEnterKey(event: Event) {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    this.addTodo();
  }

  autoGrow(event: Event){
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
}
