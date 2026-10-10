import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, ChevronDown } from 'lucide-angular';

import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { folderColorClass } from '../../shared/folder-color';
import { splitFolderName } from '../../shared/folder-name';
import { weeklyReview } from '../../shared/review';
import { fromISODate } from '../../shared/week';

const COLLAPSED_KEY = 'todo.review.collapsed';

/**
 * Der Wochenrückblick: was letzte Woche fertig wurde, nach Ordnern.
 *
 * Kein Punktestand, keine Abzeichen, keine Serie — eine Liste. Rückblick
 * wirkt, weil er zeigt, was man geleistet hat, statt es in eine Zahl zu
 * übersetzen; und weil er nichts belohnt, lässt er sich nicht ausnutzen.
 *
 * Die ganze Auskunft hängt an completedAt. Hat die App keine
 * Erledigungszeiten, sagt sie das — statt über den geplanten Tag zu rechnen
 * und das Ergebnis „geschafft" zu nennen.
 */
@Component({
  selector: 'app-weekly-review',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weekly-review.html',
})
export class WeeklyReview {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);

  protected readonly ChevronIcon = ChevronDown;

  protected readonly collapsed = signal(readCollapsed());

  /**
   * Über ALLE Todos, nicht über den offenen Ordner.
   *
   * Ein Rückblick auf eine Woche ist ein Rückblick auf die Woche, nicht auf
   * einen Ausschnitt davon — und die Aufteilung nach Ordnern ist ja gerade
   * das, was er zeigt.
   */
  protected readonly review = computed(() => weeklyReview(this.todoService.withArchive()));

  /** Gibt es überhaupt Erledigungszeiten? Ohne sie gibt es diesen Block nicht. */
  protected readonly hasCompletionTimes = this.todoService.hasCompletionTimes;

  /** „Sep 28 – Oct 4" */
  protected readonly range = computed(() => {
    const review = this.review();
    if (!review) return '';

    const from = fromISODate(review.from);
    const to = fromISODate(review.to);
    const sameMonth = from.getMonth() === to.getMonth();

    const fmt = (date: Date, withMonth: boolean) =>
      withMonth
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : String(date.getDate());

    return `${fmt(from, true)} – ${fmt(to, !sameMonth)}`;
  });

  /** Die Gruppen mit Namen und Farbe, bereit zum Zeichnen. */
  protected readonly groups = computed(() => {
    const review = this.review();
    if (!review) return [];

    const biggest = Math.max(...review.groups.map((group) => group.count), 1);

    return review.groups.map((group) => {
      const label = group.labelId === null ? null : this.labelService.labelById(group.labelId);

      return {
        key: group.labelId ?? '__none__',
        count: group.count,
        name: label ? splitFolderName(label.name).name : 'No folder',
        colorClass: label ? folderColorClass(label.color, 'text') : 'text-subtle',
        // Anteil am größten Balken, nicht an der Gesamtzahl: sonst wäre bei
        // acht gleich großen Ordnern jeder Balken ein Strich.
        share: Math.round((group.count / biggest) * 100),
      };
    });
  });

  /** Seit wann die Aufzeichnung reicht, als lesbares Datum. */
  protected readonly incompleteSince = computed(() => {
    const since = this.review()?.incompleteSince;
    if (!since) return null;
    return fromISODate(since).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  });

  toggleCollapsed() {
    this.collapsed.update((value) => !value);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      /* Merken ist Komfort, kein Muss. */
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}
