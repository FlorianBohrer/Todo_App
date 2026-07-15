import { LabelService } from '../../services/label.service';
import { Component, inject, HostListener, signal } from '@angular/core';
import { TodoService } from '../../services/todo';   // Pfad ggf. anpassen


@Component({
  selector: 'app-categories-overlay',
  templateUrl: './categories-overlay.html',
})
export class CategoriesOverlay {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);

  protected readonly labels        = this.labelService.labels;
  protected readonly isOpen        = this.labelService.isOverlayOpen;
  protected readonly activeLabelId = this.labelService.activeLabelId;
  protected readonly palette = ['rose', 'orange', 'amber', 'emerald', 'teal', 'sky', 'violet', 'fuchsia'];
  protected readonly draftColor = signal('rose');

  add(name: string) {
    this.labelService.addLabel(name, this.draftColor());
  }

  close() {
    this.labelService.closeOverlay();
  }

  select(id: string | null) {
    this.labelService.selectLabel(id);
  }

  toggleFavorite(id: string, event: Event) {
    event.stopPropagation(); // verhindert, dass select(id) feuert
    this.labelService.toggleFavorite(id);
  }

  bgClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'bg-violet-600/15',
      emerald: 'bg-emerald-600/15',
      rose:    'bg-rose-600/15',
      orange:   'bg-orange-600/15',

      amber:   'bg-amber-600/15',
      teal:    'bg-teal-600/15',
      sky:     'bg-sky-600/15',
      fuchsia: 'bg-fuchsia-600/15',
    };
    return map[color] ?? 'bg-highlight11';
  }

  textClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'text-violet-300',
      emerald: 'text-emerald-300',
      rose:    'text-rose-300',
      orange:   'text-orange-300',

      amber:   'text-amber-300',
      teal:    'text-teal-300',
      sky:     'text-sky-300',
      fuchsia: 'text-fuchsia-300',
    };
    return map[color] ?? 'text-zinc-300';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.close();
    }
  }

  protected readonly confirmDeleteId = signal<string | null>(null);

askDelete(id: string, event: Event) {
  event.stopPropagation();          // verhindert, dass select(id) feuert
  this.confirmDeleteId.set(id);
}

cancelDelete(event: Event) {
  event.stopPropagation();
  this.confirmDeleteId.set(null);
}

confirmDelete(id: string, event: Event) {
  event.stopPropagation();
  this.todoService.clearLabel(id);  // TodoService injecten nicht vergessen
  this.labelService.removeLabel(id);
  this.confirmDeleteId.set(null);
}
}