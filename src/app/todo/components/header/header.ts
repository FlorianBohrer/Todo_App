import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

/**
 * Der Seitentitel — und damit die Antwort auf „wo bin ich".
 *
 * Er zeigt denselben Folder wie die Kachel, aus der man kam: dasselbe Symbol,
 * denselben Sammlungs-Chip, dieselbe Farbe. Vorher stand hier der rohe Name,
 * also „privat: privat" in einem Zug — was auf der Kachel als Chip plus Name
 * gelesen wird, war oben eine Zeichenkette mit einem Doppelpunkt darin.
 *
 * Die Farbe traegt Text und Symbol, nicht die Flaeche: der Grund bleibt
 * dunkel. Ein eingefaerbter Seitenhintergrund macht aus einem Akzent eine
 * Stimmung, und die will hier niemand pro Folder wechseln.
 */
@Component({
  selector: 'app-header',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
})
export class Header {
  @Input() title = 'Tasks';
  /** Die Sammlung vor dem Doppelpunkt, als Chip ueber dem Namen. */
  @Input() prefix: string | null = null;
  @Input() icon: LucideIconData | null = null;
  @Input() accentClass = 'text-text';
  @Input() chipClass = '';
  @Input() tileClass = '';
}
