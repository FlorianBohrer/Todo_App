import {
  Component,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo';
import { isTypingTarget } from '../../shared/keyboard';
import { Plus,LucideAngularModule } from "lucide-angular";

@Component({
  selector: 'app-todo-add',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './todo-add.html',
})
export class TodoAdd {
  protected readonly todoService = inject(TodoService);
  readonly Plus = Plus;

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

  addTodo() {
      const titles = this.parseTitles(this.newTitle);
      if (titles.length === 0) return;
      this.todoService.addTodos(titles);
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
