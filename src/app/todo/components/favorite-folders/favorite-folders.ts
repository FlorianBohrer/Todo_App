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
    const map: Record<string, string> = {
      violet:  'text-violet-300',
      emerald: 'text-emerald-300',
      rose:    'text-rose-300',
      orange:  'text-orange-300',
      amber:   'text-amber-300',
      teal:    'text-teal-300',
      sky:     'text-sky-300',
      fuchsia: 'text-fuchsia-300',
    };
    return map[color] ?? 'text-zinc-300';
  }

  bgClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'bg-violet-600/15',
      emerald: 'bg-emerald-600/15',
      rose:    'bg-rose-600/15',
      orange:  'bg-orange-600/15',
      amber:   'bg-amber-600/15',
      teal:    'bg-teal-600/15',
      sky:     'bg-sky-600/15',
      fuchsia: 'bg-fuchsia-600/15',
    };
    return map[color] ?? 'bg-highlight11';
  }

  /** Hintergrund des kleinen Icon-Quadrats — etwas kräftiger als die Kachel. */
  iconBoxClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'bg-violet-500/25',
      emerald: 'bg-emerald-500/25',
      rose:    'bg-rose-500/25',
      orange:  'bg-orange-500/25',
      amber:   'bg-amber-500/25',
      teal:    'bg-teal-500/25',
      sky:     'bg-sky-500/25',
      fuchsia: 'bg-fuchsia-500/25',
    };
    return map[color] ?? 'bg-zinc-500/25';
  }

  /** Füllung des Fortschrittsbalkens in der Folder-Farbe. */
  barClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'bg-violet-400',
      emerald: 'bg-emerald-400',
      rose:    'bg-rose-400',
      orange:  'bg-orange-400',
      amber:   'bg-amber-400',
      teal:    'bg-teal-400',
      sky:     'bg-sky-400',
      fuchsia: 'bg-fuchsia-400',
    };
    return map[color] ?? 'bg-zinc-400';
  }
}
