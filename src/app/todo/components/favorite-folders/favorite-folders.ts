import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  LucideAngularModule,
  LucideIconData,
  Briefcase,
  Mountain,
  Sun,
  Star,
  CircleQuestionMark,
  Tag,
} from 'lucide-angular';
import { LabelService } from '../../services/label.service';
import { TodoService } from '../../services/todo';
import { folderColorClass } from '../../shared/folder-color';


@Component({
  selector: 'app-favorite-folders',
  imports: [LucideAngularModule],
  templateUrl: './favorite-folders.html',
  styleUrl: './favorite-folders.scss',
})
export class FavoriteFolders {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);

  protected readonly favorites = this.labelService.favoriteLabels;
  protected readonly activeLabelId = this.labelService.activeLabelId;
  protected readonly StarIcon = Star;

  /** Fortschritt aller favorisierten Todos (virtuelle "Favoriten"-Kachel). */
  protected readonly favoriteProgress = this.todoService.favoriteProgress;
  /** Aktiv, solange die Liste auf "favorites" gefiltert ist. */
  protected readonly favoritesActive = computed(
    () => this.todoService.filter() === 'favorites',
  );

  /** Fester Schlüssel der Favoriten-Todos-Kachel in celebrating/lastCompleted. */
  protected readonly FAVORITE_TODOS_KEY = '__favorite_todos__';

  /** Anzahl Kacheln (Folder-Favoriten + evtl. die Favoriten-Todos-Kachel). */
  protected readonly tileCount = computed(
    () => this.favorites().length + (this.favoriteProgress().total > 0 ? 1 : 0),
  );

  /** Folder, deren 100%-Animation gerade läuft. */
  private readonly celebrating = signal<ReadonlySet<string>>(new Set());

  /** Letzter bekannter Stand pro Folder, um den Übergang auf 100% zu erkennen. */
  private readonly lastCompleted = new Map<string, boolean>();

  constructor() {
    // Feuert nur beim ÜBERGANG auf 100% — nicht für Folder, die beim Laden
    // schon fertig sind, und nicht in Dauerschleife, solange 100% bestehen.
    effect(() => {
      for (const label of this.favorites()) {
        const p = this.todoService.progressFor(label.id);
        const isComplete = p.total > 0 && p.completed === p.total;
        const wasComplete = this.lastCompleted.get(label.id);

        if (wasComplete === false && isComplete) {
          this.celebrate(label.id);
        }
        this.lastCompleted.set(label.id, isComplete);
      }

      // Dieselbe Übergangs-Logik für die Favoriten-Todos-Kachel.
      const fav = this.favoriteProgress();
      const favComplete = fav.total > 0 && fav.completed === fav.total;
      const favWas = this.lastCompleted.get(this.FAVORITE_TODOS_KEY);
      if (favWas === false && favComplete) {
        this.celebrate(this.FAVORITE_TODOS_KEY);
      }
      this.lastCompleted.set(this.FAVORITE_TODOS_KEY, favComplete);
    });
  }

  /** Favoriten-Kachel an/aus: filtert die Liste auf favorisierte Todos. */
  selectFavorites(): void {
    this.todoService.filter.set(this.favoritesActive() ? 'all' : 'favorites');
  }

  private celebrate(id: string) {
    this.celebrating.update((set) => new Set(set).add(id));
    setTimeout(() => {
      this.celebrating.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }, 1800);
  }

  isCelebrating(id: string): boolean {
    return this.celebrating().has(id);
  }

toggleFavorite(id: string, event: Event) {
  event.stopPropagation();
  this.labelService.toggleFavorite(id);
}

  select(id: string) {
    this.labelService.selectLabel(this.activeLabelId() === id ? null : id);
  }

  progress(labelId: string) {
    return this.todoService.progressFor(labelId);
  }

  private readonly iconMap: Record<string, LucideIconData> = {
    'briefcase': Briefcase,
    'mountain': Mountain,
    'sun': Sun,
    'question-mark-circle': CircleQuestionMark,
    'tag': Tag,
  };

  iconFor(icon: string): LucideIconData {
    return this.iconMap[icon] ?? Tag;
  }

  textClass(color: string): string {
    return folderColorClass(color, 'text');
  }

  bgClass(color: string): string {
    return folderColorClass(color, 'bg');
  }

  iconBoxClass(color: string): string {
    return folderColorClass(color, 'iconBox');
  }

  barClass(color: string): string {
    return folderColorClass(color, 'bar');
  }
}
