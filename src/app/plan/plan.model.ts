export interface PlanTextBlock {
  id: string;
  type: 'text';
  text: string;
}

export interface PlanTableBlock {
  id: string;
  type: 'table';
  columns: string[];
  rows: string[][];
}

export type PlanBlock = PlanTextBlock | PlanTableBlock;

export interface Plan {
  id: string;
  title: string;
  categoryId: string | null; // null = eigenständig, sonst an Folder gebunden
  content: PlanBlock[];
  createdAt: string;
  updatedAt: string;
}
