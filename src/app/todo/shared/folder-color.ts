/**
 * Zentrale Zuordnung Folder-Farbe -> Tailwind-Klasse.
 *
 * Vorher lagen diese Maps fast identisch in vier Komponenten. Eine neue Farbe
 * zu ergänzen heißt jetzt: hier eine Zeile pro Variante, sonst nichts.
 *
 * Die Klassen MÜSSEN literal dastehen, sonst findet Tailwinds Scanner sie nicht
 * (kein `bg-${color}-600` zusammenbauen).
 */
export type FolderColorVariant =
  | 'bg'       // Kachel-/Karten-Hintergrund
  | 'text'     // Text in Folder-Farbe
  | 'iconBox'  // Hintergrund des Icon-Quadrats
  | 'bar'      // Füllung des Fortschrittsbalkens
  | 'dot'      // Farbpunkt
  | 'border';  // Rahmen

const CLASSES: Record<FolderColorVariant, Record<string, string>> = {
  bg: {
    violet:  'bg-violet-600/15',
    emerald: 'bg-emerald-600/15',
    rose:    'bg-rose-600/15',
    orange:  'bg-orange-600/15',
    amber:   'bg-amber-600/15',
    teal:    'bg-teal-600/15',
    sky:     'bg-sky-600/15',
    fuchsia: 'bg-fuchsia-600/15',
  },
  text: {
    violet:  'text-violet-300',
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
    orange:  'text-orange-300',
    amber:   'text-amber-300',
    teal:    'text-teal-300',
    sky:     'text-sky-300',
    fuchsia: 'text-fuchsia-300',
  },
  iconBox: {
    violet:  'bg-violet-500/25',
    emerald: 'bg-emerald-500/25',
    rose:    'bg-rose-500/25',
    orange:  'bg-orange-500/25',
    amber:   'bg-amber-500/25',
    teal:    'bg-teal-500/25',
    sky:     'bg-sky-500/25',
    fuchsia: 'bg-fuchsia-500/25',
  },
  bar: {
    violet:  'bg-violet-400',
    emerald: 'bg-emerald-400',
    rose:    'bg-rose-400',
    orange:  'bg-orange-400',
    amber:   'bg-amber-400',
    teal:    'bg-teal-400',
    sky:     'bg-sky-400',
    fuchsia: 'bg-fuchsia-400',
  },
  dot: {
    violet:  'text-violet-400',
    emerald: 'text-emerald-400',
    rose:    'text-rose-400',
    orange:  'text-orange-400',
    amber:   'text-amber-400',
    teal:    'text-teal-400',
    sky:     'text-sky-400',
    fuchsia: 'text-fuchsia-400',
  },
  border: {
    violet:  'border-violet-500',
    emerald: 'border-emerald-500',
    rose:    'border-rose-500',
    orange:  'border-orange-500',
    amber:   'border-amber-500',
    teal:    'border-teal-500',
    sky:     'border-sky-500',
    fuchsia: 'border-fuchsia-500',
  },
};

const FALLBACK: Record<FolderColorVariant, string> = {
  bg:      'bg-highlight11',
  text:    'text-zinc-300',
  iconBox: 'bg-zinc-500/25',
  bar:     'bg-zinc-400',
  dot:     'text-zinc-400',
  border:  'border-zinc-600',
};

export function folderColorClass(
  color: string | null | undefined,
  variant: FolderColorVariant,
): string {
  return CLASSES[variant][color ?? ''] ?? FALLBACK[variant];
}
