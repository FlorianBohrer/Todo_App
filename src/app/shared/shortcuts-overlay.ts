import {ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { isTypingTarget } from '../todo/shared/keyboard';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/**
 * Tastenkürzel zum Nachschlagen.
 *
 * Die App hat inzwischen ein gutes Dutzend davon. Ein Kürzel, das niemand
 * kennt, ist keins — deshalb steht hier alles an einer Stelle, erreichbar
 * über „?", die Taste, die im Web genau dafür da ist.
 */
@Component({
  selector: 'app-shortcuts-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shortcuts-overlay.html',
})
export class ShortcutsOverlay {
  readonly open = signal(false);

  protected readonly groups: ShortcutGroup[] = [
    {
      title: 'Anywhere',
      items: [
        { keys: ['?'], description: 'Show this list' },
        { keys: ['f'], description: 'Folders, open and close' },
        { keys: ['1'], description: 'List view' },
        { keys: ['2'], description: 'Week view' },
        { keys: ['3'], description: 'Plans view' },
        { keys: ['Esc'], description: 'Close what is open' },
      ],
    },
    {
      title: 'List',
      items: [
        { keys: ['n'], description: 'New todo' },
        { keys: ['/'], description: 'Search' },
        // Kein Tastenkürzel, aber dieselbe Sorte Wissen: getippte Konvention,
        // die man kennen muss, um sie zu nutzen. Hier sucht man danach.
        { keys: ['/must'], description: 'MoSCoW: without it the delivery is worthless' },
        { keys: ['/should'], description: 'MoSCoW: painful to drop, but there is a workaround' },
        { keys: ['/could'], description: 'MoSCoW: the contingency you drop when time runs short' },
        { keys: ["/won't"], description: 'MoSCoW: out of scope for now, on purpose' },
      ],
    },
    {
      title: 'Week',
      items: [
        { keys: ['←', '→'], description: 'Previous / next week' },
        { keys: ['t'], description: 'Back to this week' },
        { keys: ['Enter'], description: 'Add to a day, straight from its column' },
      ],
    },
    {
      title: 'Plans',
      items: [
        { keys: ['⌘', 'K'], description: 'Jump to a plan' },
        { keys: ['/'], description: 'Block commands, anywhere in a line' },
        { keys: ['[[' ], description: 'Link to another plan' },
        // Ohne Auswahl nehmen sie das Wort unter dem Cursor.
        { keys: ['⌘', 'B'], description: 'Bold' },
        { keys: ['⌘', 'I'], description: 'Italic' },
        { keys: ['⌘', 'U'], description: 'Underline' },
        { keys: ['⌘', 'X'], description: 'Strikethrough' },
      ],
    },
  ];

  toggle() { this.open.update((o) => !o); }
  close() { this.open.set(false); }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
      return;
    }

    // „?" ist je nach Tastaturlayout Shift+/ oder Shift+ß — event.key kennt
    // beide Wege und liefert am Ende dasselbe Zeichen.
    if (event.key !== '?') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    this.toggle();
  }
}
