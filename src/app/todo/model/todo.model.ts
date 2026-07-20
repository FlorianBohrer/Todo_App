

export interface Todo{
    id: string;
    title: string;
    completed: boolean;
    isFavorite: boolean;
    labelId: string | null;  // null = keine Kategorie
    createdAt: Date;

    // Zeitblock: beide null = kein Timer aktiv.
    timerStartedAt: Date | null;
    timerDurationSeconds: number | null;
}

export type Filter = 'all' | 'active' | 'completed' | 'favorites';


