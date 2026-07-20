import { Component, effect, inject, signal } from '@angular/core';
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
    });
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
