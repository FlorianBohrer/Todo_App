import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  LucideAngularModule,
  ChevronLeft,
  Plus,
  Trash2,
  Type,
  Table as TableIcon,
  Workflow,
  Layers,
  ChevronUp,
  ChevronDown,
} from 'lucide-angular';
import { Autosize } from '../../directives/autosize.directive';
import { LabelService } from '../../todo/services/label.service';
import { folderColorClass } from '../../todo/shared/folder-color';
import { PlanService } from '../plan.service';
import { Plan, PlanBlock, PlanDiagramBlock, PlanTableBlock, PlanGroupBlock } from '../plan.model';
import { MermaidDiagram } from './mermaid-diagram';

type BlockKind = 'text' | 'diagram' | 'table';

/** Startvorlage: ein neuer Diagrammblock zeigt sofort etwas Gezeichnetes,
 *  statt den Nutzer vor ein leeres Feld und eine fremde Syntax zu setzen. */
const DIAGRAM_TEMPLATE = `flowchart TD
  idea[Idea] --> spike[Spike]
  spike --> build[Build]
  build --> demo[Demo]`;

@Component({
  selector: 'app-plans-view',
  imports: [LucideAngularModule, Autosize, MermaidDiagram, NgTemplateOutlet],
  templateUrl: './plans-view.html',
  styleUrl: './plans-view.scss',
})
export class PlansView {
  private readonly planService = inject(PlanService);
  protected readonly labelService = inject(LabelService);

  protected readonly BackIcon = ChevronLeft;
  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly TextIcon = Type;
  protected readonly TableIcon = TableIcon;
  protected readonly DiagramIcon = Workflow;
  protected readonly SectionIcon = Layers;
  protected readonly UpIcon = ChevronUp;
  protected readonly DownIcon = ChevronDown;

  protected readonly plans = this.planService.plans;
  protected readonly loading = this.planService.loading;
  protected readonly labels = this.labelService.labels;

  protected readonly selected = computed<Plan | null>(() => {
    const id = this.planService.selectedId();
    return id ? this.plans().find((p) => p.id === id) ?? null : null;
  });

  // ---- Liste ----
  newPlan() { this.planService.createPlan('Untitled plan'); }
  open(id: string) { this.planService.select(id); }
  back() { this.planService.select(null); }
  deletePlan(id: string, event: Event) {
    event.stopPropagation();
    this.planService.deletePlan(id);
  }

  folderName(categoryId: string | null): string {
    if (!categoryId) return 'Standalone';
    return this.labels().find((l) => l.id === categoryId)?.name ?? 'Standalone';
  }
  dotClass(categoryId: string | null): string {
    const color = this.labels().find((l) => l.id === categoryId)?.color;
    return folderColorClass(color, 'dot');
  }

  // ---- Editor: Kopf ----
  setTitle(id: string, value: string) {
    const t = value.trim();
    if (t) this.planService.patchPlan(id, { title: t });
  }
  setFolder(id: string, value: string) {
    this.planService.patchPlan(id, { categoryId: value || null });
  }

  // ---- Editor: Blöcke ----
  private updateContent(fn: (blocks: PlanBlock[]) => PlanBlock[]) {
    const plan = this.selected();
    if (!plan) return;
    this.planService.patchPlan(plan.id, { content: fn([...plan.content]) });
  }

  private newId(): string {
    return crypto.randomUUID();
  }

  private makeBlock(kind: BlockKind): PlanBlock {
    switch (kind) {
      case 'text':
        return { id: this.newId(), type: 'text', text: '' };
      case 'diagram':
        return { id: this.newId(), type: 'diagram', code: DIAGRAM_TEMPLATE };
      case 'table':
        return {
          id: this.newId(),
          type: 'table',
          columns: ['Column 1', 'Column 2'],
          rows: [['', '']],
        };
    }
  }

  // --- Rekursive Helfer: wirken auf jeden Block, egal wie tief in Gruppen ---
  private mapById(
    blocks: PlanBlock[],
    id: string,
    fn: (b: PlanBlock) => PlanBlock,
  ): PlanBlock[] {
    return blocks.map((b) => {
      if (b.id === id) return fn(b);
      if (b.type === 'group') return { ...b, blocks: this.mapById(b.blocks, id, fn) };
      return b;
    });
  }
  private removeById(blocks: PlanBlock[], id: string): PlanBlock[] {
    return blocks
      .filter((b) => b.id !== id)
      .map((b) => (b.type === 'group' ? { ...b, blocks: this.removeById(b.blocks, id) } : b));
  }
  /** Verschiebt den Block innerhalb SEINER Geschwister (oben/unten). */
  private moveInTree(blocks: PlanBlock[], id: string, dir: -1 | 1): PlanBlock[] {
    const i = blocks.findIndex((b) => b.id === id);
    if (i >= 0) {
      const j = i + dir;
      if (j < 0 || j >= blocks.length) return blocks;
      const copy = [...blocks];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    }
    return blocks.map((b) =>
      b.type === 'group' ? { ...b, blocks: this.moveInTree(b.blocks, id, dir) } : b,
    );
  }

