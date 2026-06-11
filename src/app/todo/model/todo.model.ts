

export interface Todo{
    id: string;
    title: string;
    completed: boolean;
    labelId: string | null;  // null = keine Kategorie
    createdAt: Date;
}

export type Filter = 'all' | 'active' | 'completed';


