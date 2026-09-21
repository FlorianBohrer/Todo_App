import {ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, ChevronDown, Target } from 'lucide-angular';
import { TodoService } from '../../services/todo';
import { Todo } from '../../model/todo.model';
import {
  dailyLoad,
  focusReason,
  moscowBalance,
  rankForFocus,
  unplannedImportant,
  MUST_SHARE_LIMIT,
} from '../../shared/focus';
import { scheduleOptions } from '../../shared/schedule';
import { stripPriorityPrefix } from '../../shared/title-priority';

/** Wie viele Vorschläge oben stehen. Mehr als drei ist wieder eine Liste. */
const SUGGESTIONS = 3;

const COLLAPSED_KEY = 'todo.focus.collapsed';

/**
 * „Was jetzt?" — beantwortet aus dem, was zur Priorisierung erforscht ist.
 * Die Begründungen stehen in shared/focus.ts, die Kurzfassung im Panel selbst:
 * eine Rangfolge, die niemand nachvollziehen kann, ist eine Zumutung.
 */
@Component({
  selector: 'app-focus-panel',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './focus-panel.html',
})
export class FocusPanel {
  private readonly todoService = inject(TodoService);

  protected readonly FocusIcon = Target;
  protected readonly ChevronIcon = ChevronDown;

  private readonly scoped = this.todoService.scopedTodos;

  protected readonly collapsed = signal(readCollapsed());

  /** Die drei, die als Nächstes dran sind. */
  protected readonly suggestions = computed(() =>
    rankForFocus(this.scoped()).slice(0, SUGGESTIONS),
  );

  /** Tagesbilanz gegen den eigenen Schnitt — Außensicht statt Bauchgefühl. */
  protected readonly load = computed(() => dailyLoad(this.scoped()));

  /** Wichtiges ohne Tag: die Lücke zwischen Vorsatz und Umsetzungsabsicht. */
  protected readonly unplanned = computed(() => unplannedImportant(this.scoped()));

  /** MoSCoW-Balance — ist alles ein Must, ist nichts eins. */
  protected readonly balance = computed(() => moscowBalance(this.scoped()));
  protected readonly mustPercent = computed(() => Math.round(this.balance().mustShare * 100));
  protected readonly mustLimitPercent = Math.round(MUST_SHARE_LIMIT * 100);

  /** Ohne offene Aufgaben hat das Panel nichts zu sagen. */
  protected readonly hasSomethingToSay = computed(() => this.suggestions().length > 0);

  protected readonly dayChoices = computed(() => scheduleOptions().slice(0, 2));

  protected readonly explaining = signal(false);

  toggleCollapsed() {
    this.collapsed.update((value) => !value);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      /* Merken ist Komfort, kein Muss. */
    }
  }

  toggleExplaining() {
    this.explaining.update((value) => !value);
  }

  title(todo: Todo): string {
    return stripPriorityPrefix(todo.title).split('\n')[0].trim();
  }

  reason(todo: Todo): string {
    return focusReason(todo);
  }

  complete(id: string) {
    this.todoService.toggleTodo(id);
  }

  plan(id: string, iso: string) {
    this.todoService.scheduleTodo(id, iso);
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}
