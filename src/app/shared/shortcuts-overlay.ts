import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isTypingTarget } from '../todo/shared/keyboard';
import { ShortcutService } from './shortcut.service';
import {
  Binding,
  DEFAULT_BINDINGS,
  SHORTCUT_INFO,
  ShortcutAction,
  ShortcutInfo,
  bindingFromEvent,
  formatBinding,
  sameBinding,
} from './shortcuts';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/**
 * Tastenkürzel zum Nachschlagen — und zum Ändern.
 *
 * Die App hat ein gutes Dutzend davon. Ein Kürzel, das niemand kennt, ist
 * keins; deshalb steht hier alles an einer Stelle, erreichbar über „?", die
 * Taste, die im Web genau dafür da ist.
 *
 * Geändert wird dort, wo man nachschlägt. Eine eigene Einstellungsseite wäre
 * ein zweiter Ort für dieselbe Sache, und man sucht die Belegung ohnehin
 * genau dann, wenn man sie ändern will.
 */
@Component({
  selector: 'app-shortcuts-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shortcuts-overlay.html',
})
export class ShortcutsOverlay {
  private readonly shortcuts = inject(ShortcutService);

  readonly open = signal(false);

  /** Handlung, deren Taste gerade aufgenommen wird. null = niemand. */
  protected readonly recording = signal<ShortcutAction | null>(null);

  /** Meldung nach einem misslungenen Versuch, etwa bei Doppelbelegung. */
  protected readonly problem = signal<string | null>(null);

  protected readonly isCustomised = this.shortcuts.isCustomised;

  /** Die änderbaren Kürzel, nach Bereich gebündelt. */
  protected readonly editable = computed(() => {
    const bindings = this.shortcuts.all();
    const groups = new Map<string, (ShortcutInfo & { keys: string[]; custom: boolean })[]>();

    for (const info of SHORTCUT_INFO) {
      const binding = bindings[info.action];
      const row = {
        ...info,
        keys: formatBinding(binding),
        custom: !sameBinding(binding, DEFAULT_BINDINGS[info.action]),
      };
      groups.set(info.group, [...(groups.get(info.group) ?? []), row]);
    }

    return [...groups.entries()].map(([title, items]) => ({ title, items }));
  });

  /**
   * Was sich nicht umbelegen lässt.
   *
   * Nicht aus Bequemlichkeit: „/" und „[[" sind keine Tastenkürzel, sondern
   * getippte Zeichen, die im Text eine Bedeutung haben. Sie umzubelegen hiesse,
   * die Syntax zu ändern, nicht eine Taste. Escape gehört dem Dialog.
   */
  protected readonly fixed: ShortcutGroup[] = [
    {
      title: 'Anywhere',
      items: [{ keys: ['Esc'], description: 'Close what is open' }],
    },
    {
      title: 'List',
      items: [
        { keys: ['n'], description: 'New todo' },
        { keys: ['/'], description: 'Search' },
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
        { keys: ['[['], description: 'Link to another plan' },
      ],
    },
  ];

  toggle() {
    this.open.update((o) => !o);
    this.stopRecording();
  }

  close() {
    this.open.set(false);
    this.stopRecording();
  }

  // ---- Umbelegen ----

  startRecording(action: ShortcutAction) {
    this.problem.set(null);
    this.recording.set(action);

    // In der Aufnahmephase gehoert JEDER Tastendruck der Aufnahme. Der
    // Listener laeuft in der Capture-Phase und stoppt dort: sonst wuerde die
    // gedrueckte Taste nebenbei noch ihre alte Handlung ausloesen, und man
    // wechselt beim Belegen von „2" versehentlich in die Wochenansicht.
    document.addEventListener('keydown', this.capture, true);
  }

  private stopRecording() {
    if (this.recording() !== null) {
      document.removeEventListener('keydown', this.capture, true);
    }
    this.recording.set(null);
  }

  private readonly capture = (event: KeyboardEvent) => {
    const action = this.recording();
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      this.stopRecording();
      return;
    }

    const binding = bindingFromEvent(event);
    if (!binding) return; // reine Zusatztaste: der Nutzer sucht noch

    const conflict = this.shortcuts.set(action, binding);
    if (conflict) {
      this.problem.set(
        `${formatBinding(binding).join(' ')} is already used by "${this.labelOf(conflict)}"`,
      );
      return;
    }

    this.stopRecording();
  };

  resetOne(action: ShortcutAction) {
    this.shortcuts.reset(action);
    this.problem.set(null);
  }

  resetAll() {
    this.shortcuts.resetAll();
    this.problem.set(null);
  }

  private labelOf(action: ShortcutAction): string {
    return SHORTCUT_INFO.find((i) => i.action === action)?.label ?? action;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
      return;
    }

    if (isTypingTarget(event.target)) return;
    if (this.shortcuts.match(event) !== 'help.toggle') return;

    event.preventDefault();
    this.toggle();
  }
}
