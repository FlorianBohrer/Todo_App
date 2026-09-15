import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
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
} from 'lucide-angular';
import { Autosize } from '../../directives/autosize.directive';
import { LabelService } from '../../todo/services/label.service';
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
  PlanCodeBlock,
  PlanQuoteBlock,
} from '../plan.model';
import { formatBlock, formatInline } from '../inline-format';
import { detectSlashToken } from '../slash-command';
import { planLinkTargets, planPlainText } from '../plan-links';
import { parseMarkdownBlocks, ParsedBlock } from '../markdown-paste';
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
    PlanGraph,
  ],
  templateUrl: './plans-view.html',
  styleUrl: './plans-view.scss',
})
export class PlansView {
  private readonly planService = inject(PlanService);
  protected readonly labelService = inject(LabelService);

  protected readonly BackIcon = ChevronLeft;
  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly GripIcon = GripVertical;

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
    const ids = this.plans().map((p) => p.id);
    const [moved] = ids.splice(event.previousIndex, 1);
    ids.splice(event.currentIndex, 0, moved);
    this.planService.reorderPlans(ids);
  }
  protected readonly loading = this.planService.loading;
  protected readonly labels = this.labelService.labels;

  /** Übersicht: Kacheln oder Graph. */
  protected readonly overviewMode = signal<'list' | 'graph'>('list');

  setOverviewMode(mode: 'list' | 'graph') {
    this.overviewMode.set(mode);
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
    { kind: 'toggle', label: 'Toggle', hint: 'Collapsible container', icon: this.SectionIcon, keywords: 'toggle dropdown section group collapsible container fold' },
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

  onTextInput(blockId: string, event: Event) {
    const field = event.target as HTMLTextAreaElement;
    const value = field.value;
    const caret = field.selectionStart ?? value.length;
    this.updateText(blockId, value);

    // Markdown hat Vorrang: der Block wandelt sich sofort um.
    const shortcut = detectMarkdownShortcut(value);
    if (shortcut) {
      this.applyMarkdownShortcut(blockId, shortcut.kind, shortcut.rest);
      return;
    }

    // Offener Wikilink „[[…" — Vorschlaege aus den vorhandenen Plaenen.
    const wiki = detectWikiToken(value, caret);
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

    const token = this.detectSlash(value, caret);
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

    const plan = this.selected();
    const block = plan ? this.findById(plan.content, blockId) : null;
    if (!block || block.type !== 'text') return;

    const before = block.text.slice(0, pick.start);
    const after = block.text.slice(pick.start + 2 + pick.query.length);
    this.updateText(blockId, `${before}[[${title}]]${after}`);

    const caret = before.length + title.length + 4;
    requestAnimationFrame(() => {
      const el = document.getElementById('block-edit-' + blockId);
      if (!(el instanceof HTMLTextAreaElement)) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

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
    this.beginEdit(created.id);
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
        return { id, type: 'list', variant: 'bullet', items: [{ text: initial, checked: false }] };
      case 'number':
        return { id, type: 'list', variant: 'number', items: [{ text: initial, checked: false }] };
      case 'todo':
        return { id, type: 'list', variant: 'todo', items: [{ text: initial, checked: false }] };
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
    this.updateContent((bs) =>
      this.replaceById(bs, blockId, (id) => this.makeConverted(id, kind, rest)),
    );
    if (kind === 'divider') {
      this.editingBlock.set(null);
      return;
    }
    // Der Block ist durch einen anderen Typ ersetzt worden — das Eingabefeld
    // im Template ist ein neues Element und braucht Fokus und Cursor erneut.
    this.editingBlock.set(null);
    this.beginEdit(blockId);
  }

  // ---- Live Preview (Obsidian) ----
  //
  // Geschriebenes Markup soll man LESEN, nicht entziffern. Ein Block zeigt
  // deshalb formatierten Text und wird erst beim Anklicken zum Rohtext-Feld.

  /** Block, der gerade im Rohtext-Modus steht. */
  protected readonly editingBlock = signal<string | null>(null);

  isEditing(blockId: string): boolean {
    return this.editingBlock() === blockId;
  }

  beginEdit(blockId: string) {
    if (this.editingBlock() === blockId) return;
    this.editingBlock.set(blockId);
    // Das Feld existiert erst nach dem naechsten Rendern.
    requestAnimationFrame(() => {
      const el = document.getElementById('block-edit-' + blockId);
      if (!(el instanceof HTMLTextAreaElement)) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  endEdit(blockId: string) {
    // Eintraege im Slash-Menue verhindern den Fokusverlust selbst
    // (mousedown/preventDefault). Ein echtes blur heisst also immer: der Cursor
    // ist woanders — dann darf auch das Menue zu.
    if (this.slash()?.blockId === blockId) this.slash.set(null);
    if (this.editingBlock() === blockId) this.editingBlock.set(null);
  }

  /** Klick auf gerenderten Text: Wikilink folgt, sonst Bearbeiten. */
  onRenderedClick(event: MouseEvent, blockId: string) {
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.('[data-plan]') as HTMLElement | null;
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      this.openByTitle(link.dataset['plan'] ?? '');
      return;
    }
    this.beginEdit(blockId);
  }

  /** Formatierter Text (mehrzeilig bzw. einzeilig). */
  renderText(raw: string): string {
    return formatBlock(raw);
  }
  renderInline(raw: string): string {
    return formatInline(raw);
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
  /** Bearbeitet wird die ganze Liste als Text: eine Zeile = ein Eintrag. */
  listAsText(block: PlanListBlock): string {
    return block.items.map((i) => i.text).join('\n');
  }
  setListText(blockId: string, value: string) {
    const lines = value.split('\n');
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => {
        if (x.type !== 'list') return x;
        // Haken bleiben an ihrer Position haengen, damit Tippen sie nicht loescht.
        const items = lines.map((text, i) => ({
          text,
          checked: x.items[i]?.checked ?? false,
        }));
        return { ...x, items: items.length ? items : [{ text: '', checked: false }] };
      }),
    );
  }
  toggleListItem(blockId: string, index: number) {
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
  updateQuoteText(blockId: string, text: string) {
    this.updateContent((bs) =>
      this.mapById(bs, blockId, (x) => (x.type === 'quote' ? { ...x, text } : x)),
    );
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
    this.editingBlock.set(null);
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

  updateText(blockId: string, text: string) {
    this.updateContent((b) =>
      this.mapById(b, blockId, (x) => (x.type === 'text' ? { ...x, text } : x)),
    );
  }

  // ---- Editor: Überschrift ----
  updateHeadingText(blockId: string, text: string) {
    this.updateContent((b) =>
      this.mapById(b, blockId, (x) => (x.type === 'heading' ? { ...x, text } : x)),
    );
  }
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
