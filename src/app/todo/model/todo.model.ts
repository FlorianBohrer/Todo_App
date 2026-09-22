/** Wie oft sich eine Aufgabe wiederholt. */
export type RepeatUnit = 'day' | 'week' | 'month';

/**
 * Woran die nächste Fälligkeit hängt.
 *
 * 'due'        — am Plan: „jeden Montag". Der Rhythmus steht fest, egal wann
 *                man es tatsächlich erledigt hat.
 * 'completion' — an der Erledigung: „drei Tage nachdem ich es zuletzt gemacht
 *                habe". Für Hausarbeit meist das Richtige.
 */
export type RepeatFrom = 'due' | 'completion';

export interface RepeatRule {
  every: number;
  unit: RepeatUnit;
  from: RepeatFrom;
}

export interface Todo{
    id: string;
    title: string;
    completed: boolean;
    isFavorite: boolean;
    // Alle zugewiesenen Labels (n:m). Leeres Array = keine Kategorie.
    // labelIds[0] ist das "primäre" Label (Farbe von Rand/Punkt).
    labelIds: string[];
    createdAt: Date;

    // Wochenansicht: 'YYYY-MM-DD' oder null (ungeplant/Backlog).
    scheduledDate: string | null;

    /** Weggelegt: aus der Liste heraus, aber nicht gelöscht. null = sichtbar. */
    archivedAt: Date | null;

    /** Wiederholung, oder null wenn die Aufgabe einmalig ist. */
    repeat: RepeatRule | null;

    /** Der Plan, aus dem diese Aufgabe stammt. null = eigenständig. */
    planId: string | null;
}

export type Filter = 'all' | 'active' | 'completed' | 'favorites';
