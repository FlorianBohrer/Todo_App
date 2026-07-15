import { Component, inject } from '@angular/core';
import { LabelService } from '../../services/label.service';

/**
 * Kacheln der favorisierten Folder — werden in jeder Ansicht über der
 * Todo-Liste angezeigt. Klick wählt den Folder aus, erneuter Klick hebt
 * die Auswahl wieder auf (zurück zu "All Tasks").
 */
@Component({
  selector: 'app-favorite-folders',
  templateUrl: './favorite-folders.html',
})
export class FavoriteFolders {
  private readonly labelService = inject(LabelService);

  protected readonly favorites = this.labelService.favoriteLabels;
  protected readonly activeLabelId = this.labelService.activeLabelId;

  select(id: string) {
    this.labelService.selectLabel(this.activeLabelId() === id ? null : id);
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
}
