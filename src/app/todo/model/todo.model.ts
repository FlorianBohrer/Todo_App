

export interface Todo{
    id: string;
    title: string;
    completed: boolean;
    isFavorite: boolean;
    // Alle zugewiesenen Labels (n:m). Leeres Array = keine Kategorie.
    // labelIds[0] ist das "primäre" Label (Farbe von Rand/Punkt).
    labelIds: string[];
    createdAt: Date;

    // Zeitblock: beide null = kein Timer aktiv.
    timerStartedAt: Date | null;
    timerDurationSeconds: number | null;
}

export type Filter = 'all' | 'active' | 'completed' | 'favorites';


