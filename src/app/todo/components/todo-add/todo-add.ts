import {ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo';
import { isTypingTarget } from '../../shared/keyboard';
import { stripPriorityPrefix, withTaskLevel } from '../../shared/title-priority';
import { CornerDownRight, Plus, X, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-todo-add',
  imports: [FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-add.html',
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
   * Praefix setzt die Einrueckung, die ID sagt, wohin in der Liste. Ein selbst
   * getipptes Praefix bleibt stehen (withTaskLevel) — wer ausdruecklich
   * „/must" schreibt, meint das auch.
   */
  addTodo() {
    const parent = this.parent();
    const titles = this.parseTitles(this.newTitle).map((title) =>
      parent ? withTaskLevel(title, 'sub') : title,
    );
    if (titles.length === 0) return;

    this.todoService.addTodos(titles, parent?.id ?? null);
    this.newTitle = '';
  }

  clearParent(): void {
    this.todoService.selectParent(null);
  }

  /** Escape im Feld: erst das Ziel loslassen, dann den Text. */
  onEscape(): void {
    if (this.parent()) {
      this.clearParent();
      return;
    }
    this.newTitle = '';
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
