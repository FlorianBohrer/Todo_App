import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
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
} from 'lucide-angular';
import { Autosize } from '../../directives/autosize.directive';
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
import { RichText } from '../rich-text.directive';
import { focusRich, replaceRange } from '../rich-text';
import { levelOf, listMarkers } from '../list-markers';
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
import { MermaidDiagram } from './mermaid-diagram';
import { PlanGraph } from './plan-graph';

type BlockKind = 'text' | 'diagram' | 'table';

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
    Autosize,
    MermaidDiagram,
    NgTemplateOutlet,
    NgClass,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    OverlayModule,
    PlanGraph,
    RichText,
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

  protected readonly BackIcon = ChevronLeft;
  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly GripIcon = GripVertical;
  protected readonly SearchIcon = Search;

  /** Datenwert der obersten Blockliste; getippt, damit er zu den Section-Listen passt. */
  protected readonly rootList: string | null = null;
  protected readonly TextIcon = Type;
  protected readonly TableIcon = TableIcon;
  protected readonly DiagramIcon = Workflow;
  protected readonly SectionIcon = Layers;
  protected readonly H1Icon = Heading1;
  protected readonly H2Icon = Heading2;
  protected readonly H3Icon = Heading3;
  protected readonly BulletIcon = List;
  protected readonly NumberIcon = ListOrdered;
  protected readonly TodoIcon = ListChecks;
  protected readonly CodeIcon = Code;
  protected readonly QuoteIcon = Quote;
  protected readonly DividerIcon = Minus;
  protected readonly LinkIcon = Link2;
  protected readonly CopyIcon = Copy;
  protected readonly UpIcon = ChevronUp;
  protected readonly DownIcon = ChevronDown;

  // ---- Blockaktionen ----
  //
  // Kein eigener Knopf mehr: die Aktionen liegen hinter dem Ziehgriff in der
  // linken Randspalte. Rechts bleibt dadurch nichts mehr stehen, was vom Text
  // ablenkt — und die gesamte rechte Reserve faellt weg.

  /** Block, dessen Aktionsmenue offen ist. */
  protected readonly openBlockMenu = signal<string | null>(null);

  /**
   * Das Menue klappt unter dem Griff nach rechts auf; ist unten kein Platz,
   * nach oben. CDK waehlt die erste Position, die ins Fenster passt.
   */
  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  /**
   * Der Ziehgriff oeffnet das Menue per Klick. Nach einem Drag feuert aber noch
   * ein Klick hinterher — ohne diese Sperre ginge das Menue nach jedem
   * Verschieben auf.
   */
  private lastDragEnd = 0;

  onDragStarted() {
    this.closeBlockMenu();
  }
  onDragEnded() {
    this.lastDragEnd = Date.now();
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
  protected readonly turnOptions: { kind: SlashKind; label: string; icon: LucideIconData }[] = [
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
  protected readonly slash = signal<{
    blockId: string;
    index: number;
    start: number;
    query: string;
  } | null>(null);

  /** Gefilterte Menü-Einträge zum aktuellen Query hinter dem „/". */
  protected readonly slashResults = computed(() => {
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
  protected readonly wikiPick = signal<{
    blockId: string;
    index: number;
    start: number;
    query: string;
  } | null>(null);

  protected readonly wikiResults = computed<Plan[]>(() => {
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
    this.updateContent((bs) => this.setBlockText(bs, blockId, change.value));
  }

  /**
   * Eingabe im Absatz: speichern — und schauen, ob daraus gerade etwas anderes
   * werden soll. Ein Kurzbefehl wandelt den Block um, „/" oeffnet das Menue,
   * „[[" die Planvorschlaege.
   */
  onTextChange(blockId: string, change: { value: string; caret: number }): void {
    this.updateContent((bs) => this.setBlockText(bs, blockId, change.value));

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
  /** Die Zeichen links vom Eintrag — Punkt, Zahl oder Buchstabe, je nach Ebene. */
  markersFor(block: PlanListBlock): string[] {
    return listMarkers(block.items, block.variant);
  }

  /** Einrueckung eines Eintrags in rem. */
  itemIndent(item: PlanListItem): number {
    return levelOf(item) * 1.5;
  }

  private mapItems(
    blockId: string,
    fn: (items: PlanListItem[]) => PlanListItem[],
  ): void {
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => (x.type !== 'list' ? x : { ...x, items: fn(x.items) })),
    );
  }

  setItemText(blockId: string, index: number, text: string): void {
    this.mapItems(blockId, (items) =>
      items.map((it, i) => (i === index ? { ...it, text } : it)),
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
    this.mapItems(blockId, (items) => {
      const current = levelOf(items[index]);
      const above = index > 0 ? levelOf(items[index - 1]) : -1;
      const wanted = Math.max(0, Math.min(current + dir, Math.min(above + 1, MAX_LIST_LEVEL)));
      if (wanted === current) return items;

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

  /** Das verknüpfte Todo, oder null wenn es keins (mehr) gibt. */
  itemTodo(item: PlanListItem): Todo | null {
    return this.todoService.todoById(item.todoId);
  }

  /**
   * Ist der Eintrag abgehakt? Beim verknüpften der Zustand des Todos.
   *
   * Fällt das Todo weg (gelöscht, archiviert und gerade nicht geladen), zählt
   * wieder das, was im Plan steht. Der Eintrag verschwindet dadurch nicht.
   */
  itemChecked(item: PlanListItem): boolean {
    return this.itemTodo(item)?.completed ?? item.checked;
  }

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
  protected readonly openDiagramSource = signal<string | null>(null);

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
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => (x.type === 'code' ? { ...x, code } : x)),
    );
  }
  setCodeLanguage(blockId: string, language: string) {
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => (x.type === 'code' ? { ...x, language } : x)),
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
  protected readonly outline = computed<{ id: string; level: number; text: string }[]>(() => {
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
  });

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

  constructor() {
    // Erst fragen, wenn es etwas zu betiteln gibt. Ein Plan ohne unbetitelte
    // Absätze braucht die Funktion nicht, und die Anfrage bliebe umsonst.
    effect(() => {
      if (this.untitled().length > 0) this.titles.checkAvailability();
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
        title: 'Toggle',
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
        x.type === 'group' ? { ...x, title: title.trim() || 'Toggle' } : x,
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
      return this.withList(without, to, (list) => {
        const next = [...list];
        next.splice(Math.min(event.currentIndex, next.length), 0, moved);
        return next;
      });
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