  // ---- Blöcke auf oberster Ebene anlegen ----
  addTextBlock() {
    this.updateContent((b) => [...b, this.makeBlock('text')]);
  }
  addTableBlock() {
    this.updateContent((b) => [...b, this.makeBlock('table')]);
  }
  addDiagramBlock() {
    this.updateContent((b) => [...b, this.makeBlock('diagram')]);
  }

  // ---- Section (aufklappbarer Container) ----
  /** Neue Section, vorbefüllt mit Diagramm + Beschreibungstext. */
  addGroupBlock() {
    this.updateContent((b) => [
      ...b,
      {
        id: this.newId(),
        type: 'group',
        title: 'Section',
        collapsed: false,
        blocks: [this.makeBlock('diagram'), this.makeBlock('text')],
      },
    ]);
  }
  toggleGroup(groupId: string) {
    this.updateContent((b) =>
      this.mapById(b, groupId, (x) =>
        x.type === 'group' ? { ...x, collapsed: !x.collapsed } : x,
      ),
    );
  }
  setGroupTitle(groupId: string, title: string) {
    this.updateContent((b) =>
      this.mapById(b, groupId, (x) =>
        x.type === 'group' ? { ...x, title: title.trim() || 'Section' } : x,
      ),
    );
  }
  addToGroup(groupId: string, kind: BlockKind) {
    this.updateContent((b) =>
      this.mapById(b, groupId, (x) =>
        x.type === 'group' ? { ...x, blocks: [...x.blocks, this.makeBlock(kind)] } : x,
      ),
    );
  }
  asGroup(block: PlanBlock): PlanGroupBlock {
    return block as PlanGroupBlock;
  }

  deleteBlock(blockId: string) {
    this.updateContent((b) => this.removeById(b, blockId));
  }
  moveBlock(blockId: string, dir: -1 | 1) {
    this.updateContent((b) => this.moveInTree(b, blockId, dir));
  }

  updateText(blockId: string, text: string) {
    this.updateContent((b) =>
      this.mapById(b, blockId, (x) => (x.type === 'text' ? { ...x, text } : x)),
    );
  }

  // ---- Editor: Diagramm ----
  updateCode(blockId: string, code: string) {
    this.updateContent((b) =>
      this.mapById(b, blockId, (x) => (x.type === 'diagram' ? { ...x, code } : x)),
    );
  }
  asDiagram(block: PlanBlock): PlanDiagramBlock {
    return block as PlanDiagramBlock;
  }

  // ---- Editor: Tabelle ----
  private mapTable(blockId: string, fn: (t: PlanTableBlock) => PlanTableBlock) {
    this.updateContent((b) =>
      this.mapById(b, blockId, (x) => (x.type === 'table' ? fn(x) : x)),
    );
  }
  setColumn(blockId: string, c: number, value: string) {
    this.mapTable(blockId, (t) => {
      const columns = [...t.columns];
      columns[c] = value;
      return { ...t, columns };
    });
  }
  setCell(blockId: string, r: number, c: number, value: string) {
    this.mapTable(blockId, (t) => {
      const rows = t.rows.map((row) => [...row]);
      rows[r][c] = value;
      return { ...t, rows };
    });
  }
  addRow(blockId: string) {
    this.mapTable(blockId, (t) => ({
      ...t,
      rows: [...t.rows, t.columns.map(() => '')],
    }));
  }
  addColumn(blockId: string) {
    this.mapTable(blockId, (t) => ({
      ...t,
      columns: [...t.columns, `Column ${t.columns.length + 1}`],
      rows: t.rows.map((row) => [...row, '']),
    }));
  }
  deleteRow(blockId: string, r: number) {
    this.mapTable(blockId, (t) => ({ ...t, rows: t.rows.filter((_, i) => i !== r) }));
  }
  deleteColumn(blockId: string, c: number) {
    this.mapTable(blockId, (t) => ({
      ...t,
      columns: t.columns.filter((_, i) => i !== c),
      rows: t.rows.map((row) => row.filter((_, i) => i !== c)),
    }));
  }

  asTable(block: PlanBlock): PlanTableBlock {
    return block as PlanTableBlock;
  }
}
