/**
 * Tastenkürzel als Daten.
 *
 * Vorher stand jedes Kürzel als Zeichenvergleich mitten im Handler, der es
 * ausführt (`event.key === 'f'`). Damit war es weder anzeigbar noch änderbar,
 * und zwei gleiche Kürzel an verschiedenen Stellen wären niemandem aufgefallen.
 *
 * Hier liegen sie als Wertobjekte. Vergleichen, anzeigen, auf Konflikte prüfen
 * und aus einem Tastendruck erzeugen sind reine Funktionen und ohne Browser
 * prüfbar — genau das braucht es, wenn der Nutzer sie selbst setzen darf.
 */

/** Alles, was sich mit einer Taste auslösen lässt und umbelegbar ist. */
export type ShortcutAction =
  | 'view.list'
  | 'view.week'
  | 'view.plans'
  | 'folders.toggle'
  | 'help.toggle'
  | 'format.bold'
  | 'format.italic'
  | 'format.underline'
  | 'format.strike';

export interface Binding {
  /** Die Taste selbst, klein geschrieben. Etwa 'b', '1', '/', 'escape'. */
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ShortcutInfo {
  action: ShortcutAction;
  label: string;
  /** Wo es gilt — nur für die Anzeige, nicht für die Auswertung. */
  group: 'Anywhere' | 'Plans';
}

/**
 * Die Vorgaben.
 *
 * Die Formatierung liegt bewusst auf ⌘⇧ und nicht auf dem gewohnten ⌘B: die
 * einfachen Varianten kollidieren je nach Browser mit dessen eigenen Kürzeln
 * (⌘U öffnet den Quelltext, ⌘I verschickt die Seite per Mail). Wer sie
 * trotzdem will, stellt sie um — dafür gibt es die Einstellung.
 */
export const DEFAULT_BINDINGS: Record<ShortcutAction, Binding> = {
  'view.list': bind('1'),
  'view.week': bind('2'),
  'view.plans': bind('3'),
  'folders.toggle': bind('f'),
  'help.toggle': bind('?', { shift: true }),
  'format.bold': bind('b', { meta: true, shift: true }),
  'format.italic': bind('i', { meta: true, shift: true }),
  'format.underline': bind('u', { meta: true, shift: true }),
  'format.strike': bind('x', { meta: true, shift: true }),
};

export const SHORTCUT_INFO: ShortcutInfo[] = [
  { action: 'help.toggle', label: 'Show this list', group: 'Anywhere' },
  { action: 'folders.toggle', label: 'Folders, open and close', group: 'Anywhere' },
  { action: 'view.list', label: 'List view', group: 'Anywhere' },
  { action: 'view.week', label: 'Week view', group: 'Anywhere' },
  { action: 'view.plans', label: 'Plans view', group: 'Anywhere' },
  { action: 'format.bold', label: 'Bold', group: 'Plans' },
  { action: 'format.italic', label: 'Italic', group: 'Plans' },
  { action: 'format.underline', label: 'Underline', group: 'Plans' },
  { action: 'format.strike', label: 'Strikethrough', group: 'Plans' },
];

function bind(key: string, mods: Partial<Omit<Binding, 'key'>> = {}): Binding {
  return {
    key,
    meta: mods.meta ?? false,
    ctrl: mods.ctrl ?? false,
    shift: mods.shift ?? false,
    alt: mods.alt ?? false,
  };
}

/**
 * Passt dieser Tastendruck zu diesem Kürzel?
 *
 * Alle vier Zusatztasten werden geprüft, auch die nicht verlangten. Sonst
 * löste ⌘⇧B auch ⇧B aus, und das Grossschreiben eines B würde Text fett
 * machen.
 */
export function matches(binding: Binding, event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === binding.key &&
    event.metaKey === binding.meta &&
    event.ctrlKey === binding.ctrl &&
    event.shiftKey === binding.shift &&
    event.altKey === binding.alt
  );
}

/** Reine Zusatztasten sind kein Kürzel — man haelt sie ja nur gedrueckt. */
const MODIFIER_KEYS = new Set(['shift', 'control', 'meta', 'alt', 'dead']);

/**
 * Aus einem Tastendruck ein Kürzel machen, für die Aufnahme in den
 * Einstellungen. null, wenn der Druck keins ergibt.
 */
export function bindingFromEvent(event: KeyboardEvent): Binding | null {
  const key = event.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return null;

  // Ohne jede Zusatztaste sind nur Zeichen sinnvoll, die man nicht staendig
  // tippt. Escape und Tab gehoeren dem Browser und dem Dialog.
  if (key === 'escape' || key === 'tab') return null;

  return {
    key,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

/** Zum Anzeigen: eine Taste je Kästchen, in der Reihenfolge wie auf Tastaturen. */
export function formatBinding(binding: Binding): string[] {
  const keys: string[] = [];
  if (binding.ctrl) keys.push('⌃');
  if (binding.alt) keys.push('⌥');
  if (binding.shift) keys.push('⇧');
  if (binding.meta) keys.push('⌘');

  const named: Record<string, string> = {
    arrowleft: '←',
    arrowright: '→',
    arrowup: '↑',
    arrowdown: '↓',
    ' ': 'Space',
    enter: '↵',
  };
  keys.push(named[binding.key] ?? binding.key.toUpperCase());
  return keys;
}

export function sameBinding(a: Binding, b: Binding): boolean {
  return (
    a.key === b.key &&
    a.meta === b.meta &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

/**
 * Wem gehört dieses Kürzel schon? null, wenn es frei ist.
 *
 * Ohne diese Prüfung liesse sich ein Kürzel doppelt vergeben, und welche der
 * beiden Handlungen dann passiert, haengt an der Reihenfolge im Code. Das ist
 * keine Einstellung, das ist ein Ratespiel.
 */
export function findConflict(
  bindings: Record<ShortcutAction, Binding>,
  action: ShortcutAction,
  candidate: Binding,
): ShortcutAction | null {
  for (const [other, binding] of Object.entries(bindings) as [
    ShortcutAction,
    Binding,
  ][]) {
    if (other !== action && sameBinding(binding, candidate)) return other;
  }
  return null;
}

/**
 * Gespeicherte Kürzel einlesen und mit den Vorgaben auffüllen.
 *
 * Fehlt ein Eintrag oder ist er kaputt, gilt die Vorgabe. Eine neue Handlung
 * in einer neuen Version darf nicht dazu führen, dass gar nichts mehr geht.
 */
export function mergeBindings(stored: unknown): Record<ShortcutAction, Binding> {
  const result = { ...DEFAULT_BINDINGS };
  if (!stored || typeof stored !== 'object') return result;

  for (const action of Object.keys(DEFAULT_BINDINGS) as ShortcutAction[]) {
    const value = (stored as Record<string, unknown>)[action];
    if (isBinding(value)) result[action] = value;
  }
  return result;
}

function isBinding(value: unknown): value is Binding {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b['key'] === 'string' &&
    b['key'].length > 0 &&
    typeof b['meta'] === 'boolean' &&
    typeof b['ctrl'] === 'boolean' &&
    typeof b['shift'] === 'boolean' &&
    typeof b['alt'] === 'boolean'
  );
}
