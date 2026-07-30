import { Component, computed, inject } from '@angular/core';
import {
  LucideAngularModule,
  ChevronLeft,
  Plus,
  Trash2,
  Type,
  Table as TableIcon,
  Workflow,
  ChevronUp,
  ChevronDown,
} from 'lucide-angular';
import { Autosize } from '../../directives/autosize.directive';
import { LabelService } from '../../todo/services/label.service';
import { folderColorClass } from '../../todo/shared/folder-color';
import { PlanService } from '../plan.service';
import { Plan, PlanBlock, PlanDiagramBlock, PlanTableBlock } from '../plan.model';
import { MermaidDiagram } from './mermaid-diagram';

/** Startvorlage: ein neuer Diagrammblock zeigt sofort etwas Gezeichnetes,
 *  statt den Nutzer vor ein leeres Feld und eine fremde Syntax zu setzen. */
const DIAGRAM_TEMPLATE = `flowchart TD
  idea[Idea] --> spike[Spike]
  spike --> build[Build]
  build --> demo[Demo]`;

@Component({
  selector: 'app-plans-view',
  imports: [LucideAngularModule, Autosize, MermaidDiagram],
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

  addTextBlock() {
    this.updateContent((b) => [...b, { id: this.newId(), type: 'text', text: '' }]);
  }
  addTableBlock() {
    this.updateContent((b) => [
      ...b,
      { id: this.newId(), type: 'table', columns: ['Column 1', 'Column 2'], rows: [['', '']] },
    ]);
  }
  addDiagramBlock() {
    this.updateContent((b) => [
      ...b,
      { id: this.newId(), type: 'diagram', code: DIAGRAM_TEMPLATE },
    ]);
  }
  deleteBlock(blockId: string) {
    this.updateContent((b) => b.filter((x) => x.id !== blockId));
  }
  moveBlock(blockId: string, dir: -1 | 1) {
    this.updateContent((b) => {
      const i = b.findIndex((x) => x.id === blockId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  updateText(blockId: string, text: string) {
    this.updateContent((b) =>
      b.map((x) => (x.id === blockId && x.type === 'text' ? { ...x, text } : x)),
    );
  }

  // ---- Editor: Diagramm ----
  updateCode(blockId: string, code: string) {
    this.updateContent((b) =>
      b.map((x) => (x.id === blockId && x.type === 'diagram' ? { ...x, code } : x)),
    );
  }
  asDiagram(block: PlanBlock): PlanDiagramBlock {
    return block as PlanDiagramBlock;
  }

  // ---- Editor: Tabelle ----
  private mapTable(blockId: string, fn: (t: PlanTableBlock) => PlanTableBlock) {
    this.updateContent((b) =>
      b.map((x) => (x.id === blockId && x.type === 'table' ? fn(x) : x)),
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
