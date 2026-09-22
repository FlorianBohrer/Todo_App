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
 * Aufzählung, nummerierte Liste oder Checkliste. Ein Block hält die ganze
 * Liste: beim Bearbeiten ist eine Zeile ein Eintrag, angezeigt wird echtes
 * ul/ol. Das hält das Umsortieren einfach — Notion macht daraus je einen
 * eigenen Block, was ohne contenteditable kaum zu bedienen wäre.
 */
export interface PlanListItem {
  text: string;
  checked: boolean;
  /**
   * Das echte Todo, zu dem dieser Eintrag geworden ist.
   *
   * Ist er gesetzt, ist der Eintrag nur noch ein Verweis: angezeigt und
   * abgehakt wird der Zustand des Todos, nicht `checked`. Damit gibt es genau
   * einen Haken und nicht zwei, die auseinanderlaufen können.
   */
  todoId?: string;
}

export interface PlanListBlock {
  id: string;
  type: 'list';
  variant: 'bullet' | 'number' | 'todo';
  items: PlanListItem[];
}

/** Code-Block mit Sprachkennung — Monospace, nicht formatiert. */
export interface PlanCodeBlock {
  id: string;
  type: 'code';
  language: string;
  code: string;
}

/** Zitat bzw. Merkkasten (Obsidian-Callout). */
export interface PlanQuoteBlock {
  id: string;
  type: 'quote';
  text: string;
}

/** Trennlinie — reine Gliederung, nichts zu bearbeiten. */
export interface PlanDividerBlock {
  id: string;
  type: 'divider';
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
  | PlanListBlock
  | PlanCodeBlock
  | PlanQuoteBlock
  | PlanDividerBlock
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
