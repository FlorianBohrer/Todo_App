

export interface Todo{
    id: string;
    title: string;
    completed: boolean;
    isFavorite: boolean;
    labelId: string | null;  // null = keine Kategorie
    createdAt: Date;
}

export type Filter = 'all' | 'active' | 'completed' | 'favorites';


