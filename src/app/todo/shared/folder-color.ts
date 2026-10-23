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
  | 'text'     // Text in Folder-Farbe
  | 'iconBox'  // Hintergrund des Icon-Quadrats
  | 'dot'      // Farbpunkt
  | 'border';  // Rahmen

// Getönte Flächen ('bg'), Verlaufskacheln ('tile') und Balkenfarben ('bar')
// sind hier entfallen: die Ordnerfarbe steht nur noch an Punkt, Ring und
// Chip. Eine getönte Karte je Ordner machte aus jeder Ordnerliste eine
// Farbtafel.

const CLASSES: Record<FolderColorVariant, Record<string, string>> = {
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
  text:    'text-zinc-300',
  iconBox: 'bg-zinc-500/25',
  dot:     'text-zinc-400',
  border:  'border-zinc-600',
};

export function folderColorClass(
  color: string | null | undefined,
  variant: FolderColorVariant,
): string {
  return CLASSES[variant][color ?? ''] ?? FALLBACK[variant];
}
