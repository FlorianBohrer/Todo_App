import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDragDrop,
} from '@angular/cdk/drag-drop';
import {
  LucideAngularModule,
  LucideIconData,
  ChevronLeft,
  Plus,
  Trash2,
  Type,
  Table as TableIcon,
  Workflow,
  Layers,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code,
  Quote,
  Minus,
  Link2,
  Copy,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Search,
  Undo2,
  Redo2,
  CornerDownRight,
  CornerUpLeft,
  ListTree,
  Download,
  Upload,
  FilePlus,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast.service';
import { LabelService } from '../../todo/services/label.service';
import { TodoService } from '../../todo/services/todo';
import type { Todo } from '../../todo/model/todo.model';
import { folderColorClass } from '../../todo/shared/folder-color';
import { PlanService } from '../plan.service';
import {
  Plan,
  PlanBlock,
  PlanDiagramBlock,
  PlanTableBlock,
  PlanGroupBlock,
  PlanHeadingBlock,
  PlanListBlock,
  PlanListItem,
  PlanCodeBlock,
  PlanQuoteBlock,
} from '../plan.model';
import { focusRich, replaceRange } from '../rich-text';
import { formatBlock } from '../inline-format';
import { levelOf, listMarkers } from '../list-markers';
import { TypingRun, continuesRun } from '../edit-history';
import { fileNameFor, planToMarkdown, uniqueNames } from '../plan-markdown';
import { markdownToPlan, titleFromFileName } from '../markdown-import';
import { makeZip, readZip, ZipEntry } from '../zip';
import { detectSlashToken } from '../slash-command';
import { planLinkTargets, planPlainText } from '../plan-links';
import { parseMarkdownBlocks, ParsedBlock } from '../markdown-paste';
import { PlanTitleService } from '../plan-title.service';
import {
  UntitledSection,
  blockText,
  findUntitledSections,
  needsHeading,
} from '../untitled-sections';
import {
  detectMarkdownShortcut,
  detectWikiToken,
  MarkdownBlockKind,
} from '../editor-input';
import { PlanBlockView } from './plan-block';
import { PlanGraph } from './plan-graph';

/**
 * Eine Listenzeile, fertig gerechnet — siehe listRows.
 */
export interface ListRow {
  text: string;
  fieldId: string;
  /** Punkt, Zahl oder Buchstabe, je nach Ebene. */
  marker: string;
  /** Einzug in rem. */
  indent: number;
  checked: boolean;
  /** Das verknuepfte Todo, falls der Eintrag eins geworden ist. */
  todo: Todo | null;
}

/** Was das Slash-Menü einfügen kann. */
type SlashKind =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'number'
  | 'todo'
  | 'code'
  | 'quote'
  | 'divider'
  | 'toggle'
  | 'table'
  | 'diagram';

/**
 * Tiefste Einrueckung einer Liste.
 *
 * Drei Ebenen sind kein technisches Limit, sondern eins der Lesbarkeit: was
 * tiefer geschachtelt ist, gehoert in einen eigenen Plan. Notion laesst mehr
 * zu und niemand nutzt es sinnvoll.
 */
const MAX_LIST_LEVEL = 2;

/**
 * Schmalste Spalte, die man noch ziehen kann.
 *
 * Weniger waere kein Nutzen, sondern eine Falle: eine Spalte, die man auf
 * null gezogen hat, ist verschwunden und nicht wiederzufinden.
 */
const MIN_COL_WIDTH = 56;

/** Breite einer Spalte, die zu einer bereits festgehaltenen dazukommt. */
const DEFAULT_COL_WIDTH = 160;

/** Die schmale Spalte rechts mit den Loeschknoepfen (1.75rem). */
const GUTTER_WIDTH = 28;

/**
 * Text in Listeneintraege zerlegen — eine Zeile, ein Punkt.
 *
 * Beim Typwechsel ist das der ganze Unterschied zwischen „meine drei Zeilen
 * sind jetzt drei Punkte" und einem einzigen Punkt, in dem alles klebt.
 */
function toItems(text: string): PlanListItem[] {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return lines.length ? lines.map((line) => ({ text: line, checked: false })) : [{ text: '', checked: false }];
}

/** Startvorlage: ein neuer Diagrammblock zeigt sofort etwas Gezeichnetes,
 *  statt den Nutzer vor ein leeres Feld und eine fremde Syntax zu setzen. */
const DIAGRAM_TEMPLATE = `flowchart TD
  idea[Idea] --> spike[Spike]
  spike --> build[Build]
  build --> demo[Demo]`;

@Component({
  selector: 'app-plans-view',
  imports: [
    LucideAngularModule,
    NgTemplateOutlet,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    OverlayModule,
    PlanGraph,
    PlanBlockView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plans-view.html',
  styleUrl: './plans-view.scss',
})
export class PlansView {
  private readonly planService = inject(PlanService);
  protected readonly labelService = inject(LabelService);
  // Beide Dienste stehen ohnehin app-weit bereit; die Planansicht liest hier
  // nur den Zustand, den die Liste schon geladen hat. Kein zweiter Abruf.
  private readonly todoService = inject(TodoService);
  private readonly toast = inject(ToastService);

  protected readonly BackIcon = ChevronLeft;
  readonly PlusIcon = Plus;
  readonly TrashIcon = Trash2;
  readonly GripIcon = GripVertical;
  protected readonly SearchIcon = Search;
  protected readonly OutlineIcon = ListTree;
  protected readonly ExportIcon = Download;
  protected readonly ImportIcon = Upload;
  protected readonly BlankIcon = FilePlus;
  readonly NestIcon = CornerDownRight;
  readonly LiftIcon = CornerUpLeft;
  protected readonly UndoIcon = Undo2;
  protected readonly RedoIcon = Redo2;

  /** Datenwert der obersten Blockliste; getippt, damit er zu den Section-Listen passt. */
  protected readonly rootList: string | null = null;

  // ---- Die Ablageflaechen kennen einander ueber IDs ----
  //
  // cdkDropListGroup verbindet Listen ueber die Injektor-Hierarchie. Die
  // Blockvorlage wird aber per ngTemplateOutlet eingesetzt, und eine
  // eingebettete Ansicht sucht ihre Abhaengigkeiten dort, wo sie DEKLARIERT
  // ist — die Vorlage steht ausserhalb der Gruppe. Die Listen in den Toggles
  // haben die Gruppe deshalb nie gefunden und waren keine Nachbarn der
  // obersten Liste: es liess sich kein Block in ein Toggle ziehen und keiner
  // heraus, und zwar von Anfang an.
  //
  // Ueber IDs laeuft die Verbindung an der Hierarchie vorbei: das CDK haelt
  // alle Listen in einem eigenen Verzeichnis und sucht sie dort.

  readonly ROOT_LIST = 'plan-list-root';

  listId(groupId: string): string {
    return 'plan-list-' + groupId;
  }

  /**
   * Der Datenwert einer Toggle-Ablageflaeche.
   *
   * Sieht nach nichts aus, hat aber einen Grund: die oberste Liste traegt
   * null, die Toggles ihre ID. Der Ablage-Handler bekommt dadurch
   * „string | null", und ohne diese Angleichung waere die Bindung im Block
   * enger getippt als das Ereignis, das sie ausloest.
   */
  listData(groupId: string): string | null {
    return groupId;
  }

  /** Alle Ablageflaechen des Dokuments — jede kennt jede. */
  readonly listIds = computed<string[]>(
    () => {
      const ids = [this.ROOT_LIST];
      const walk = (blocks: PlanBlock[]) => {
        for (const block of blocks) {
          if (block.type !== 'group') continue;
          ids.push(this.listId(block.id));
          walk(block.blocks);
        }
      };
      walk(this.selected()?.content ?? []);
      return ids;
    },
    {
      // Jeder Anschlag baut einen neuen Inhaltsbaum, also auch ein neues
      // Array — und jede Ablageflaeche bekaeme ihre Nachbarn neu gesetzt,
      // obwohl sich nichts geaendert hat. Gleiche Kennungen, gleiches Array.
      equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    },
  );
  readonly TextIcon = Type;
  readonly TableIcon = TableIcon;
  readonly DiagramIcon = Workflow;
  readonly SectionIcon = Layers;
  readonly H1Icon = Heading1;
  readonly H2Icon = Heading2;
  readonly H3Icon = Heading3;
  readonly BulletIcon = List;
  readonly NumberIcon = ListOrdered;
  readonly TodoIcon = ListChecks;
  readonly CodeIcon = Code;
  readonly QuoteIcon = Quote;
  readonly DividerIcon = Minus;
  readonly LinkIcon = Link2;
  readonly CopyIcon = Copy;
  readonly UpIcon = ChevronUp;
  readonly DownIcon = ChevronDown;

  // ---- Blöcke anlegen (einmal pro Dokument, oben rechts) ----
  //
  // Vorher stand unter dem Text eine Leiste mit Text/Tabelle/Diagramm/Toggle.
  // Sie klebte damit immer unter dem Absatz, an dem man gerade schrieb, und
  // behauptete, das Dokument ende hier und jetzt — dabei gehoert „was kann ich
  // anlegen" zum Dokument, nicht zur Schreibstelle. Was man beim Schreiben
  // braucht, macht ohnehin „/" an genau der Stelle, an der der Cursor steht.

  protected readonly addMenuOpen = signal(false);

  /**
   * Nur die Bloecke, die man nicht tippen kann.
   *
   * Ueberschriften, Listen und Zitate stehen bewusst NICHT hier: sie entstehen
   * beim Schreiben („# ", „- ", „> ") oder ueber „/". Ein zweiter Weg zu
   * denselben Dingen macht das Menue lang und die Entscheidung schwer.
   */
  protected readonly addOptions: { kind: SlashKind; label: string; icon: LucideIconData }[] = [
    { kind: 'text', label: 'Text', icon: this.TextIcon },
    { kind: 'table', label: 'Table', icon: this.TableIcon },
    { kind: 'diagram', label: 'Diagram', icon: this.DiagramIcon },
    { kind: 'toggle', label: 'Toggle', icon: this.SectionIcon },
  ];

  toggleAddMenu(): void {
    this.addMenuOpen.update((open) => !open);
  }

  closeAddMenu(): void {
    this.addMenuOpen.set(false);
  }

  /** Haengt den Block ans Ende des Dokuments und springt hinein. */
  addFromMenu(kind: SlashKind): void {
    this.closeAddMenu();
    const created = this.makeConverted(this.newId(), kind);
    this.updateContent((bs) => [...bs, created]);
    this.focusConverted(created.id, kind);
  }

  /**
   * Die Gliederung im Popover — fuer jedes Fenster, das der Seitenleiste
   * keinen Platz laesst.
   */
  protected readonly outlineOpen = signal(false);

  toggleOutline() {
    this.outlineOpen.update((open) => !open);
  }

  closeOutline() {
    this.outlineOpen.set(false);
  }

  // ---- Export ----
  //
  // Der Weg nach draussen. Der Inhalt IST schon Markdown — die Bloecke halten
  // den Text so, wie er getippt wurde —, also ist das hier kein Umbau, sondern
  // eine Uebersetzung der Gliederung drumherum (plan-markdown.ts) und ein
  // Archiv darum (zip.ts). Wer die App morgen nicht mehr benutzen will, nimmt
  // seine Notizen mit; und ein Knopf, der alles herausgibt, ist zugleich die
  // einfachste Sicherung, die es fuer diese Daten gibt.

  exportOpen = signal(false);

  /** Welche Plaene ausgewaehlt sind. Beim Oeffnen: alle. */
  exportPicks = signal<ReadonlySet<string>>(new Set());

  exportLabel = computed(() => {
    const count = this.exportPicks().size;
    if (count === 0) return 'Nothing selected';
    return count === 1 ? 'Export 1 plan' : `Export ${count} plans`;
  });

  /**
   * Die Auswahl steht auf dem, was die Uebersicht gerade zeigt.
   *
   * Ohne Filter ist das alles. Mit Filter waere beides falsch: nur die
   * gefilterten anzubieten macht die uebrigen unerreichbar, alle anzuhaken
   * widerspricht dem, was auf dem Schirm steht. Also stehen alle in der Liste,
   * angehakt ist das Sichtbare.
   *
   * Im Graph greift der Filter nicht sichtbar — dort waere eine Vorauswahl
   * nach einer Suche, die man nicht mehr sieht, nicht nachvollziehbar.
   */
  openExport() {
    const shown = this.overviewMode() === 'list' ? this.visiblePlans() : this.plans();
    this.exportPicks.set(new Set(shown.map((p) => p.id)));
    this.exportOpen.set(true);
  }

  closeExport() {
    this.exportOpen.set(false);
  }

  toggleExportPick(id: string) {
    this.exportPicks.update((picks) => {
      const next = new Set(picks);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  pickAllExports(all: boolean) {
    this.exportPicks.set(all ? new Set(this.plans().map((p) => p.id)) : new Set());
  }

  /** Einen einzelnen Plan als Datei — aus dem Dokument heraus. */
  exportOne(plan: Plan) {
    const text = planToMarkdown(plan, this.planFolder(plan));
    this.save(new Blob([text], { type: 'text/markdown;charset=utf-8' }), fileNameFor(plan.title));
  }

  /**
   * Die ausgewaehlten Plaene.
   *
   * Einer wird eine Datei, mehrere werden ein Archiv: ein ZIP mit genau einem
   * Eintrag ist eine Verpackung um nichts, und den Umweg ueber das Entpacken
   * spart man sich damit.
   */
  exportPicked() {
    const picks = this.exportPicks();
    const chosen = this.plans().filter((p) => picks.has(p.id));
    if (!chosen.length) return;

    this.closeExport();

    if (chosen.length === 1) {
      this.exportOne(chosen[0]);
      return;
    }

    const names = uniqueNames(chosen.map((p) => p.title));
    const zip = makeZip(
      chosen.map((plan, i) => ({
        name: names[i],
        text: planToMarkdown(plan, this.planFolder(plan)),
      })),
    );

    const day = new Date().toISOString().slice(0, 10);
    this.save(zip, `plans-${day}.zip`);
  }

  private planFolder(plan: Plan): string | null {
    return plan.categoryId ? this.folderName(plan.categoryId) : null;
  }

  /**
   * Herunterladen.
   *
   * Die Adresse wird verzoegert freigegeben: gibt man sie sofort zurueck, ist
   * der Download in manchen Browsern abgebrochen, bevor er angefangen hat.
   */
  private save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ---- Import ----
  //
  // Der Weg herein. Er muss mehr aushalten als der Weg hinaus: was der
  // Export geschrieben hat, kommt hier zurueck, aber genauso eine Datei aus
  // Obsidian, aus Bear oder aus einem Ordner voller Notizen. Was sich nicht
  // einordnen laesst, wird ein Absatz — verloren geht nichts.

  /** Nur Text wird gelesen. Ein Bild waere kein Plan. */
  private static readonly TEXT_FILE = /\.(md|markdown|txt)$/i;

  protected readonly importing = signal(false);

  /** Die Pfeilhälfte des geteilten Knopfes. */
  protected readonly newMenuOpen = signal(false);

  toggleNewMenu() {
    this.newMenuOpen.update((open) => !open);
  }

  closeNewMenu() {
    this.newMenuOpen.set(false);
  }

  newPlanFromMenu() {
    this.closeNewMenu();
    this.newPlan();
  }

  /**
   * Der Dateidialog aus dem Menü heraus.
   *
   * Erst zuklappen, dann öffnen: der Klick ist noch derselbe Griff des
   * Nutzers, und nur damit darf eine Seite einen Dateidialog aufmachen.
   */
  pickImport(input: HTMLInputElement) {
    this.closeNewMenu();
    input.click();
  }

  /** Liegt gerade eine Datei ueber der Uebersicht? */
  protected readonly fileOver = signal(false);

  /**
   * Ziehen meldet sich fuer jedes Kindelement erneut; ohne Zaehler flackert
   * der Hinweis, sobald der Zeiger ueber eine Kachel faehrt.
   */
  private dragDepth = 0;

  onFileDragEnter(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    this.dragDepth++;
    this.fileOver.set(true);
  }

  onFileDragOver(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    // Ohne das oeffnet der Browser die Datei einfach selbst.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onFileDragLeave(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.fileOver.set(false);
  }

  onFileDrop(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragDepth = 0;
    this.fileOver.set(false);
    void this.importFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private hasFiles(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('Files');
  }

  /**
   * Der Knopf: der Dateidialog haengt an einem unsichtbaren Feld.
   *
   * Erst abschreiben, dann zuruecksetzen. `input.files` ist keine Kopie,
   * sondern die Liste des Feldes selbst — das Zuruecksetzen leert damit auch
   * die Liste, die man gerade weitergeben wollte, und es kam nie etwas an.
   * Zuruecksetzen muss man trotzdem, sonst loest dieselbe Datei beim zweiten
   * Mal kein „change" mehr aus.
   */
  onImportPicked(input: HTMLInputElement) {
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    void this.importFiles(chosen);
  }

  /**
   * Dateien einlesen und je Datei einen Plan anlegen.
   *
   * Ein Archiv wird ausgepackt — damit kommt zurueck, was der Export als ZIP
   * herausgegeben hat. Schlaegt eine Datei fehl, laufen die anderen weiter:
   * bei zwanzig Notizen waere Abbrechen die schlechtere Antwort.
   */
  private async importFiles(chosen: readonly File[]) {
    if (!chosen.length || this.importing()) return;

    this.importing.set(true);
    try {
      const documents: ZipEntry[] = [];
      let unreadable = 0;

      for (const file of chosen) {
        try {
          if (/\.zip$/i.test(file.name)) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            documents.push(...(await readZip(bytes)).filter((e) => PlansView.TEXT_FILE.test(e.name)));
          } else if (PlansView.TEXT_FILE.test(file.name)) {
            documents.push({ name: file.name, text: await file.text() });
          } else {
            unreadable++;
          }
        } catch {
          unreadable++;
        }
      }

      if (!documents.length) {
        this.toast.error(unreadable ? 'Nothing to import in those files' : 'No markdown found');
        return;
      }

      // Von hinten: jeder neue Plan kommt oben auf die Liste, und so steht am
      // Ende die erste Datei auch wieder oben.
      let made = 0;
      let single: string | null = null;

      for (const doc of [...documents].reverse()) {
        const parsed = markdownToPlan(doc.text, titleFromFileName(doc.name));
        try {
          const plan = await this.planService.importPlan(
            parsed.title,
            this.folderIdByName(parsed.folder),
            parsed.content,
          );
          made++;
          single = plan.id;
        } catch {
          unreadable++;
        }
      }

      // Uebersprungenes gehoert in dieselbe Meldung: „Imported 1 plan", wenn
      // drei Dateien danebengingen, waere die halbe Wahrheit.
      const skipped = unreadable ? `, ${unreadable} skipped` : '';

      if (!made) {
        this.toast.error('Could not import');
      } else {
        this.toast.success(`Imported ${made} plan${made === 1 ? '' : 's'}${skipped}`);
        // Eine einzelne Notiz will man sofort sehen; bei zwanzig bleibt man
        // in der Uebersicht und sucht sich selbst aus, wo man anfaengt.
        if (made === 1) this.planService.select(single);
      }
    } finally {
      this.importing.set(false);
    }
  }

  /**
   * Der Ordner aus dem Dateikopf, sofern es ihn hier gibt.
   *
   * Angelegt wird keiner: ein Import, der nebenbei Ordner erfindet, haette
   * nach zehn Dateien eine Seitenleiste, die niemand so wollte.
   */
  private folderIdByName(name: string | null): string | null {
    if (!name) return null;
    const wanted = name.trim().toLowerCase();
    return this.labels().find((label) => label.name.trim().toLowerCase() === wanted)?.id ?? null;
  }

  // ---- Blockaktionen ----
  //
  // Kein eigener Knopf mehr: die Aktionen liegen hinter dem Ziehgriff in der
  // linken Randspalte. Rechts bleibt dadurch nichts mehr stehen, was vom Text
  // ablenkt — und die gesamte rechte Reserve faellt weg.

  /** Block, dessen Aktionsmenue offen ist. */
  readonly openBlockMenu = signal<string | null>(null);

  /**
   * Das Menue klappt unter dem Griff nach rechts auf; ist unten kein Platz,
   * nach oben. CDK waehlt die erste Position, die ins Fenster passt.
   */
  readonly menuPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  /**
   * Der Ziehgriff oeffnet das Menue per Klick. Nach einem Drag feuert aber noch
   * ein Klick hinterher — ohne diese Sperre ginge das Menue nach jedem
   * Verschieben auf.
   */
  private lastDragEnd = 0;

  /**
   * Jemand hat einen Block am Griff — die Ablageflaechen zeigen sich.
   *
   * Am Griff, nicht erst beim Ziehen: das CDK sammelt die moeglichen Ziele in
   * dem Moment, in dem der Zug beginnt (beforeStarted), und was danach ins
   * Dokument kommt, ist fuer diesen Zug nicht mehr da. Der Streifen im
   * zugeklappten Toggle muss also schon stehen, bevor die Hand sich bewegt.
   */
  readonly grabbing = signal(false);

  /** Laeuft gerade ein echter Zug? Dann raeumt erst sein Ende wieder auf. */
  private dragActive = false;

  onGrab() {
    this.grabbing.set(true);
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onRelease() {
    // Waehrend eines Zuges nicht: das Loslassen gehoert dem CDK, und die
    // Flaechen duerfen erst verschwinden, wenn es abgelegt hat.
    if (this.dragActive || !this.grabbing()) return;
    this.grabbing.set(false);
  }

  onDragStarted() {
    this.dragActive = true;
    this.closeBlockMenu();
  }
  onDragEnded() {
    this.dragActive = false;
    this.lastDragEnd = Date.now();
    this.grabbing.set(false);
  }

  toggleBlockMenu(blockId: string) {
    if (Date.now() - this.lastDragEnd < 250) return;
    this.openBlockMenu.update((cur) => (cur === blockId ? null : blockId));
  }
  closeBlockMenu() {
    this.openBlockMenu.set(null);
  }
  menuMove(blockId: string, dir: -1 | 1) {
    this.moveBlock(blockId, dir);
    this.closeBlockMenu();
  }
  /**
   * Was ein Block werden kann, ohne neu getippt zu werden.
   *
   * Die haeufigen Faelle, nicht alle: aus einem Absatz eine Ueberschrift, aus
   * Zeilen eine Liste. Tabelle und Diagramm stehen nicht dabei — dorthin gibt
   * es keinen sinnvollen Weg aus reinem Text.
   */
  readonly turnOptions: { kind: SlashKind; label: string; icon: LucideIconData }[] = [
    { kind: 'text', label: 'Text', icon: this.TextIcon },
    { kind: 'heading1', label: 'Heading 1', icon: this.H1Icon },
    { kind: 'heading2', label: 'Heading 2', icon: this.H2Icon },
    { kind: 'heading3', label: 'Heading 3', icon: this.H3Icon },
    { kind: 'bullet', label: 'Bulleted list', icon: this.BulletIcon },
    { kind: 'number', label: 'Numbered list', icon: this.NumberIcon },
    { kind: 'todo', label: 'To-do list', icon: this.TodoIcon },
    { kind: 'quote', label: 'Quote', icon: this.QuoteIcon },
    { kind: 'code', label: 'Code', icon: this.CodeIcon },
  ];

  /** Der Text eines Blocks, gleich welcher Art — fuer den Typwechsel. */
  private plainOf(block: PlanBlock): string {
    switch (block.type) {
      case 'text':
      case 'heading':
      case 'quote':
        return block.text;
      case 'list':
        return block.items.map((i) => i.text).join('\n');
      case 'code':
        return block.code;
      case 'group':
        return block.title;
      default:
        return '';
    }
  }

  /** Blocktyp wechseln, Inhalt behalten. */
  turnInto(blockId: string, kind: SlashKind): void {
    const block = this.findBlock(blockId);
    if (!block) return;

    const text = this.plainOf(block);
    this.closeBlockMenu();
    this.updateContent((bs) =>
      this.replaceById(bs, blockId, (id) => this.makeConverted(id, kind, text)),
    );
    this.focusConverted(blockId, kind);
  }

  // ---- In ein Toggle hinein und wieder heraus ----
  //
  // Ziehen ist der bequeme Weg, aber kein verlaesslicher: ein Block muss in
  // einem schmalen Streifen landen, und je groesser er ist — eine Tabelle, ein
  // Diagramm —, desto schwerer trifft man. Fuer eine Zuordnung, die im
  // Dokument etwas BEDEUTET, ist Zielgenauigkeit die falsche Voraussetzung.
  //
  // Also derselbe Schritt als Befehl: hinein in das Toggle darueber, heraus
  // hinter das Toggle. Beides ist eine Ebene, kein Weg — deshalb reicht je ein
  // Eintrag, und man muss nicht wissen, wohin genau.

  /** Wo steckt der Block: in welchem Toggle (null = oberste Ebene), an welcher Stelle? */
  private locate(
    blockId: string,
    blocks: PlanBlock[] = this.selected()?.content ?? [],
    groupId: string | null = null,
  ): { groupId: string | null; index: number } | null {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index !== -1) return { groupId, index };

    for (const block of blocks) {
      if (block.type !== 'group') continue;
      const hit = this.locate(blockId, block.blocks, block.id);
      if (hit) return hit;
    }
    return null;
  }

  /** Das Toggle direkt ueber dem Block — nur dort kann er hinein. */
  groupAbove(blockId: string): PlanGroupBlock | null {
    const at = this.locate(blockId);
    if (!at || at.index === 0) return null;

    const list = this.findList(this.selected()?.content ?? [], at.groupId);
    const above = list?.[at.index - 1];
    return above?.type === 'group' ? above : null;
  }

  /** Steckt der Block in einem Toggle? */
  inGroup(blockId: string): boolean {
    return this.locate(blockId)?.groupId != null;
  }

  /** Ans Ende des Toggles darueber — und aufklappen, damit man es sieht. */
  nestIntoAbove(blockId: string) {
    const target = this.groupAbove(blockId);
    const block = this.findBlock(blockId);
    if (!target || !block) return;

    this.closeBlockMenu();
    this.updateContent((root) =>
      this.mapById(this.removeById(root, blockId), target.id, (x) =>
        x.type !== 'group' ? x : { ...x, collapsed: false, blocks: [...x.blocks, block] },
      ),
    );
  }

  /** Aus dem Toggle heraus, direkt dahinter. */
  liftOut(blockId: string) {
    const at = this.locate(blockId);
    const block = this.findBlock(blockId);
    if (!at?.groupId || !block) return;

    this.closeBlockMenu();
    const groupId = at.groupId;
    this.updateContent((root) =>
      this.insertAfterById(this.removeById(root, blockId), groupId, block),
    );
  }

  /**
   * Tabulator im Absatz: eine Ebene hinein oder heraus.
   *
   * Dasselbe wie die beiden Menueeintraege, nur ohne Maus — und die Taste, die
   * in Notion genau das tut.
   */
  onProseIndent(blockId: string, dir: 1 | -1) {
    if (dir === 1) this.nestIntoAbove(blockId);
    else this.liftOut(blockId);
    this.beginEdit(blockId);
  }

  menuDelete(blockId: string) {
    this.deleteBlock(blockId);
    this.closeBlockMenu();
  }

  /** Kopie mit frischen IDs — sonst kollidieren Original und Duplikat. */
  private cloneBlock(block: PlanBlock): PlanBlock {
    const id = this.newId();
    switch (block.type) {
      case 'group':
        return { ...block, id, blocks: block.blocks.map((b) => this.cloneBlock(b)) };
      case 'list':
        return { ...block, id, items: block.items.map((i) => ({ ...i })) };
      case 'table':
        return {
          ...block,
          id,
          columns: [...block.columns],
          rows: block.rows.map((r) => [...r]),
        };
      default:
        return { ...block, id };
    }
  }

  duplicateBlock(blockId: string) {
    const plan = this.selected();
    const original = plan ? this.findById(plan.content, blockId) : null;
    if (!original) return;
    const copy = this.cloneBlock(original);
    this.updateContent((b) => this.insertAfterById(b, blockId, copy));
    this.closeBlockMenu();
  }

  protected readonly plans = this.planService.plans;

  /** „saving" oder „retrying" — siehe PlanService. */
  protected readonly saveState = this.planService.saveState;

  // ---- Reihenfolge der Plaene ----
  //
  // Sortiert wird serverseitig ueber plans.position; die Liste kommt bereits
  // geordnet zurueck. Der Handler schickt nur die neue Reihenfolge der IDs.
  dropPlan(event: CdkDragDrop<unknown>) {
    if (event.previousIndex === event.currentIndex) return;

    // Die Kacheln zeigen gefiltert nur einen Ausschnitt. Die Indizes von dort
    // auf die gespeicherte Liste anzuwenden hiesse, beim Sortieren im Filter
    // fremde Plaene zu vertauschen — also erst ueber die IDs umrechnen.
    const visible = this.visiblePlans();
    const moved = visible[event.previousIndex];
    const target = visible[event.currentIndex];
    if (!moved || !target) return;

    const ids = this.plans().map((p) => p.id);
    const from = ids.indexOf(moved.id);
    const to = ids.indexOf(target.id);
    if (from === -1 || to === -1 || from === to) return;

    ids.splice(from, 1);
    ids.splice(to, 0, moved.id);
    this.planService.reorderPlans(ids);
  }
  protected readonly loading = this.planService.loading;
  protected readonly labels = this.labelService.labels;

  /** Übersicht: Kacheln oder Graph. */
  protected readonly overviewMode = signal<'list' | 'graph'>('list');

  setOverviewMode(mode: 'list' | 'graph') {
    this.overviewMode.set(mode);
  }

  // ---- Übersicht filtern ----
  //
  // Die Kachelliste war der einzige Weg zu einem Plan, dessen Namen man nicht
  // mehr genau im Kopf hat: ⌘K braucht den Titel, der Graph zeigt nur
  // Verlinktes. Ab ein paar Dutzend Plänen bleibt sonst nur Scrollen.

  /** Sentinel-Werte des Folder-Filters. Echte Folder tragen eine UUID, also
   *  kann keiner heißen wie diese beiden. */
  protected readonly ALL_FOLDERS = 'all';
  protected readonly NO_FOLDER = 'standalone';

  protected readonly overviewQuery = signal('');
  protected readonly overviewFolder = signal<string>('all');

  protected readonly overviewFiltered = computed(
    () =>
      this.overviewQuery().trim().length > 0 ||
      this.overviewFolder() !== this.ALL_FOLDERS,
  );

  /**
   * Der durchsuchbare Text eines Plans: Titel und Inhalt.
   *
   * Nur nach Titeln zu suchen hilft genau dann nicht, wenn man sucht — man
   * erinnert den Inhalt, nicht die Überschrift. Das Ergebnis wird je Fassung
   * eines Plans einmal gebaut und gemerkt: ohne den Merker liefe bei jedem
   * Tastendruck der komplette Inhalt aller Pläne erneut durch.
   */
  private readonly haystacks = new Map<string, string>();

  private haystack(plan: Plan): string {
    const key = `${plan.id}:${plan.updatedAt}`;
    const cached = this.haystacks.get(key);
    if (cached !== undefined) return cached;

    // Derselbe Durchlauf, den der Graph für die Verlinkung braucht.
    const text = `${plan.title}\n${planPlainText(plan)}`.toLowerCase();
    // Nur die aktuelle Fassung je Plan behalten, sonst wächst die Map mit
    // jedem Tastendruck im Editor.
    for (const existing of this.haystacks.keys()) {
      if (existing.startsWith(`${plan.id}:`)) this.haystacks.delete(existing);
    }
    this.haystacks.set(key, text);
    return text;
  }

  /** Die Pläne, die Suche und Folder-Filter übrig lassen. */
  protected readonly visiblePlans = computed<Plan[]>(() => {
    const query = this.overviewQuery().trim().toLowerCase();
    const folder = this.overviewFolder();

    return this.plans().filter((plan) => {
      if (folder === this.NO_FOLDER) {
        if (plan.categoryId !== null) return false;
      } else if (folder !== this.ALL_FOLDERS && plan.categoryId !== folder) {
        return false;
      }

      return !query || this.haystack(plan).includes(query);
    });
  });

  /**
   * Die Folder, auf die sich filtern lässt — nur solche mit Plänen.
   *
   * Ein Folder ohne Plan wäre ein Knopf, der garantiert eine leere Liste
   * zeigt. Die Zählung steht daneben, damit man vor dem Klick weiß, was kommt.
   */
  protected readonly folderFilters = computed(() => {
    const counts = new Map<string | null, number>();
    for (const plan of this.plans()) {
      counts.set(plan.categoryId, (counts.get(plan.categoryId) ?? 0) + 1);
    }

    const chips = this.labels()
      .filter((label) => counts.has(label.id))
      .map((label) => ({
        id: label.id,
        name: label.name,
        count: counts.get(label.id) ?? 0,
      }));

    const standalone = counts.get(null) ?? 0;
    if (standalone > 0) {
      chips.push({ id: this.NO_FOLDER, name: 'Standalone', count: standalone });
    }

    return chips;
  });

  setOverviewFolder(id: string) {
    this.overviewFolder.set(id);
  }

  clearOverviewFilters() {
    this.overviewQuery.set('');
    this.overviewFolder.set(this.ALL_FOLDERS);
  }

  protected readonly selected = computed<Plan | null>(() => {
    const id = this.planService.selectedId();
    return id ? this.plans().find((p) => p.id === id) ?? null : null;
  });

  // ---- Slash-Menü (Notion-Stil) ----
  /** Einträge des „/"-Menüs. Reihenfolge = Anzeige-Reihenfolge. */
  private readonly SLASH_MENU: {
    kind: SlashKind;
    label: string;
    hint: string;
    icon: LucideIconData;
    keywords: string;
  }[] = [
    { kind: 'text', label: 'Text', hint: 'Plain paragraph', icon: this.TextIcon, keywords: 'text plain paragraph note body' },
    { kind: 'heading1', label: 'Heading 1', hint: 'Large section title', icon: this.H1Icon, keywords: 'heading1 heading title h1 big large' },
    { kind: 'heading2', label: 'Heading 2', hint: 'Medium heading', icon: this.H2Icon, keywords: 'heading2 heading h2 medium subtitle' },
    { kind: 'heading3', label: 'Heading 3', hint: 'Small heading', icon: this.H3Icon, keywords: 'heading3 heading h3 small' },
    { kind: 'bullet', label: 'Bulleted list', hint: 'One line per item', icon: this.BulletIcon, keywords: 'bullet list ul unordered dash point' },
    { kind: 'number', label: 'Numbered list', hint: 'Ordered steps', icon: this.NumberIcon, keywords: 'number numbered list ol ordered steps' },
    { kind: 'todo', label: 'To-do list', hint: 'Checkboxes you can tick', icon: this.TodoIcon, keywords: 'todo task checkbox check list' },
    { kind: 'code', label: 'Code', hint: 'Monospace block', icon: this.CodeIcon, keywords: 'code snippet monospace pre terminal' },
    { kind: 'quote', label: 'Quote', hint: 'Callout with a side bar', icon: this.QuoteIcon, keywords: 'quote callout note blockquote aside' },
    { kind: 'divider', label: 'Divider', hint: 'Horizontal rule', icon: this.DividerIcon, keywords: 'divider rule separator line hr break' },
    { kind: 'toggle', label: 'Toggle', hint: 'Collapsible section', icon: this.SectionIcon, keywords: 'accordion akkordeon toggle dropdown section group collapsible container fold aufklappen einklappen' },
    { kind: 'table', label: 'Table', hint: 'Rows and columns', icon: this.TableIcon, keywords: 'table grid rows columns' },
    { kind: 'diagram', label: 'Diagram', hint: 'Mermaid flowchart', icon: this.DiagramIcon, keywords: 'diagram flow flowchart mermaid chart' },
  ];

  /** Offenes Menü: Block, markierter Eintrag, Position des „/" + Query dahinter. */
  readonly slash = signal<{
    blockId: string;
    index: number;
    start: number;
    query: string;
  } | null>(null);

  /** Gefilterte Menü-Einträge zum aktuellen Query hinter dem „/". */
  readonly slashResults = computed(() => {
    const s = this.slash();
    if (!s) return [];
    const q = s.query.toLowerCase();
    return this.SLASH_MENU.filter(
      (it) => !q || it.label.toLowerCase().includes(q) || it.keywords.includes(q),
    );
  });

  /**
   * Sucht ein „/…"-Kommando direkt links vom Cursor — auch mitten im Text.
   * Die Regeln stecken in detectSlashToken (dort auch die Tests).
   */
  private detectSlash(value: string, caret: number): { start: number; query: string } | null {
    return detectSlashToken(value, caret);
  }

  // ---- Wikilink-Vervollstaendigung ----

  /** Offener „[[…"-Vorschlag: Block, Markierung, Position und Query. */
  readonly wikiPick = signal<{
    blockId: string;
    index: number;
    start: number;
    query: string;
  } | null>(null);

  readonly wikiResults = computed<Plan[]>(() => {
    const pick = this.wikiPick();
    if (!pick) return [];
    const query = pick.query.trim().toLowerCase();
    const current = this.selected();
    return this.plans()
      .filter((p) => p.id !== current?.id)
      .filter((p) => !query || p.title.toLowerCase().includes(query))
      .slice(0, 6);
  });

  wikiActiveIndex(): number {
    const pick = this.wikiPick();
    if (!pick) return -1;
    return Math.min(pick.index, this.wikiResults().length - 1);
  }

  /** Setzt „[[Titel]]" ein und laesst den Cursor dahinter stehen. */
  chooseWiki(blockId: string, title: string) {
    const pick = this.wikiPick();
    this.wikiPick.set(null);
    if (!pick) return;

    const field = this.field(this.blockFieldId(blockId));
    if (!field) return;

    // Ueber den Browser ersetzen statt am Modell: so bleibt der
    // Rueckgaengig-Stapel heil, und das Feld nimmt den neuen Stand selbst auf.
    replaceRange(field, pick.start, pick.start + 2 + pick.query.length, `[[${title}]]`);
  }

  // ---- Auswahl-Werkzeugleiste ----
  //
  // Notions auffaelligstes Bedienelement: markieren, und die Leiste steht da.
  // Tastenkuerzel gibt es weiter, aber niemand lernt sie, ohne sie einmal
  // gesehen zu haben — und mit der Maus markiert man ohnehin schon.

  /** Bildschirmposition der Leiste, oder null wenn nichts markiert ist. */
  protected readonly toolbar = signal<{ x: number; y: number } | null>(null);

  @HostListener('document:selectionchange')
  onSelectionChange(): void {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.toolbar.set(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el?.closest('.rich-text')) {
      this.toolbar.set(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.toolbar.set(null);
      return;
    }
    this.toolbar.set({ x: rect.left + rect.width / 2, y: rect.top });
  }

  /** Auszeichnung auf die Auswahl anwenden. */
  applyFormat(command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
    // Ohne das schreibt der Browser <span style="…"> statt <b>, und aus einem
    // style-Attribut laesst sich kein Markdown machen.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command);
  }

  /**
   * Zeichen um die Auswahl legen — fuer die beiden Faelle, die kein
   * Browserbefehl kennt: Code und Wikilink.
   */
  wrapSelection(before: string, after: string): void {
    const text = document.getSelection()?.toString() ?? '';
    if (!text) return;
    document.execCommand('insertText', false, `${before}${text}${after}`);
  }

  /**
   * Nur die offenen Menues — Fett, Kursiv und das Verhalten der Tasten im Text
   * liegen in der Editor-Direktive.
   */
  onTextKeydown(event: KeyboardEvent, blockId: string) {
    // Der Wikilink-Vorschlag liegt vorn: er ist offen, waehrend getippt wird.
    const pick = this.wikiPick();
    if (pick && pick.blockId === blockId) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.wikiPick.set(null);
        return;
      }
      const hits = this.wikiResults();
      if (!hits.length) return;
      const at = Math.min(pick.index, hits.length - 1);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.wikiPick.set({ ...pick, index: (at + 1) % hits.length });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.wikiPick.set({ ...pick, index: (at - 1 + hits.length) % hits.length });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.chooseWiki(blockId, hits[at].title);
      }
      return;
    }

    const s = this.slash();
    if (!s || s.blockId !== blockId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.slash.set(null);
      return;
    }
    const items = this.slashResults();
    if (!items.length) return;
    const idx = Math.min(s.index, items.length - 1);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.slash.set({ ...s, index: (idx + 1) % items.length });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.slash.set({ ...s, index: (idx - 1 + items.length) % items.length });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.chooseSlash(blockId, items[idx].kind);
    }
  }

  slashActiveIndex(): number {
    const s = this.slash();
    if (!s) return -1;
    return Math.min(s.index, this.slashResults().length - 1);
  }

  chooseSlash(blockId: string, kind: SlashKind) {
    const s = this.slash();
    this.slash.set(null);

    const plan = this.selected();
    const block = plan ? this.findById(plan.content, blockId) : null;
    const text = block && block.type === 'text' ? block.text : '';
    const start = s ? s.start : 0;
    const query = s ? s.query : '';
    // Das getippte „/…" herausschneiden — der Rest ist Text, den der Nutzer
    // behalten will.
    const rest = text.slice(0, start) + text.slice(start + 1 + query.length);

    if (rest.trim() === '') {
      // Leerer Block: an Ort und Stelle umwandeln, die Position bleibt.
      this.updateContent((b) =>
        this.replaceById(b, blockId, (id) => this.makeConverted(id, kind)),
      );
      this.focusConverted(blockId, kind);
      return;
    }

    // Stand schon Text im Block, bleibt der stehen und der neue Block kommt
    // direkt darunter — sonst wuerde das Kommando den Absatz ueberschreiben.
    const created = this.makeConverted(this.newId(), kind);
    this.updateContent((b) =>
      this.insertAfterById(
        this.mapById(b, blockId, (x) => (x.type === 'text' ? { ...x, text: rest } : x)),
        blockId,
        created,
      ),
    );
    this.focusConverted(created.id, kind);
  }

  /**
   * In den frisch umgewandelten Block springen.
   *
   * Eine Liste hat kein Feld am Block, sondern eins je Eintrag; eine
   * Trennlinie, eine Tabelle und ein Diagramm haben gar keins zum Schreiben.
   */
  private focusConverted(blockId: string, kind: SlashKind): void {
    if (kind === 'bullet' || kind === 'number' || kind === 'todo') {
      this.focusItem(blockId, 0, 'end');
      return;
    }
    if (kind === 'divider' || kind === 'table' || kind === 'diagram') return;
    this.beginEdit(blockId);
  }

  /**
   * Neuer Block des gewaehlten Typs. `initial` uebernimmt den bereits
   * getippten Text — bei einem Markdown-Kurzbefehl steht hinter dem Praefix
   * schon Inhalt, der sonst verloren ginge.
   */
  private makeConverted(id: string, kind: SlashKind, initial = ''): PlanBlock {
    switch (kind) {
      case 'text':
        return { id, type: 'text', text: initial };
      case 'heading1':
        return { id, type: 'heading', level: 1, text: initial };
      case 'heading2':
        return { id, type: 'heading', level: 2, text: initial };
      case 'heading3':
        return { id, type: 'heading', level: 3, text: initial };
      case 'bullet':
        return { id, type: 'list', variant: 'bullet', items: toItems(initial) };
      case 'number':
        return { id, type: 'list', variant: 'number', items: toItems(initial) };
      case 'todo':
        return { id, type: 'list', variant: 'todo', items: toItems(initial) };
      case 'code':
        return { id, type: 'code', language: '', code: initial };
      case 'quote':
        return { id, type: 'quote', text: initial };
      case 'divider':
        return { id, type: 'divider' };
      case 'toggle':
        return { id, type: 'group', title: initial, collapsed: false, blocks: [] };
      case 'table':
        return { id, type: 'table', columns: ['Column 1', 'Column 2'], rows: [['', '']] };
      case 'diagram':
        return { id, type: 'diagram', code: DIAGRAM_TEMPLATE };
    }
  }

  /**
   * Markdown-Kurzbefehl am Blockanfang („# ", „- ", „> ", „```" …): der Block
   * wird sofort umgewandelt, der Text hinter dem Praefix wandert mit.
   */
  private applyMarkdownShortcut(blockId: string, kind: MarkdownBlockKind, rest: string) {
    this.slash.set(null);
    this.wikiPick.set(null);

    // Eine Trennlinie nimmt den Absatz mit, in dem man gerade schreibt. Ohne
    // einen frischen darunter stuende der Cursor nach „---" im Nichts.
    if (kind === 'divider') {
      const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
      this.updateContent((bs) =>
        this.insertAfterById(
          this.replaceById(bs, blockId, (id) => ({ id, type: 'divider' })),
          blockId,
          created,
        ),
      );
      this.beginEdit(created.id, 0);
      return;
    }

    this.updateContent((bs) =>
      this.replaceById(bs, blockId, (id) => this.makeConverted(id, kind, rest)),
    );
    // Der Block ist durch einen anderen Typ ersetzt worden — das Feld im
    // Template ist ein neues Element und braucht Fokus und Cursor erneut.
    this.focusConverted(blockId, kind);
  }

  // ---- Editor ----
  //
  // Es gibt keinen Lese- und keinen Schreibmodus. Ein Block ist immer beides:
  // formatierter Text, in dem der Cursor steht. Getipptes „**fett**" wird fett,
  // sobald die zweiten Sternchen stehen — Rohtext bekommt man nie zu sehen.
  //
  // Die Uebersetzung zwischen Ansicht und gespeichertem Markdown steht in
  // rich-text.ts, das Verhalten der Tasten in der Direktive. Hier steht nur,
  // was ein Tastendruck mit dem DOKUMENT macht: teilen, zusammenfuegen,
  // umwandeln, springen.

  /** Kennung des Schreibfeldes eines Blocks bzw. eines Listeneintrags. */
  blockFieldId(blockId: string): string {
    return 'block-edit-' + blockId;
  }
  itemFieldId(blockId: string, index: number): string {
    return `item-edit-${blockId}-${index}`;
  }

  private field(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
  }

  /**
   * In ein Feld springen, sobald es gezeichnet ist.
   *
   * Ein gerade angelegter Block existiert im DOM erst nach dem naechsten
   * Durchlauf; ohne das Warten liefe der Fokus ins Leere und der Cursor bliebe
   * im alten Block stehen.
   */
  private focusField(id: string, at: number | 'end'): void {
    requestAnimationFrame(() => {
      const el = this.field(id);
      if (!el) return;

      // Code und der Titel eines Toggles sind bewusst schlichte Felder — dort
      // gibt es nichts zu formatieren, also auch keinen Rich-Text-Cursor.
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.focus();
        const pos = at === 'end' ? el.value.length : Math.min(at, el.value.length);
        el.setSelectionRange(pos, pos);
        return;
      }

      focusRich(el, at);
    });
  }

  /** Cursor in diesen Block setzen. */
  beginEdit(blockId: string, at: number | 'end' = 'end'): void {
    this.focusField(this.blockFieldId(blockId), at);
  }

  private focusItem(blockId: string, index: number, at: number | 'end'): void {
    this.focusField(this.itemFieldId(blockId, index), at);
  }

  /** Ist an diesem Block ein Menue offen? Dann gehoeren ihm Pfeile und Enter. */
  menuOpenFor(blockId: string): boolean {
    return this.slash()?.blockId === blockId || this.wikiPick()?.blockId === blockId;
  }

  /** Alle Schreibstellen des Plans in Dokumentreihenfolge. */
  private fieldOrder(): string[] {
    const out: string[] = [];
    const walk = (blocks: PlanBlock[]) => {
      for (const b of blocks) {
        if (b.type === 'text' || b.type === 'heading' || b.type === 'quote') {
          out.push(this.blockFieldId(b.id));
        } else if (b.type === 'list') {
          b.items.forEach((_, i) => out.push(this.itemFieldId(b.id, i)));
        } else if (b.type === 'group') {
          walk(b.blocks);
        }
      }
    };
    walk(this.selected()?.content ?? []);
    return out;
  }

  /**
   * Pfeiltaste ueber die Kante des Blocks hinaus: ins naechste Feld, Cursor an
   * dessen nahes Ende. Ohne das kaeme man von Block zu Block nur mit der Maus.
   */
  private step(fieldId: string, dir: 'up' | 'down'): void {
    const ids = this.fieldOrder();
    const next = ids[ids.indexOf(fieldId) + (dir === 'up' ? -1 : 1)];
    const el = next ? this.field(next) : null;
    if (el) focusRich(el, dir === 'up' ? 'end' : 0);
  }

  stepFromBlock(blockId: string, dir: 'up' | 'down'): void {
    this.step(this.blockFieldId(blockId), dir);
  }
  stepFromItem(blockId: string, index: number, dir: 'up' | 'down'): void {
    this.step(this.itemFieldId(blockId, index), dir);
  }

  /** Text eines Absatzes, einer Ueberschrift oder eines Zitats setzen. */
  private setBlockText(blocks: PlanBlock[], blockId: string, text: string): PlanBlock[] {
    return this.mapById(blocks, blockId, (x) =>
      x.type === 'text' || x.type === 'heading' || x.type === 'quote' ? { ...x, text } : x,
    );
  }

  /** Der Text eines Blocks, soweit er ueberhaupt einen traegt. */
  private textOf(block: PlanBlock | null): string | null {
    if (!block) return null;
    return block.type === 'text' || block.type === 'heading' || block.type === 'quote'
      ? block.text
      : null;
  }

  /** Ueberschrift und Zitat: nur speichern, hier wandelt sich nichts um. */
  onProseChange(blockId: string, change: { value: string; caret: number }): void {
    this.updateContent((bs) => this.setBlockText(bs, blockId, change.value), `text:${blockId}`);
  }

  /**
   * Eingabe im Absatz: speichern — und schauen, ob daraus gerade etwas anderes
   * werden soll. Ein Kurzbefehl wandelt den Block um, „/" oeffnet das Menue,
   * „[[" die Planvorschlaege.
   */
  onTextChange(blockId: string, change: { value: string; caret: number }): void {
    this.updateContent((bs) => this.setBlockText(bs, blockId, change.value), `text:${blockId}`);

    const shortcut = detectMarkdownShortcut(change.value);
    if (shortcut) {
      this.applyMarkdownShortcut(blockId, shortcut.kind, shortcut.rest);
      return;
    }

    this.trackMenus(blockId, change.value, change.caret);
  }

  /** Offene Menues am Cursor nachfuehren. */
  private trackMenus(blockId: string, value: string, caret: number): void {
    const at = caret < 0 ? value.length : caret;

    const wiki = detectWikiToken(value, at);
    if (wiki) {
      this.slash.set(null);
      const current = this.wikiPick();
      this.wikiPick.set({
        blockId,
        index: current && current.blockId === blockId ? current.index : 0,
        start: wiki.start,
        query: wiki.query,
      });
      return;
    }
    if (this.wikiPick()?.blockId === blockId) this.wikiPick.set(null);

    const token = this.detectSlash(value, at);
    if (token) {
      const current = this.slash();
      this.slash.set({
        blockId,
        index: current && current.blockId === blockId ? current.index : 0,
        start: token.start,
        query: token.query,
      });
    } else if (this.slash()?.blockId === blockId) {
      this.slash.set(null);
    }
  }

  /**
   * Enter teilt den Block (Notion).
   *
   * Der neue Block ist ein Absatz — ausser man teilt eine Ueberschrift oder ein
   * Zitat mittendrin, dann bleibt der Typ erhalten. Enter am ENDE einer
   * Ueberschrift heisst „jetzt kommt der Text dazu"; eine zweite, leere
   * Ueberschrift wollte noch nie jemand.
   */
  splitBlock(blockId: string, before: string, after: string): void {
    const block = this.findBlock(blockId);
    if (!block) return;

    const id = this.newId();
    const keep = after.trim() !== '';
    const created: PlanBlock =
      keep && block.type === 'heading'
        ? { id, type: 'heading', level: block.level, text: after }
        : keep && block.type === 'quote'
          ? { id, type: 'quote', text: after }
          : { id, type: 'text', text: after };

    this.slash.set(null);
    this.wikiPick.set(null);
    this.updateContent((bs) =>
      this.insertAfterById(this.setBlockText(bs, blockId, before), blockId, created),
    );
    this.beginEdit(created.id, 0);
  }

  /**
   * Rueckschritt am Blockanfang — in zwei Stufen, wie in Notion.
   *
   * Erst faellt die Auszeichnung weg: aus der Ueberschrift wird ein Absatz. Wer
   * wirklich loeschen will, drueckt noch einmal. Das ist der Unterschied
   * zwischen „das sollte keine Ueberschrift sein" und „weg damit" — und beides
   * kommt vor, das erste haeufiger.
   */
  mergeBack(blockId: string): void {
    const block = this.findBlock(blockId);
    if (!block) return;

    if (block.type === 'heading' || block.type === 'quote') {
      const text = block.text;
      this.updateContent((bs) =>
        this.replaceById(bs, blockId, (id) => ({ id, type: 'text', text })),
      );
      this.beginEdit(blockId, 0);
      return;
    }
    if (block.type !== 'text') return;

    const previous = this.blockBefore(blockId);
    if (!previous) return;

    // Eine Trennlinie traegt keinen Text; sie verschwindet einfach.
    if (previous.type === 'divider') {
      this.updateContent((bs) => this.removeById(bs, previous.id));
      this.beginEdit(blockId, 0);
      return;
    }

    // In den letzten Eintrag der Liste darueber hineinlaufen.
    if (previous.type === 'list') {
      const index = previous.items.length - 1;
      const joined = previous.items[index]?.text ?? '';
      this.updateContent((bs) =>
        this.removeById(
          this.mapById(bs, previous.id, (x) =>
            x.type !== 'list'
              ? x
              : {
                  ...x,
                  items: x.items.map((it, i) =>
                    i === index ? { ...it, text: it.text + block.text } : it,
                  ),
                },
          ),
          blockId,
        ),
      );
      this.focusItem(previous.id, index, joined.length);
      return;
    }

    // Tabelle, Diagramm, Code: da ist nichts zusammenzufuegen.
    const head = this.textOf(previous);
    if (head === null) return;

    this.updateContent((bs) =>
      this.removeById(this.setBlockText(bs, previous.id, head + block.text), blockId),
    );
    this.focusField(this.blockFieldId(previous.id), head.length);
  }

  /** Der Block davor in Dokumentreihenfolge — auch ueber Gruppengrenzen. */
  private blockBefore(blockId: string): PlanBlock | null {
    const flat: PlanBlock[] = [];
    const walk = (blocks: PlanBlock[]) => {
      for (const b of blocks) {
        flat.push(b);
        if (b.type === 'group') walk(b.blocks);
      }
    };
    walk(this.selected()?.content ?? []);

    const at = flat.findIndex((b) => b.id === blockId);
    return at > 0 ? flat[at - 1] : null;
  }

  /**
   * Feld verlassen. Eintraege im Slash-Menue verhindern den Fokusverlust selbst
   * (mousedown/preventDefault); ein echtes blur heisst also: der Cursor ist
   * woanders, das Menue darf zu.
   */
  onProseBlur(blockId: string): void {
    if (this.slash()?.blockId === blockId) this.slash.set(null);
    if (this.wikiPick()?.blockId === blockId) this.wikiPick.set(null);

    // Absatz fertig geschrieben: steht darueber keine Ueberschrift, eine setzen.
    void this.titleUnheadedBlock(blockId);
  }

  /**
   * Setzt eine Ueberschrift ueber den Block, wenn direkt darueber keine steht.
   *
   * Laeuft beim Verlassen des Absatzes, nicht beim Tippen: waehrend des
   * Schreibens ist der Text noch keine Aussage, und jeder Tastendruck waere
   * ein Aufruf. Verlassen heisst „fertig gedacht" — das ist der richtige
   * Moment, und es ist genau einer pro Absatz.
   */
  private async titleUnheadedBlock(blockId: string): Promise<void> {
    const plan = this.selected();
    if (!plan || !this.suggestAvailable()) return;
    if (!needsHeading(plan.content, blockId)) return;

    const block = this.findBlock(blockId);
    if (!block) return;

    const text = blockText(block);
    const title = await this.titles.fetchTitle(text);
    if (!title) return;

    // Zwischen Anfrage und Antwort liegen Sekunden. In der Zeit kann der Nutzer
    // selbst eine Ueberschrift gesetzt, den Block verschoben oder weiter
    // getippt haben — dann waere die Antwort veraltet und das Einfuegen falsch.
    const current = this.selected();
    if (!current || !needsHeading(current.content, blockId)) return;
    const stillSame = this.findBlock(blockId);
    if (!stillSame || blockText(stillSame) !== text) return;

    this.acceptSuggestion(blockId, title);
  }

  /**
   * Klick ins Feld.
   *
   * Der Cursor landet, wo man hinklickt — dafuer ist ein Schreibfeld da. Ein
   * Wikilink oeffnet sich deshalb mit Befehls- bzw. Strg-Taste, wie in jedem
   * Editor, in dem Links auch bearbeitet werden koennen. Ein einfacher Klick
   * auf den Link wuerde sonst die Stelle anspringen, an der man gerade etwas
   * aendern wollte.
   */
  onFieldClick(event: MouseEvent): void {
    if (!event.metaKey && !event.ctrlKey) return;

    const target = event.target as HTMLElement | null;
    const link = target?.closest?.('[data-plan]') as HTMLElement | null;
    if (!link) return;

    event.preventDefault();
    event.stopPropagation();
    this.openByTitle(link.textContent ?? '');
  }

  // ---- Wikilinks & Backlinks (Obsidian) ----

  /** [[Titel]] öffnet den Plan; gibt es ihn nicht, wird er angelegt. */
  openByTitle(title: string) {
    const wanted = title.trim().toLowerCase();
    if (!wanted) return;
    const found = this.plans().find((p) => p.title.trim().toLowerCase() === wanted);
    if (found) {
      this.planService.select(found.id);
      return;
    }
    this.planService.createPlan(title.trim(), this.selected()?.categoryId ?? null);
  }

  /** Pläne, die auf den offenen Plan verweisen. */
  protected readonly backlinks = computed<Plan[]>(() => {
    const current = this.selected();
    if (!current) return [];
    const title = current.title.trim().toLowerCase();
    if (!title) return [];
    return this.plans().filter(
      (p) =>
        p.id !== current.id &&
        planLinkTargets(p).some((t) => t.toLowerCase() === title),
    );
  });

  /**
   * Pläne, die den Titel erwähnen, ohne ihn zu verlinken — die Kandidaten, aus
   * denen echte Verknüpfungen werden. Sehr kurze Titel bleiben außen vor, sie
   * träfen fast jeden Text.
   */
  protected readonly unlinkedMentions = computed<Plan[]>(() => {
    const current = this.selected();
    if (!current) return [];
    const title = current.title.trim().toLowerCase();
    if (title.length < 3) return [];
    const alreadyLinked = new Set(this.backlinks().map((p) => p.id));
    return this.plans().filter(
      (p) =>
        p.id !== current.id &&
        !alreadyLinked.has(p.id) &&
        planPlainText(p).toLowerCase().includes(title),
    );
  });

  // ---- Quick Switcher (⌘K) ----
  //
  // Ab ein paar Duzend Plaenen ist die Kachelliste kein Weg mehr. Tippen und
  // Enter ist er.

  protected readonly switcherOpen = signal(false);
  protected readonly switcherQuery = signal('');

  protected readonly switcherResults = computed<Plan[]>(() => {
    const query = this.switcherQuery().trim().toLowerCase();
    return this.plans()
      .filter((p) => !query || p.title.toLowerCase().includes(query))
      .slice(0, 8);
  });

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const opening = !this.switcherOpen();
      this.switcherOpen.set(opening);
      this.switcherQuery.set('');
      if (opening) {
        requestAnimationFrame(() => document.getElementById('plan-switcher-input')?.focus());
      }
      return;
    }
    if (event.key === 'Escape' && this.switcherOpen()) this.switcherOpen.set(false);
    if (event.key === 'Escape' && this.tableFull()) this.tableFull.set(null);

    // ⌘Z fuer das Dokument, nicht fuer ein einzelnes Feld.
    //
    // Die schlichten Felder (Titel, Code, Tabellenzelle) behalten ihr eigenes
    // Rueckgaengig — dort erwartet man das Verhalten eines Eingabefeldes. In
    // allem anderen zaehlt der Zug am Dokument: einen geloeschten Block holt
    // kein Textfeld zurueck.
    if (!this.selected()) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;

    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    event.preventDefault();
    if (event.shiftKey) this.redo();
    else this.undo();
  }

  closeSwitcher() {
    this.switcherOpen.set(false);
  }

  openFromSwitcher(id: string) {
    this.switcherOpen.set(false);
    this.planService.select(id);
  }

  /** Enter ohne Treffer legt den Plan an — wie „create note" in Obsidian. */
  switcherSubmit() {
    const hit = this.switcherResults()[0];
    if (hit) {
      this.openFromSwitcher(hit.id);
      return;
    }
    const title = this.switcherQuery().trim();
    if (!title) return;
    this.switcherOpen.set(false);
    this.planService.createPlan(title, this.selected()?.categoryId ?? null);
  }

  // ---- Liste, Code, Zitat ----

  asList(block: PlanBlock): PlanListBlock {
    return block as PlanListBlock;
  }
  // ---- Listenzeilen, fertig gerechnet ----
  //
  // Die Vorlage rechnete pro Eintrag und pro Durchlauf der Aenderungserkennung:
  // Zeichen der Ebene, Einzug, Kennung des Feldes — und viermal „ist das
  // abgehakt", was jedes Mal das verknuepfte Todo nachschlug. Ein Dokument mit
  // zehn Listen zu zehn Punkten kam so auf einige hundert Aufrufe je
  // Tastendruck, fuer ein Ergebnis, das sich nur aendert, wenn sich die Liste
  // aendert.
  //
  // Hier steht es einmal je Datenstand. Dieselbe Kur wie in der Todo-Liste.

  /**
   * Gedaechtnis fuer unveraenderte Listen.
   *
   * Beim Tippen entsteht ein neuer Inhaltsbaum, aber die Bloecke, die niemand
   * angefasst hat, sind DIESELBEN Objekte — alle Aenderungen ersetzen
   * unveraenderlich. Daran laesst sich erkennen, was neu gerechnet werden muss:
   * bei einem Anschlag genau eine Liste statt aller.
   */
  private readonly rowCache = new Map<
    string,
    { block: PlanListBlock; todos: readonly Todo[]; rows: ListRow[] }
  >();

  protected readonly listRows = computed<Map<string, ListRow[]>>(() => {
    const out = new Map<string, ListRow[]>();
    // Der Haken eines verknuepften Eintrags haengt an den Todos.
    const todos = this.todoService.snapshot();

    const walk = (blocks: PlanBlock[]) => {
      for (const block of blocks) {
        if (block.type === 'group') {
          walk(block.blocks);
          continue;
        }
        if (block.type !== 'list') continue;

        const cached = this.rowCache.get(block.id);
        if (cached && cached.block === block && cached.todos === todos) {
          out.set(block.id, cached.rows);
          continue;
        }

        const markers = listMarkers(block.items, block.variant);
        const rows = block.items.map((item, index) => {
            const todo = this.todoService.todoById(item.todoId);
            return {
              text: item.text,
              fieldId: this.itemFieldId(block.id, index),
              marker: markers[index],
              indent: levelOf(item) * 1.5,
              // Haengt der Eintrag an einem Todo, zaehlt dessen Zustand — es
              // gibt genau einen Haken, nicht zwei.
              checked: todo?.completed ?? item.checked,
              todo,
            };
        });

        this.rowCache.set(block.id, { block, todos, rows });
        out.set(block.id, rows);
      }
    };

    walk(this.selected()?.content ?? []);

    // Geloeschte Listen nicht ewig mitschleppen.
    for (const id of [...this.rowCache.keys()]) {
      if (!out.has(id)) this.rowCache.delete(id);
    }

    return out;
  });

  /** Die Zeilen einer Liste; leer, solange es sie nicht gibt. */
  rowsOf(blockId: string): ListRow[] {
    return this.listRows().get(blockId) ?? [];
  }

  private mapItems(
    blockId: string,
    fn: (items: PlanListItem[]) => PlanListItem[],
    typing: string | null = null,
  ): void {
    this.updateContent(
      (bs) =>
        this.mapById(bs, blockId, (x) => (x.type !== 'list' ? x : { ...x, items: fn(x.items) })),
      typing,
    );
  }

  setItemText(blockId: string, index: number, text: string): void {
    this.mapItems(
      blockId,
      (items) => items.map((it, i) => (i === index ? { ...it, text } : it)),
      `item:${blockId}:${index}`,
    );
  }

  /**
   * Enter im Eintrag: teilen, der Rest wird der naechste Punkt.
   *
   * Auf einem leeren Punkt heisst Enter dagegen „fertig" — erst eine Ebene
   * heraus, und auf der obersten raus aus der Liste. Ohne das kaeme man aus
   * einer Aufzaehlung nur mit der Maus wieder heraus.
   */
  splitItem(blockId: string, index: number, before: string, after: string): void {
    const block = this.findBlock(blockId);
    if (!block || block.type !== 'list') return;
    const level = levelOf(block.items[index] ?? { text: '', checked: false });

    if (before === '' && after === '') {
      if (level > 0) {
        this.indentItem(blockId, index, -1);
        return;
      }

      const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
      if (block.items.length === 1) {
        this.updateContent((bs) => this.replaceById(bs, blockId, () => created));
      } else {
        this.updateContent((bs) =>
          this.insertAfterById(
            this.mapById(bs, blockId, (x) =>
              x.type !== 'list' ? x : { ...x, items: x.items.filter((_, i) => i !== index) },
            ),
            blockId,
            created,
          ),
        );
      }
      this.beginEdit(created.id, 0);
      return;
    }

    this.mapItems(blockId, (items) => {
      const next = [...items];
      next[index] = { ...next[index], text: before };
      // Der neue Punkt erbt die Ebene, aber NICHT die Verknuepfung zum Todo:
      // ein Haken gehoert genau einer Aufgabe.
      next.splice(index + 1, 0, { text: after, checked: false, level });
      return next;
    });
    this.focusItem(blockId, index + 1, 0);
  }

  /**
   * Rueckschritt am Anfang eines Eintrags: in den vorigen hineinlaufen.
   *
   * Beim ersten Punkt faellt stattdessen die Auszeichnung weg — aus ihm wird
   * ein Absatz, der Rest der Liste bleibt stehen. Dieselbe Zweistufigkeit wie
   * bei den Ueberschriften.
   */
  mergeItemBack(blockId: string, index: number): void {
    const block = this.findBlock(blockId);
    if (!block || block.type !== 'list') return;

    const item = block.items[index];
    if (!item) return;

    if (levelOf(item) > 0) {
      this.indentItem(blockId, index, -1);
      return;
    }

    if (index > 0) {
      const target = block.items[index - 1];
      const at = target.text.length;
      this.mapItems(blockId, (items) => {
        const next = [...items];
        next[index - 1] = { ...target, text: target.text + item.text };
        next.splice(index, 1);
        return next;
      });
      this.focusItem(blockId, index - 1, at);
      return;
    }

    const created: PlanBlock = { id: this.newId(), type: 'text', text: item.text };
    const rest = block.items.slice(1);
    this.updateContent((bs) =>
      rest.length === 0
        ? this.replaceById(bs, blockId, () => created)
        : this.insertBeforeById(
            this.mapById(bs, blockId, (x) => (x.type !== 'list' ? x : { ...x, items: rest })),
            blockId,
            created,
          ),
    );
    this.beginEdit(created.id, item.text.length);
  }

  /**
   * Tabulator: eine Ebene rein oder raus.
   *
   * Der erste Eintrag kann nicht einruecken — ueber ihm steht nichts, worunter
   * er gehoeren koennte. Und tiefer als eine Stufe unter dem Vorgaenger geht es
   * nicht: ein Sprung von der ersten in die dritte Ebene waere eine Gliederung,
   * die niemand mehr lesen kann.
   */
  indentItem(blockId: string, index: number, dir: 1 | -1): void {
    const block = this.findBlock(blockId);
    if (!block || block.type !== 'list' || !block.items[index]) return;

    const current = levelOf(block.items[index]);
    const above = index > 0 ? levelOf(block.items[index - 1]) : -1;
    const wanted = Math.max(0, Math.min(current + dir, Math.min(above + 1, MAX_LIST_LEVEL)));
    // Sonst legt jeder Tabulator am Anschlag einen Zug an, der nichts tut.
    if (wanted === current) return;

    this.mapItems(blockId, (items) => {
      const next = [...items];
      next[index] = { ...next[index], level: wanted };
      return next;
    });
  }
  /**
   * Einen einzelnen Eintrag entfernen — wie in Notion, wo jeder Punkt für sich
   * steht. Bisher ging das nur, indem man die Liste als Text bearbeitet und
   * eine ganze Zeile markiert; das ist für „der eine Punkt ist erledigt" zu viel.
   * War es der letzte Punkt, bleibt keine leere Liste zurück: der Block geht mit.
   */
  removeListItem(blockId: string, index: number) {
    const block = this.findBlock(blockId);
    if (!block || block.type !== 'list') return;

    if (block.items.length <= 1) {
      this.deleteBlock(blockId);
      return;
    }

    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) =>
        x.type !== 'list' ? x : { ...x, items: x.items.filter((_, i) => i !== index) },
      ),
    );
  }

  // ---- Brücke zu den Todos ----
  //
  // Ein Checklisten-Eintrag im Plan ist erst einmal Text. Wird er zu einem
  // echten Todo, hört er auf, einen eigenen Zustand zu haben: ab dann zeigt er
  // den des Todos und hakt es ab. Zwei Haken, die dasselbe behaupten und
  // auseinanderlaufen können, wären schlimmer als gar keine Verbindung.

  // Welches Todo an einem Eintrag haengt und ob er abgehakt ist, steht in
  // listRows — einmal je Datenstand statt viermal je Eintrag und Durchlauf.
  // Faellt das Todo weg (geloescht, archiviert und gerade nicht geladen),
  // zaehlt dort wieder, was im Plan steht: der Eintrag verschwindet nicht.

  /**
   * Aus einem Eintrag eine echte Aufgabe machen.
   *
   * Die ID wandert in den Block, damit die Verbindung den Reload überlebt.
   * Schlägt das Anlegen fehl, bleibt der Eintrag unverändert Text.
   */
  async promoteToTodo(blockId: string, index: number) {
    const plan = this.selected();
    if (!plan) return;

    const block = this.findBlock(blockId);
    if (!block || block.type !== 'list') return;

    const item = block.items[index];
    if (!item || item.todoId) return;

    const todoId = await this.todoService.addTodoFromPlan(item.text, plan.id);
    if (!todoId) return;

    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) =>
        x.type !== 'list'
          ? x
          : {
              ...x,
              items: x.items.map((it, i) =>
                i === index ? { ...it, todoId } : it,
              ),
            },
      ),
    );
  }

  // ---- Tabellen ----
  //
  // Eine Zelle zeigt Text und wird erst beim Hineingehen zum Eingabefeld.
  // Vorher war jede Zelle dauerhaft ein input: ein Raster aus Formularen, in
  // dem nichts umbrach, weil ein input keinen Text umbricht. Was nicht in die
  // feste Breite passte, war beim Lesen schlicht nicht da.

  /** Welche Zelle gerade bearbeitet wird. row -1 ist die Kopfzeile. */
  protected readonly editingCell = signal<{
    id: string;
    row: number;
    col: number;
  } | null>(null);

  /** Eindeutig je Zelle, damit der Fokus nach dem Umschalten hinfindet. */
  cellId(blockId: string, row: number, col: number): string {
    return `cell-${blockId}-${row}-${col}`;
  }

  isEditingCell(blockId: string, row: number, col: number): boolean {
    const cell = this.editingCell();
    return cell?.id === blockId && cell.row === row && cell.col === col;
  }

  startCellEdit(blockId: string, row: number, col: number) {
    this.editingCell.set({ id: blockId, row, col });

    // Das Feld entsteht erst im naechsten Durchlauf; vorher gibt es nichts zu
    // fokussieren. Der Cursor landet am Ende, nicht am Anfang: man will
    // weiterschreiben, nicht davor.
    requestAnimationFrame(() => {
      const el = document.getElementById(
        this.cellId(blockId, row, col),
      ) as HTMLInputElement | null;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }

  stopCellEdit() {
    this.editingCell.set(null);
  }

  // ---- Diagramme ----

  /** Block, dessen Quelltext gerade offen liegt. null = nur die Zeichnung. */
  readonly openDiagramSource = signal<string | null>(null);

  toggleDiagramSource(blockId: string) {
    this.openDiagramSource.update((cur) => (cur === blockId ? null : blockId));
  }

  toggleListItem(blockId: string, index: number) {
    // Verknüpft? Dann gehört der Haken dem Todo, und nur dort wird er gesetzt.
    const block = this.findBlock(blockId);
    if (block?.type === 'list') {
      const linked = block.items[index]?.todoId;
      if (linked && this.todoService.todoById(linked)) {
        this.todoService.toggleTodo(linked);
        return;
      }
    }

    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) =>
        x.type !== 'list'
          ? x
          : {
              ...x,
              items: x.items.map((it, i) =>
                i === index ? { ...it, checked: !it.checked } : it,
              ),
            },
      ),
    );
  }
  setListVariant(blockId: string, variant: 'bullet' | 'number' | 'todo') {
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => (x.type !== 'list' ? x : { ...x, variant })),
    );
  }

  asCode(block: PlanBlock): PlanCodeBlock {
    return block as PlanCodeBlock;
  }
  updateCodeText(blockId: string, code: string) {
    this.updateContent(
      (bs) => this.mapById(bs, blockId, (x) => (x.type === 'code' ? { ...x, code } : x)),
      `code:${blockId}`,
    );
  }
  setCodeLanguage(blockId: string, language: string) {
    this.updateContent(
      (bs) => this.mapById(bs, blockId, (x) => (x.type === 'code' ? { ...x, language } : x)),
      `lang:${blockId}`,
    );
  }

  asQuote(block: PlanBlock): PlanQuoteBlock {
    return block as PlanQuoteBlock;
  }

  // ---- Block darunter einfuegen (das „+" in der Randspalte) ----

  private insertAfterById(
    blocks: PlanBlock[],
    id: string,
    newBlock: PlanBlock,
  ): PlanBlock[] {
    const i = blocks.findIndex((b) => b.id === id);
    if (i >= 0) {
      const copy = [...blocks];
      copy.splice(i + 1, 0, newBlock);
      return copy;
    }
    return blocks.map((b) =>
      b.type === 'group'
        ? { ...b, blocks: this.insertAfterById(b.blocks, id, newBlock) }
        : b,
    );
  }

  private insertBeforeById(
    blocks: PlanBlock[],
    id: string,
    newBlock: PlanBlock,
  ): PlanBlock[] {
    const i = blocks.findIndex((b) => b.id === id);
    if (i >= 0) {
      const copy = [...blocks];
      copy.splice(i, 0, newBlock);
      return copy;
    }
    return blocks.map((b) =>
      b.type === 'group'
        ? { ...b, blocks: this.insertBeforeById(b.blocks, id, newBlock) }
        : b,
    );
  }

  // ---- Eingefuegtes Markdown in Bloecke zerlegen ----
  //
  // Ohne das landet ein ganzes Dokument in einem Block — und beginnt es mit
  // „# ", macht die Kurzbefehl-Erkennung daraus den Text einer einzigen
  // Ueberschrift, weil sie den kompletten Blockinhalt prueft.

  onTextPaste(blockId: string, event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (!pasted.trim()) return;

    const parsed = parseMarkdownBlocks(pasted);

    // Ein einzelner Absatz ist ein ganz normaler Einfuegevorgang — da greifen
    // wir nicht ein, sonst verliert man Cursorposition und Auswahl.
    if (parsed.length <= 1 && (!parsed[0] || parsed[0].kind === 'text')) return;

    event.preventDefault();

    const plan = this.selected();
    const block = plan ? this.findById(plan.content, blockId) : null;
    const isEmpty = !block || block.type !== 'text' || !block.text.trim();
    const incoming = parsed.map((p) => this.fromParsed(p));

    this.slash.set(null);
    this.wikiPick.set(null);
    this.updateContent((bs) => this.spliceById(bs, blockId, incoming, isEmpty));
  }

  private fromParsed(parsed: ParsedBlock): PlanBlock {
    const id = this.newId();
    switch (parsed.kind) {
      case 'heading':
        return { id, type: 'heading', level: parsed.level, text: parsed.text };
      case 'list':
        return { id, type: 'list', variant: parsed.variant, items: parsed.items };
      case 'code':
        return { id, type: 'code', language: parsed.language, code: parsed.code };
      case 'quote':
        return { id, type: 'quote', text: parsed.text };
      case 'divider':
        return { id, type: 'divider' };
      default:
        return { id, type: 'text', text: parsed.text };
    }
  }

  /** Setzt mehrere Bloecke an die Stelle eines vorhandenen — ersetzend oder dahinter. */
  private spliceById(
    blocks: PlanBlock[],
    id: string,
    incoming: PlanBlock[],
    replace: boolean,
  ): PlanBlock[] {
    const i = blocks.findIndex((b) => b.id === id);
    if (i >= 0) {
      const copy = [...blocks];
      copy.splice(replace ? i : i + 1, replace ? 1 : 0, ...incoming);
      return copy;
    }
    return blocks.map((b) =>
      b.type === 'group'
        ? { ...b, blocks: this.spliceById(b.blocks, id, incoming, replace) }
        : b,
    );
  }

  addBelow(blockId: string) {
    const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
    this.updateContent((bs) => this.insertAfterById(bs, blockId, created));
    this.beginEdit(created.id);
  }

  /**
   * Klick unter den letzten Block: weiterschreiben.
   *
   * Steht dort schon ein leerer Absatz, wird er angesprungen statt ein zweiter
   * angelegt — sonst sammelt sich unter jedem Plan eine Reihe leerer Zeilen.
   */
  appendBlock(): void {
    const content = this.selected()?.content ?? [];
    const last = content[content.length - 1];
    if (last?.type === 'text' && last.text === '') {
      this.beginEdit(last.id);
      return;
    }

    const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
    this.updateContent((bs) => [...bs, created]);
    this.beginEdit(created.id, 0);
  }

  /**
   * Leerer Plan: es gibt keinen Block, an dem das „+" der Randspalte haengen
   * koennte, und die Add-Leiste steht am Zeigergeraet nicht zur Verfuegung.
   * Ohne diesen Einstieg laesst sich ein frischer Plan gar nicht befuellen.
   */
  startFirstBlock() {
    const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
    this.updateContent((bs) => [...bs, created]);
    this.beginEdit(created.id);
  }

  // ---- Outline (Obsidian) ----
  //
  // Sobald ein Plan Ueberschriften hat, ist er laenger als ein Bildschirm.
  // Die Outline macht die Gliederung sichtbar und anspringbar.

  /**
   * Ueberschriften und Section-Titel in Dokumentreihenfolge. Section-Titel
   * zaehlen mit, weil sie strukturell dasselbe leisten; verschachtelte
   * Ueberschriften ruecken pro Ebene eine Stufe ein (maximal drei).
   */
  protected readonly outline = computed<{ id: string; level: number; text: string }[]>(
    () => {
    const plan = this.selected();
    if (!plan) return [];

    const items: { id: string; level: number; text: string }[] = [];
    const walk = (blocks: PlanBlock[], depth: number) => {
      for (const b of blocks) {
        if (b.type === 'heading') {
          const text = b.text.trim();
          if (text) items.push({ id: b.id, level: Math.min(3, b.level + depth), text });
        } else if (b.type === 'group') {
          const title = b.title.trim();
          if (title) items.push({ id: b.id, level: Math.min(3, 1 + depth), text: title });
          walk(b.blocks, depth + 1);
        }
      }
    };
    walk(plan.content, 0);
    return items;
    },
    {
      // Sonst zeichnet jeder Anschlag irgendwo im Dokument die ganze
      // Gliederung neu — sie aendert sich aber nur, wenn sich eine
      // Ueberschrift aendert.
      equal: (a, b) =>
        a.length === b.length &&
        a.every((x, i) => x.id === b[i].id && x.level === b[i].level && x.text === b[i].text),
    },
  );

  // ---- Vorschlaege fuer Abschnitte ohne Ueberschrift ----
  //
  // Die Outline listet Ueberschriften. Was davor oder ganz ohne steht, fehlt
  // dort — man kann es nicht anspringen und uebersieht beim Ueberfliegen, dass
  // es existiert. Ein Modell liest den Absatz und schlaegt eine Ueberschrift
  // vor; uebernommen wird sie erst auf Klick.

  private readonly titles = inject(PlanTitleService);

  protected readonly suggestBusy = this.titles.busy;
  protected readonly suggestAvailable = this.titles.available;
  protected readonly suggestExhausted = this.titles.exhausted;

  /** Der Grund, warum der letzte Aufruf nichts geliefert hat. */
  protected readonly suggestLastError = this.titles.lastError;

  /** Ein Satz, der sagt, warum keine Überschriften gesetzt werden. */
  protected readonly suggestOffReason = computed(() => {
    switch (this.titles.reason()) {
      case 'no-key':
        return 'Auto headings need an API key on the server.';
      case 'storage':
        return 'Auto headings are off: the server cannot read its usage table.';
      case 'unreachable':
        return 'Auto headings are off: the server did not answer.';
      default:
        return null;
    }
  });

  /** Absaetze im aktuellen Plan, die in der Outline fehlen. */
  protected readonly untitled = computed<UntitledSection[]>(() => {
    const plan = this.selected();
    return plan ? findUntitledSections(plan.content) : [];
  });

  /** Wie viele Absaetze noch ohne Ueberschrift darueber stehen. */
  protected readonly pendingSuggestions = computed(() => this.untitled().length);

  /** Der Dokumentbereich zwischen Blindspalte und Outline. */
  private readonly docColumn = viewChild<ElementRef<HTMLElement>>('docColumn');

  constructor() {
    // Erst fragen, wenn es etwas zu betiteln gibt. Ein Plan ohne unbetitelte
    // Absätze braucht die Funktion nicht, und die Anfrage bliebe umsonst.
    effect(() => {
      if (this.untitled().length > 0) this.titles.checkAvailability();
    });

    // Ein Vollbild ueberlebt den Planwechsel nicht: sonst oeffnet der
    // naechste Plan mit einer Tabelle vor dem Gesicht, die gar nicht zu ihm
    // gehoert.
    effect(() => {
      this.planService.selectedId();
      untracked(() => this.tableFull.set(null));
    });

    // Wie breit der Dokumentbereich ist, steht ab jetzt als --doc-w an ihm.
    // Eine breite Tabelle liest das und waechst genau bis dorthin. Ueber eine
    // Container-Abfrage ginge es ohne Javascript — die richtet aber
    // Containment ein, und daran haengt in diesem Baum die feststehende
    // Kopfzeile. Ein Beobachter ist hier der kleinere Eingriff.
    effect((onCleanup) => {
      const el = this.docColumn()?.nativeElement;
      if (!el) return;

      const publish = () => el.style.setProperty('--doc-w', `${el.clientWidth}px`);
      publish();

      const watch = new ResizeObserver(publish);
      watch.observe(el);
      onCleanup(() => watch.disconnect());
    });
  }

  /**
   * Nachtraeglich fuer alles, was schon dasteht.
   *
   * Beim Schreiben passiert das von selbst (siehe onProseBlur). Dieser Weg ist fuer
   * Dokumente, die es vorher schon gab — und er SETZT genauso, statt
   * vorzuschlagen: zwei Verhalten fuer dieselbe Sache waeren nur verwirrend.
   * Der Reihe nach, weil jede eingefuegte Ueberschrift die Liste veraendert.
   */
  async addMissingHeadings(): Promise<void> {
    for (const section of this.untitled()) {
      const plan = this.selected();
      if (!plan || !needsHeading(plan.content, section.id)) continue;

      const title = await this.titles.fetchTitle(section.text);
      if (title) this.acceptSuggestion(section.id, title);
    }
  }

  /** Eine Ueberschrift ueber den Absatz setzen. */
  acceptSuggestion(blockId: string, title: string) {
    const heading: PlanBlock = {
      id: this.newId(),
      type: 'heading',
      level: 2,
      text: title,
    };
    this.updateContent((blocks) => this.insertBeforeById(blocks, blockId, heading));
    this.titles.forget(blockId);
  }

  dismissSuggestion(blockId: string) {
    this.titles.forget(blockId);
  }

  jumpTo(blockId: string) {
    const el = document.getElementById('block-' + blockId);
    if (!el) return;
    // Weiches Scrollen ist eine Bewegung ueber den ganzen Bildschirm — wer
    // reduzierte Bewegung eingestellt hat, springt lieber direkt.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

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
    return this.labelService.labelById(categoryId)?.name ?? 'Standalone';
  }
  dotClass(categoryId: string | null): string {
    const color = this.labelService.labelById(categoryId)?.color;
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

  /**
   * Die eine Stelle, durch die JEDE Aenderung am Dokument laeuft — und damit
   * die einzige, an der die Geschichte mitgeschrieben werden muss.
   *
   * `typing` fasst zusammen: beim Schreiben kommt hier ein Aufruf je
   * Tastendruck an, und ein Rueckgaengig, das einen Buchstaben zurueckholt,
   * ist keins. Gleiche Kennung und kurz hintereinander heisst: derselbe Zug.
   */
  private updateContent(
    fn: (blocks: PlanBlock[]) => PlanBlock[],
    typing: string | null = null,
  ) {
    const plan = this.selected();
    if (!plan) return;

    this.remember(plan.id, plan.content, typing);
    this.planService.patchPlan(plan.id, { content: fn([...plan.content]) });
  }

  // ---- Rueckgaengig ----
  //
  // Die Textfelder bringen ihr eigenes Rueckgaengig mit, aber nur fuer den Text
  // IN einem Feld. Alles, was ein Dokument ausmacht — Bloecke teilen,
  // zusammenfuegen, umwandeln, verschieben, loeschen —, faellt dort heraus.
  // Genau davon will man sich aber erholen: ein verlorener Absatz wiegt
  // schwerer als ein verlorenes Wort.
  //
  // Gemerkt wird der Zustand VOR der Aenderung. Das ist die ganze Mechanik:
  // ein Stapel nach hinten, einer nach vorn.

  /** Laenger lohnt nicht: wer 200 Schritte zurueck will, will den alten Stand. */
  private static readonly HISTORY_LIMIT = 120;

  private readonly past = signal<PlanBlock[][]>([]);
  private readonly future = signal<PlanBlock[][]>([]);

  /**
   * Zu welchem Plan die Geschichte gehoert.
   *
   * Ein Signal, weil die Knoepfe davon abhaengen: sonst zeigte nach dem
   * Wechsel in einen anderen Plan noch der Stapel des vorigen an — und ein
   * Klick haette dessen Inhalt in dieses Dokument geschrieben.
   */
  private readonly historyOf = signal<string | null>(null);
  /** Der Schreibfluss, der gerade laeuft — siehe edit-history.ts. */
  private run: TypingRun | null = null;

  private readonly forThisPlan = computed(
    () => this.historyOf() !== null && this.historyOf() === (this.selected()?.id ?? null),
  );
  protected readonly canUndo = computed(() => this.forThisPlan() && this.past().length > 0);
  protected readonly canRedo = computed(() => this.forThisPlan() && this.future().length > 0);

  private remember(planId: string, before: PlanBlock[], typing: string | null): void {
    // Anderer Plan: seine Geschichte ist nicht diese.
    if (this.historyOf() !== planId) {
      this.historyOf.set(planId);
      this.past.set([]);
      this.future.set([]);
      this.run = null;
    }

    const now = Date.now();
    if (continuesRun(this.run, typing, now)) {
      // Derselbe Zug: der Stand davor liegt schon auf dem Stapel.
      this.run = { ...this.run!, at: now };
      return;
    }

    this.run = { key: typing, at: now, since: now };

    this.past.update((stack) => [...stack, before].slice(-PlansView.HISTORY_LIMIT));
    // Ein neuer Zug macht den Weg nach vorn ungueltig.
    if (this.future().length) this.future.set([]);
  }

  undo(): void {
    const plan = this.selected();
    const stack = this.past();
    if (!plan || !stack.length || !this.forThisPlan()) return;

    this.run = null; // nach einem Sprung nichts mehr zusammenfassen
    this.past.set(stack.slice(0, -1));
    this.future.update((f) => [...f, plan.content]);
    this.planService.patchPlan(plan.id, { content: stack[stack.length - 1] });
  }

  redo(): void {
    const plan = this.selected();
    const stack = this.future();
    if (!plan || !stack.length || !this.forThisPlan()) return;

    this.run = null;
    this.future.set(stack.slice(0, -1));
    this.past.update((p) => [...p, plan.content]);
    this.planService.patchPlan(plan.id, { content: stack[stack.length - 1] });
  }

  private newId(): string {
    return crypto.randomUUID();
  }

  // --- Rekursive Helfer: wirken auf jeden Block, egal wie tief in Gruppen ---
  /** Einen Block im Baum suchen (Sections enthalten wieder Bloecke). */
  private findBlock(id: string, blocks = this.selected()?.content ?? []): PlanBlock | null {
    for (const block of blocks) {
      if (block.id === id) return block;
      if (block.type === 'group') {
        const hit = this.findBlock(id, block.blocks);
        if (hit) return hit;
      }
    }
    return null;
  }

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
  /** Ersetzt den Block mit dieser id vollständig (Typwechsel), behält die Position. */
  private replaceById(
    blocks: PlanBlock[],
    id: string,
    make: (id: string) => PlanBlock,
  ): PlanBlock[] {
    return blocks.map((b) => {
      if (b.id === id) return make(id);
      if (b.type === 'group') return { ...b, blocks: this.replaceById(b.blocks, id, make) };
      return b;
    });
  }
  private findById(blocks: PlanBlock[], id: string): PlanBlock | null {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.type === 'group') {
        const found = this.findById(b.blocks, id);
        if (found) return found;
      }
    }
    return null;
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

  // ---- Section (aufklappbarer Container) ----
  /**
   * Auf- und Zuklappen ist Ansicht, kein Zug am Dokument — es steht nur
   * deshalb im Inhalt, weil es den Reload ueberleben soll. In der Geschichte
   * hat es nichts verloren: ⌘Z soll den geloeschten Absatz zurueckholen, nicht
   * einen Toggle wieder aufklappen.
   */
  toggleGroup(groupId: string) {
    const plan = this.selected();
    if (!plan) return;
    this.planService.patchPlan(plan.id, {
      content: this.mapById([...plan.content], groupId, (x) =>
        x.type === 'group' ? { ...x, collapsed: !x.collapsed } : x,
      ),
    });
  }
  setGroupTitle(groupId: string, title: string) {
    this.updateContent(
      (b) =>
        this.mapById(b, groupId, (x) =>
          x.type === 'group' ? { ...x, title: title.trim() || 'Toggle' } : x,
        ),
      `group:${groupId}`,
    );
  }
  /** Den ersten Absatz in einen leeren Toggle setzen; alles Weitere per „/". */
  addToGroup(groupId: string) {
    const created: PlanBlock = { id: this.newId(), type: 'text', text: '' };
    this.updateContent((b) =>
      this.mapById(b, groupId, (x) =>
        x.type === 'group' ? { ...x, blocks: [...x.blocks, created] } : x,
      ),
    );
    this.beginEdit(created.id, 0);
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

  // ---- Editor: Bloecke per Drag & Drop umsortieren ----
  //
  // Die Bloecke bilden einen Baum: eine Section enthaelt wieder Bloecke. Jede
  // Liste meldet daher ueber cdkDropListData, zu welcher Section sie gehoert
  // (null = oberste Ebene), und der Ablage-Handler arbeitet auf genau diesen
  // beiden Listen — statt stumpf auf plan.content, wo verschachtelte Bloecke
  // gar nicht auftauchen.

  /** Liest die Liste einer Section (null = oberste Ebene) ohne sie zu kopieren. */
  private findList(blocks: PlanBlock[], groupId: string | null): PlanBlock[] | null {
    if (groupId === null) return blocks;
    for (const b of blocks) {
      if (b.type !== 'group') continue;
      if (b.id === groupId) return b.blocks;
      const nested = this.findList(b.blocks, groupId);
      if (nested) return nested;
    }
    return null;
  }

  /** Ersetzt genau eine Liste im Baum und laesst den Rest unberuehrt. */
  private withList(
    blocks: PlanBlock[],
    groupId: string | null,
    fn: (list: PlanBlock[]) => PlanBlock[],
  ): PlanBlock[] {
    if (groupId === null) return fn(blocks);
    return blocks.map((b) =>
      b.type !== 'group'
        ? b
        : b.id === groupId
          ? { ...b, blocks: fn(b.blocks) }
          : { ...b, blocks: this.withList(b.blocks, groupId, fn) },
    );
  }

  /** Enthaelt die Section (oder ist sie selbst) die Ziel-Section? */
  private groupContains(group: PlanGroupBlock, groupId: string): boolean {
    if (group.id === groupId) return true;
    return group.blocks.some(
      (b) => b.type === 'group' && this.groupContains(b, groupId),
    );
  }

  dropBlock(event: CdkDragDrop<string | null>) {
    const from = event.previousContainer.data ?? null;
    const to = event.container.data ?? null;
    if (from === to && event.previousIndex === event.currentIndex) return;

    this.updateContent((root) => {
      const source = this.findList(root, from);
      const moved = source?.[event.previousIndex];
      if (!moved) return root;

      // Eine Section in sich selbst zu ziehen wuerde den Baum abhaengen —
      // der Teilbaum waere danach aus dem Plan nicht mehr erreichbar.
      if (moved.type === 'group' && to !== null && this.groupContains(moved, to)) {
        return root;
      }

      const without = this.withList(root, from, (list) =>
        list.filter((_, i) => i !== event.previousIndex),
      );
      const placed = this.withList(without, to, (list) => {
        const next = [...list];
        next.splice(Math.min(event.currentIndex, next.length), 0, moved);
        return next;
      });

      // In ein zugeklapptes Toggle abgelegt: aufklappen. Sonst verschwindet
      // der Block scheinbar — man hat ihn irgendwohin gezogen und sieht das
      // Ergebnis nicht.
      if (to === null) return placed;
      return this.mapById(placed, to, (x) =>
        x.type === 'group' && x.collapsed ? { ...x, collapsed: false } : x,
      );
    });
  }

  // ---- Editor: Überschrift ----
  asHeading(block: PlanBlock): PlanHeadingBlock {
    return block as PlanHeadingBlock;
  }

  /**
   * Größenstufe einer Überschrift. Große Schrift bekommt engeres Tracking und
   * knapperes Leading — sonst wirkt sie auseinandergezogen; kleine Stufen
   * dürfen wieder offener stehen.
   */
  headingClass(level: 1 | 2 | 3): string {
    switch (level) {
      case 1:
        return 'text-[28px] font-bold leading-[1.2] tracking-[-0.021em]';
      case 2:
        return 'text-[22px] font-semibold leading-[1.28] tracking-[-0.015em]';
      default:
        return 'text-[17px] font-semibold leading-[1.4] tracking-[-0.008em]';
    }
  }

  // ---- Editor: Diagramm ----
  updateCode(blockId: string, code: string) {
    this.updateContent(
      (b) => this.mapById(b, blockId, (x) => (x.type === 'diagram' ? { ...x, code } : x)),
      `diagram:${blockId}`,
    );
  }
  asDiagram(block: PlanBlock): PlanDiagramBlock {
    return block as PlanDiagramBlock;
  }

  // ---- Editor: Tabelle ----
  private mapTable(
    blockId: string,
    fn: (t: PlanTableBlock) => PlanTableBlock,
    typing: string | null = null,
  ) {
    this.updateContent(
      (b) => this.mapById(b, blockId, (x) => (x.type === 'table' ? fn(x) : x)),
      typing,
    );
  }
  setColumn(blockId: string, c: number, value: string) {
    this.mapTable(
      blockId,
      (t) => {
        const columns = [...t.columns];
        columns[c] = value;
        return { ...t, columns };
      },
      `column:${blockId}:${c}`,
    );
  }
  setCell(blockId: string, r: number, c: number, value: string) {
    this.mapTable(
      blockId,
      (t) => {
        const rows = t.rows.map((row) => [...row]);
        rows[r][c] = value;
        return { ...t, rows };
      },
      `cell:${blockId}:${r}:${c}`,
    );
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
      // Stehen Breiten fest, braucht die neue Spalte auch eine — sonst
      // faellt sie bei festem Layout auf null zusammen.
      widths: t.widths ? [...t.widths, DEFAULT_COL_WIDTH] : undefined,
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
      widths: t.widths?.filter((_, i) => i !== c),
    }));
  }

  // ---- Tabelle: Breite ----
  //
  // Zwei Regler, weil es zwei verschiedene Fragen sind: wie breit die Tabelle
  // insgesamt sein darf, und wie sich diese Breite auf die Spalten verteilt.

  /** Breite dieser Spalte, oder null fuer „richtet sich nach dem Inhalt". */
  colWidth(block: PlanBlock, c: number): number | null {
    return this.asTable(block).widths?.[c] ?? null;
  }

  hasWidths(block: PlanBlock): boolean {
    return !!this.asTable(block).widths?.length;
  }

  /**
   * Die Gesamtbreite der Tabelle, sobald Spalten festgehalten sind.
   *
   * Ohne sie bleibt jede gesetzte Spaltenbreite ein Vorschlag: eine Tabelle
   * auf `width: 100%` verteilt den Platz neu, sobald eine Spalte mehr will —
   * gemessen wuchs die gezogene Spalte um 83 statt um 120 Pixel, und die
   * Nachbarn schrumpften ungefragt. Steht die Summe fest, gilt jede Spalte
   * genau so, wie sie gezogen wurde, und die Tabelle laeuft notfalls aus dem
   * Rand (der Rahmen darum scrollt waagerecht).
   */
  tableWidth(block: PlanBlock): number | null {
    const widths = this.asTable(block).widths;
    if (!widths?.length) return null;
    return widths.reduce((sum, w) => sum + w, 0) + GUTTER_WIDTH;
  }

  toggleTableWide(blockId: string) {
    this.mapTable(blockId, (t) => ({ ...t, wide: !t.wide }));
  }

  /**
   * Die Tabelle, die gerade den Bildschirm fuellt.
   *
   * Absichtlich kein Feld am Block: das Vollbild ist nichts, was ein Dokument
   * speichern sollte. Wer es morgen wieder oeffnet, will seinen Text sehen
   * und nicht eine Tabelle, die alles verdeckt.
   */
  readonly tableFull = signal<string | null>(null);

  toggleTableFull(blockId: string) {
    this.tableFull.update((open) => (open === blockId ? null : blockId));
  }

  /** Zurueck zu Spalten, die sich nach ihrem Inhalt richten. */
  resetColumnWidths(blockId: string) {
    this.mapTable(blockId, (t) => ({ ...t, widths: undefined }));
  }

  /**
   * Eine Spalte ziehen.
   *
   * Waehrend des Ziehens schreibt das hier direkt in die <col>-Elemente und
   * nicht ins Modell: jede Modelländerung liefe durch Verlauf, Speicherung
   * und Neuaufbau der Bloecke — sechzigmal in der Sekunde. Ins Modell geht
   * erst, was am Ende dasteht; damit ist auch nur ein Schritt zurueckzunehmen
   * und nicht sechzig.
   */
  startColResize(event: PointerEvent, blockId: string, c: number) {
    const grip = event.currentTarget as HTMLElement;
    const table = grip.closest('table');
    const head = table?.tHead?.rows[0];
    const cols = table?.querySelectorAll('col');
    if (!table || !head || !cols) return;

    event.preventDefault();
    event.stopPropagation();
    grip.setPointerCapture(event.pointerId);

    // Erst messen, dann festhalten: sonst springt die Tabelle in dem Moment,
    // in dem sie von „nach Inhalt" auf feste Spalten umschaltet.
    const measured = Array.from(head.cells)
      .slice(0, -1)
      .map((cell) => Math.round(cell.getBoundingClientRect().width));
    measured.forEach((w, i) => ((cols[i] as HTMLElement).style.width = `${w}px`));
    table.classList.add('plan-table--fixed');

    // Auch die Summe muss mitwandern — siehe tableWidth.
    const total = (widths: number[]) =>
      (table.style.width = `${widths.reduce((sum, w) => sum + w, 0) + GUTTER_WIDTH}px`);
    total(measured);

    const startX = event.clientX;
    const startWidth = measured[c];
    let width = startWidth;

    const move = (moved: PointerEvent) => {
      width = Math.max(MIN_COL_WIDTH, Math.round(startWidth + moved.clientX - startX));
      (cols[c] as HTMLElement).style.width = `${width}px`;
      total(measured.map((w, i) => (i === c ? width : w)));
    };

    const done = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', done);
      grip.removeEventListener('pointercancel', done);
      const next = [...measured];
      next[c] = width;
      this.mapTable(blockId, (t) => ({ ...t, widths: next }));
    };

    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', done);
    grip.addEventListener('pointercancel', done);
  }

  /**
   * Dieselbe Spalte mit der Tastatur.
   *
   * Ohne das waere die Breite nur mit der Maus erreichbar — und der Griff ist
   * ein Bedienelement wie jedes andere.
   */
  nudgeColumn(event: KeyboardEvent, blockId: string, c: number) {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;

    const head = (event.currentTarget as HTMLElement).closest('table')?.tHead?.rows[0];
    if (!head) return;

    event.preventDefault();
    const measured = Array.from(head.cells)
      .slice(0, -1)
      .map((cell) => Math.round(cell.getBoundingClientRect().width));
    measured[c] = Math.max(MIN_COL_WIDTH, measured[c] + step);
    this.mapTable(blockId, (t) => ({ ...t, widths: measured }));
  }

  asTable(block: PlanBlock): PlanTableBlock {
    return block as PlanTableBlock;
  }

  /**
   * Der Inhalt einer Zelle, formatiert.
   *
   * Bis hierher stand in Zellen roher Text: „**State**" blieb „**State**",
   * waehrend derselbe Text in jedem Absatz fett wurde. Dieselbe Schreibweise
   * muss ueberall dasselbe bedeuten, sonst ist sie keine.
   *
   * Es ist dieselbe Uebersetzung wie im Fliesstext (escapen, dann die
   * erlaubte Auszeichnung einsetzen) — nur ohne Wikilinks, siehe dort.
   * Bearbeitet wird weiter der Quelltext: der Klick macht die Zelle zum
   * Feld, und dort stehen die Sternchen wieder da.
   */
  renderCell(text: string): string {
    return formatBlock(text, { wikiLinks: false });
  }
}
