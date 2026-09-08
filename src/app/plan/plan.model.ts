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

/** Überschrift in drei Größen (wie Notion /heading1..3). */
export interface PlanHeadingBlock {
  id: string;
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

/**
 * Aufklappbarer Container, der mehrere Blöcke bündelt (z. B. Überschrift als
 * Titel + Ablaufdiagramm + Beschreibungstext). Verschachtelung möglich.
 */
export interface PlanGroupBlock {
  id: string;
  type: 'group';
  title: string;
  collapsed: boolean;
  blocks: PlanBlock[];
}

export type PlanBlock =
  | PlanTextBlock
  | PlanHeadingBlock
  | PlanTableBlock
  | PlanDiagramBlock
  | PlanGroupBlock;

export interface Plan {
  id: string;
  title: string;
  categoryId: string | null; // null = eigenständig, sonst an Folder gebunden
  content: PlanBlock[];
  createdAt: string;
  updatedAt: string;
}
