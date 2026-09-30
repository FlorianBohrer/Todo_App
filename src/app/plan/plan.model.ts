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
  /**
   * Spaltenbreiten in Pixeln, eine je Spalte.
   *
   * Fehlt das Feld, richten sich die Spalten nach ihrem Inhalt — das ist der
   * Normalfall und bleibt es, bis jemand eine Spalte zieht. Ab dann stehen
   * alle fest, denn eine einzeln gesetzte Spalte neben lauter automatischen
   * verschiebt beim Tippen wieder alles.
   */
  widths?: number[];
  /**
   * Breiter als die Textspalte darstellen.
   *
   * Eine Tabelle ist kein Fliesstext: sechs Spalten in einer Spaltenbreite,
   * die fuer Prosa gesetzt ist, ergeben sechs Wortstapel. Ist das gesetzt,
   * nimmt sie die volle Breite des Dokumentbereichs ein.
   */
  wide?: boolean;
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
 * Aufzählung, nummerierte Liste oder Checkliste.
 *
 * Ein Block hält die ganze Liste, jeder Eintrag aber sein eigenes Schreibfeld —
 * wie in Notion, wo jeder Punkt für sich steht: Enter legt den nächsten an,
 * Tabulator rückt ein, Rückschritt am Anfang führt in den vorigen zurück.
 */
export interface PlanListItem {
  text: string;
  checked: boolean;
  /**
   * Einrücktiefe, 0 = oberste Ebene (Tabulator, wie in Notion).
   *
   * Fehlt sie, ist es 0 — ältere Pläne haben das Feld nicht und sollen
   * unverändert aussehen.
   */
  level?: number;
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
