import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TodoService } from '../../services/todo';
import { LabelService } from '../../services/label.service';
import { folderColorClass } from '../../shared/folder-color';
import { splitFolderName } from '../../shared/folder-name';
import { dailyLoad } from '../../shared/focus';
import { ProgressRing } from '../progress-ring/progress-ring';

/**
 * Der Auftakt der Liste.
 *
 * Vorher stand hier ein Balken mit Farbverlauf von Cyan über Teal nach
 * Emerald und daneben eine Prozentzahl. Der Verlauf hatte mit nichts in dieser
 * App zu tun: nicht mit der Farbe des offenen Ordners, nicht mit der Farbe der
 * Ansicht. Er war Dekoration, die sich als Information ausgab — und
 * ausgerechnet drei Farben für eine einzige Zahl.
 *
 * Jetzt: eine Begrüßung, die Farbe des offenen Ordners, der Ring, und die eine
 * Zeile, die diese App von anderen unterscheidet — „3 of 7 today · you usually
 * finish 5". Keine erfundene Obergrenze, sondern der eigene Median.
 */
@Component({
  selector: 'app-todo-stats',
  imports: [ProgressRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-stats.html',
})
export class TodoStats {
  private readonly todoService = inject(TodoService);
  private readonly labelService = inject(LabelService);

  protected readonly stats = this.todoService.stats;

  /** Der offene Ordner, oder null für „alle Aufgaben". */
  private readonly activeLabel = computed(() => {
    const id = this.labelService.activeLabelId();
    return id === null ? null : this.labelService.labelById(id) ?? null;
  });

  /**
   * Der Name des Ausschnitts, über den diese Zeile spricht.
   *
   * Dieselbe Zerlegung wie auf der Ordnerkachel: „projekt: Bozen" wird zum
   * Namen ohne das Prefix, sonst stünde hier zweimal dasselbe Wort.
   */
  protected readonly scopeName = computed(() => {
    const label = this.activeLabel();
    return label ? splitFolderName(label.name).name : null;
  });

  /** Der Auftakt nimmt die Farbe des offenen Ordners an — sonst die der Ansicht. */
  protected readonly accentClass = computed(() => {
    const label = this.activeLabel();
    return label ? folderColorClass(label.color, 'text') : 'text-brand-2';
  });

  /**
   * Tageszeit-Begrüßung.
   *
   * Der ruhige Auftakt aus dem Entwurf — und der einzige Ort in der App, an
   * dem etwas steht, das nicht über Aufgaben spricht. Das ist der Punkt: man
   * kommt an, bevor man anfängt.
   */
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Still up';
    if (hour < 11) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Winding down';
  });

  protected readonly load = computed(() => dailyLoad(this.todoService.scopedWithArchive()));

  /**
   * Was heute ansteht — oder, wenn für heute nichts geplant ist, wie der
   * ganze Ausschnitt steht.
   *
   * Zwei Sätze für zwei verschiedene Lagen. „Nothing planned for today" ist
   * eine Auskunft; sie durch „0 of 0" zu ersetzen wäre eine Rechnung über
   * eine leere Menge.
   */
  protected readonly todayLine = computed(() => {
    const load = this.load();
    const planned = load.open + load.done;

    if (planned === 0) {
      const open = this.stats().active;
      if (open === 0) return 'Nothing planned for today.';
      return open === 1
        ? 'Nothing planned for today: one thing is waiting.'
        : `Nothing planned for today: ${open} things are waiting.`;
    }

    if (load.open === 0) return 'Everything planned for today is done.';

    const parts = [`${load.done} of ${planned} today`];
    if (load.typical !== null && load.overCommitted) {
      // Die Außensicht gegen den Planungsfehlschluss: der eigene Median, nicht
      // ein Ziel. Nur wenn der Plan darüber liegt — sonst wäre es ein Vorwurf
      // ohne Anlass.
      parts.push(`you usually finish ${load.typical}`);
    }
    return parts.join(' · ');
  });

  /** Hebt die Zeile hervor, wenn der Plan über dem eigenen Schnitt liegt. */
  protected readonly todayLineClass = computed(() =>
    this.load().overCommitted ? 'text-amber-300' : 'text-muted',
  );
}
