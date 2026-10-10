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

    /**
     * Wann erledigt wurde — nicht nur DASS.
     *
     * null hat zwei Bedeutungen, und beide laufen auf dasselbe hinaus: die
     * Aufgabe ist offen, ODER sie wurde erledigt, bevor der Server diesen
     * Zeitpunkt festhielt. In beiden Fällen weiß die App es nicht, und alles
     * Zeitliche sagt das dann auch so, statt eine Zahl zu zeigen.
     */
    completedAt: Date | null;

    /**
     * Welcher Reihe von Wiederholungen diese Ausgabe angehört.
     *
     * Beim Abhaken entsteht eine neue Zeile für den nächsten Termin. Ohne
     * diese Verbindung wäre eine Trefferquote nicht zu bilden, sondern nur
     * über gleiche Titel zu erraten.
     *
     * null heißt „eigene Reihe": der Schlüssel ist dann die eigene id —
     * siehe seriesKey() in shared/rhythm.ts.
     */
    seriesId: string | null;

    /** Wiederholung, oder null wenn die Aufgabe einmalig ist. */
    repeat: RepeatRule | null;

    /** Der Plan, aus dem diese Aufgabe stammt. null = eigenständig. */
    planId: string | null;
}

export type Filter = 'all' | 'active' | 'completed' | 'favorites';
