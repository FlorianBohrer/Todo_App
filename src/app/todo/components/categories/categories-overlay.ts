import { LabelService } from '../../services/label.service';
import { Component, computed, inject, HostListener, signal } from '@angular/core';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop } from '@angular/cdk/drag-drop';
import { TodoService } from '../../services/todo';   // Pfad ggf. anpassen
import { folderColorClass } from '../../shared/folder-color';
import { splitFolderName } from '../../shared/folder-name';
import { viewChild, ElementRef } from '@angular/core';

import {
  LucideAngularModule,
  GripVertical,
  Search,
  Star,
  Pencil,
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
  protected readonly PencilIcon = Pencil;
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

  protected readonly editingId     = signal<string | null>(null);
  protected readonly colorPickerId = signal<string | null>(null);
  protected readonly confirmDeleteId = signal<string | null>(null);

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('rename');

/** The pencil is the only way in and out of edit mode. */
toggleEdit(id: string, event: Event) {
  event.stopPropagation();
  const opening = this.editingId() !== id;
  this.editingId.set(opening ? id : null);

  if (opening) {
    requestAnimationFrame(() => {
      const el = this.renameInput()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }
}

stopEditing(event: Event) {
  event.stopPropagation();
  this.editingId.set(null);
}

/** Saves on blur and on Enter — but only when the name really changed. */
commitRename(id: string, current: string, value: string, event: Event) {
  event.stopPropagation();
  const next = value.trim();
  if (!next || next === current) return;
  this.labelService.updateLabel(id, { name: next });
}

cancelEdit(input: HTMLInputElement, original: string, event: Event) {
  event.stopPropagation();
  input.value = original;
  this.editingId.set(null);
}



/** While editing, a click on the card must not switch the filter. */
onCardClick(id: string) {
  if (this.editingId() === id) return;
  this.select(id);
}









cancelRename(event: Event) {
  event.stopPropagation();             // keeps Escape from closing the overlay
  this.editingId.set(null);
}



pickColor(id: string, color: string, event: Event) {
  event.stopPropagation();
  this.labelService.updateLabel(id, { color });
  this.colorPickerId.set(null);
}

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

  /** Gedaempfter Hintergrund fuer den Typ-Chip, in der Folder-Farbe. */
  chipClass(color: string): string {
    return (
      folderColorClass(color, 'iconBox') + ' ' + folderColorClass(color, 'text')
    );
  }

  /** Prefix wie projekt: vom Namen trennen - siehe folder-name.ts. */
  nameParts(raw: string) {
    return splitFolderName(raw);
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