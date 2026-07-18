import { LabelService } from '../../services/label.service';
import { Component, computed, inject, HostListener, signal } from '@angular/core';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop } from '@angular/cdk/drag-drop';
import { TodoService } from '../../services/todo';   // Pfad ggf. anpassen
import { folderColorClass } from '../../shared/folder-color';
import {
  LucideAngularModule,
  GripVertical,
  Search,
  Star,
} from 'lucide-angular';

@Component({
  selector: 'app-categories-overlay',
  imports: [LucideAngularModule, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './categories-overlay.html',
})
export class CategoriesOverlay {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);

  protected readonly StarIcon = Star;
  protected readonly GripIcon = GripVertical;
  protected readonly SearchIcon = Search;
  protected readonly favoritesFull = this.labelService.favoritesFull;

  protected readonly labels        = this.labelService.labels;
  protected readonly isOpen        = this.labelService.isOverlayOpen;
  protected readonly activeLabelId = this.labelService.activeLabelId;
  protected readonly palette = ['rose', 'orange', 'amber', 'emerald', 'teal', 'sky', 'violet', 'fuchsia'];
  protected readonly draftColor = signal('rose');

  // ---- Suche ----
  protected readonly searchTerm = signal('');
  protected readonly isSearching = computed(() => this.searchTerm().trim().length > 0);

  protected readonly visibleLabels = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.labels();
    return this.labels().filter((l) => l.name.toLowerCase().includes(term));
  });

  clearSearch() {
    this.searchTerm.set('');
  }

  // ---- Sortieren ----
  // Beim Suchen ist Sortieren gesperrt, sonst würden sich die Indizes der
  // gefilterten Liste nicht auf die echte Reihenfolge übertragen lassen.
  drop(event: CdkDragDrop<unknown>) {
    this.labelService.reorderLabels(event.previousIndex, event.currentIndex);
  }

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
    return folderColorClass(color, 'bg');
  }

  textClass(color: string): string {
    return folderColorClass(color, 'text');
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