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

/** Ablaufdiagramm als Mermaid-Quelltext — gerendert wird erst im Browser. */
export interface PlanDiagramBlock {
  id: string;
  type: 'diagram';
  code: string;
}

export type PlanBlock = PlanTextBlock | PlanTableBlock | PlanDiagramBlock;

export interface Plan {
  id: string;
  title: string;
  categoryId: string | null; // null = eigenständig, sonst an Folder gebunden
  content: PlanBlock[];
  createdAt: string;
  updatedAt: string;
}
