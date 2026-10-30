import { LabelService, Label } from '../../services/label.service';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  HostListener,
  Injector,
  afterNextRender,
  signal,
  untracked,
} from '@angular/core';
import {
  CdkDropList,
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { HoldToDrag } from '../../../shared/hold-to-drag';
import { touchOnly } from '../../../shared/touch';
import { TodoService } from '../../services/todo';   // Pfad ggf. anpassen
import { folderColorClass } from '../../shared/folder-color';
import { splitFolderName } from '../../shared/folder-name';
import { folderSlugs } from '../../shared/folder-slug';
import { ToastService } from '../../../shared/toast.service';
import {
  FolderGroup,
  FolderGrouping,
  collectionNames,
  groupFolders,
  reorderSections,
  toGlobalMove,
} from '../../shared/folder-groups';
import { viewChild, ElementRef } from '@angular/core';

import {
  LucideAngularModule,
  ChevronRight,
  GripVertical,
  Search,
  Star,
  Pencil,
} from 'lucide-angular';

/** Gewählte Unterteilung der Übersicht — überlebt das Schließen des Dialogs. */
const GROUPING_KEY = 'folders.grouping';

function storedGrouping(): FolderGrouping {
  try {
    const value = localStorage.getItem(GROUPING_KEY);
    return value === 'auto' || value === 'custom' ? value : 'flat';
  } catch {
    // Privater Modus / blockierte Site-Daten: dann eben das flache Raster.
    return 'flat';
  }
}

@Component({
  selector: 'app-categories-overlay',
  imports: [
    LucideAngularModule,
    CdkDropList,
    CdkDrag,
    HoldToDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-overlay.html',
  styleUrl: './categories-overlay.scss',
})
export class CategoriesOverlay {
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);
  private readonly toast = inject(ToastService);

  /** Die Adresse jedes Folders (my-todo.app/freetime) — siehe folder-slug.ts. */
  private readonly folderPaths = computed(() => folderSlugs(this.labels()));

  protected folderLink(id: string): string {
    return `${window.location.origin}/${this.folderPaths().get(id) ?? ''}`;
  }

  /** Ohne https:// — so, wie man die Adresse liest und tippt. */
  protected folderLinkLabel(id: string): string {
    return `${window.location.host}/${this.folderPaths().get(id) ?? ''}`;
  }

  protected async copyFolderLink(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(this.folderLink(id));
      this.toast.success('Link copied');
    } catch {
      // Ohne Erlaubnis oder ohne sichere Verbindung gibt es keine
      // Zwischenablage. Die Adresse steht trotzdem lesbar daneben.
      this.toast.show(`Copy this link: ${this.folderLinkLabel(id)}`);
    }
  }

  protected readonly StarIcon = Star;
  protected readonly GripIcon = GripVertical;
  protected readonly SearchIcon = Search;
  protected readonly PencilIcon = Pencil;
  protected readonly ChevronIcon = ChevronRight;
  protected readonly favoritesFull = this.labelService.favoritesFull;

  protected readonly labels        = this.labelService.labels;
  protected readonly isOpen        = this.labelService.isOverlayOpen;
  protected readonly activeLabelId = this.labelService.activeLabelId;
  /**
   * Woher der Dialog kommt: die Mitte des Folder-Knopfs, als Abstand zur
   * Bildschirmmitte, wo der Dialog steht. Er wächst von dort auf und
   * schrumpft beim Schliessen dorthin zurück — man sieht, was man geöffnet
   * hat und wohin es geht. Ohne sichtbaren Knopf (Kürzel „f" auf einer
   * Ansicht ohne Kopfleiste) kommt er aus der Mitte.
   *
   * Gemessen beim Öffnen; der Wert bleibt, bis er wieder zu ist.
   */
  protected readonly origin = computed(() => {
    if (!this.isOpen()) return { x: 0, y: 0 };
    return untracked(() => {
      const rect = document.querySelector('.folder-pill')?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: 0, y: 0 };
      return {
        x: Math.round(rect.left + rect.width / 2 - window.innerWidth / 2),
        y: Math.round(rect.top + rect.height / 2 - window.innerHeight / 2),
      };
    });
  });

  /**
   * Die Karten kommen beim Öffnen nacheinander herein — nur dann. Beim Suchen,
   * Umgruppieren oder Ziehen entstehen Karten neu; liefen sie da jedesmal
   * gestaffelt ein, hinge die Liste beim Tippen hinterher.
   */
  private readonly settled = signal(false);
  protected readonly fresh = computed(() => this.isOpen() && !this.settled());
  private readonly settle = effect((onCleanup) => {
    if (!this.isOpen()) {
      this.settled.set(false);
      return;
    }
    const timer = setTimeout(() => this.settled.set(true), 700);
    onCleanup(() => clearTimeout(timer));
  });

  /**
   * Am Rechner steht der Cursor gleich in der Suche: man öffnet die Folder
   * (Klick oder „f") meist, um einen bestimmten zu finden, und tippt los.
   * Auf Touch nicht — dort schöbe die Tastatur die halbe Liste weg.
   *
   * Gemerkt wird, was vorher den Fokus hatte; Esc gibt ihn dorthin zurück.
   */
  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly newFolderInput = viewChild<ElementRef<HTMLInputElement>>('newCat');
  private opener: HTMLElement | null = null;
  private readonly focusOnOpen = effect(() => {
    if (!this.isOpen()) return;
    untracked(() => {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
      // Aus „Create new list": gleich ins Feld für den neuen Ordner.
      if (this.labelService.createOnOpen()) {
        this.labelService.createOnOpen.set(false);
        afterNextRender(() => this.newFolderInput()?.nativeElement.focus({ preventScroll: false }), {
          injector: this.injector,
        });
        return;
      }
      if (this.touchOnly()) return;
      afterNextRender(() => this.searchInput()?.nativeElement.focus({ preventScroll: true }), {
        injector: this.injector,
      });
    });
  });

  protected readonly palette = ['rose', 'orange', 'amber', 'emerald', 'teal', 'sky', 'violet', 'fuchsia'];
  protected readonly draftColor = signal('rose');

  /**
   * Auf Touch-Geraeten gibt es kein Sortieren der Folder — weder einzeln noch
   * als Sammlung. Wer durch die Liste scrollen wollte, hat dabei immer wieder
   * einen Folder verschoben; auch das Halten zum Verschieben hat das nicht
   * aufgewogen. Die Griffe verschwinden, das Ziehen ist gesperrt. In eine
   * Sammlung einordnen geht weiter ueber „Bearbeiten → Collection".
   */
  protected readonly touchOnly = touchOnly();

  // ---- Suche ----
  protected readonly searchTerm = signal('');
  protected readonly isSearching = computed(() => this.searchTerm().trim().length > 0);

  protected readonly visibleLabels = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.labels();
    return this.labels().filter((l) => l.name.toLowerCase().includes(term));
  });

  // ---- Unterteilung ----
  //
  // 'auto' kostet den Nutzer nichts und steht sofort da; 'custom' sortiert
  // genau so, wie er es will, verlangt dafür aber, dass er es einmal sagt.
  // Beides nebeneinander wäre eine Übersicht, in der jeder Folder zweimal
  // vorkommt — deshalb ein Umschalter und nicht zwei Ansichten.
  protected readonly grouping = signal<FolderGrouping>(storedGrouping());
  protected readonly groupings: readonly {
    value: FolderGrouping;
    label: string;
  }[] = [
    { value: 'flat', label: 'All' },
    { value: 'auto', label: 'Auto' },
    { value: 'custom', label: 'Collections' },
  ];

  /** Die Wahl überlebt das Schließen: sie ist eine Vorliebe, keine Sitzung. */
  private readonly persistGrouping = effect(() => {
    const value = this.grouping();
    try {
      localStorage.setItem(GROUPING_KEY, value);
    } catch {
      /* Speichern ist ein Komfort, kein Muss. */
    }
  });

  /** Eingeklappte Abschnitte, über ihren Schlüssel. */
  private readonly collapsedKeys = signal<ReadonlySet<string>>(new Set());

  /** Die Abschnitte der Übersicht — beim Suchen nur mit Treffern. */
  protected readonly sections = computed(() =>
    groupFolders(this.visibleLabels(), this.grouping()),
  );

  /** Bereits vergebene Sammlungsnamen — als Vorschläge beim Zuordnen. */
  protected readonly collections = computed(() => collectionNames(this.labels()));

  /**
   * Die Karten-Listen verbinden sich ausdrücklich untereinander, statt über
   * cdkDropListGroup.
   *
   * Die Gruppe würde JEDE Liste darin verbinden — auch die äußere, in der die
   * Abschnitte liegen. Dann ließe sich eine Folder-Karte auf die Abschnitts-
   * ebene fallen, wo sie nichts zu suchen hat.
   */
  protected readonly cardListIds = computed(() =>
    this.sections().map((_, index) => `folder-cards-${index}`),
  );

  /**
   * true, sobald etwas die Liste verkürzt oder umsortiert darstellt.
   *
   * Ziehen ist dann nur eingeschränkt sinnvoll: beim Suchen passen die
   * Indizes des Ausschnitts nicht auf die gespeicherte Reihenfolge. Innerhalb
   * eines Abschnitts geht es trotzdem — dafür rechnet toGlobalMove um.
   */
  protected readonly isGrouped = computed(() => this.grouping() !== 'flat');

  protected readonly editingId     = signal<string | null>(null);
  protected readonly colorPickerId = signal<string | null>(null);
  protected readonly confirmDeleteId = signal<string | null>(null);

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('rename');

/** The pencil is the only way in and out of edit mode. */
toggleEdit(id: string, event: Event) {
  event.stopPropagation();
  const opening = this.editingId() !== id;
  this.editingId.set(opening ? id : null);

  if (opening) {
    requestAnimationFrame(() => {
      const el = this.renameInput()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }
}

stopEditing(event: Event) {
  event.stopPropagation();
  this.editingId.set(null);
}

/** Saves on blur and on Enter — but only when the name really changed. */
commitRename(id: string, current: string, value: string, event: Event) {
  event.stopPropagation();
  const next = value.trim();
  if (!next || next === current) return;
  this.labelService.updateLabel(id, { name: next });
}

cancelEdit(input: HTMLInputElement, original: string, event: Event) {
  event.stopPropagation();
  input.value = original;
  this.editingId.set(null);
}



/** While editing, a click on the card must not switch the filter. */
onCardClick(id: string) {
  if (this.editingId() === id) return;
  this.select(id);
}









cancelRename(event: Event) {
  event.stopPropagation();             // keeps Escape from closing the overlay
  this.editingId.set(null);
}



pickColor(id: string, color: string, event: Event) {
  event.stopPropagation();
  this.labelService.updateLabel(id, { color });
  this.colorPickerId.set(null);
}

  clearSearch() {
    this.searchTerm.set('');
  }

  // ---- Unterteilung bedienen ----

  setGrouping(value: FolderGrouping) {
    this.grouping.set(value);
  }

  /**
   * Ein Satz dazu, woher die Abschnitte kommen.
   *
   * Ohne ihn ist "Auto" eine Blackbox: man sieht Abschnitte, weiss aber nicht,
   * warum ein Folder in diesem steht — und kann es folglich nicht steuern.
   */
  groupingHint(): string | null {
    switch (this.grouping()) {
      case 'auto':
        return 'Folders whose names start with the same word stand together.';
      case 'custom':
        return this.collections().length === 0
          ? 'No collections yet. Open a folder with the pencil and name one.'
          : 'Drag a folder into another collection, or set it while editing.';
      default:
        return null;
    }
  }

  isCollapsed(key: string): boolean {
    return this.collapsedKeys().has(key);
  }

  toggleCollapsed(key: string) {
    this.collapsedKeys.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /**
   * Einen Folder einer Sammlung zuordnen — aus dem Bearbeiten-Bereich heraus.
   * Ein leeres Feld löst die Zuordnung auf.
   */
  assignCollection(id: string, value: string) {
    this.labelService.setCollection(id, value.trim() || null);
  }

  // ---- Sortieren ----
  //
  // Beim Suchen ist Sortieren gesperrt, sonst würden sich die Indizes der
  // gefilterten Liste nicht auf die echte Reihenfolge übertragen lassen.

  /**
   * Nur in den eigenen Sammlungen darf ein Folder in einen fremden Abschnitt.
   *
   * In der automatischen Gruppierung ergibt sich der Abschnitt aus dem Namen —
   * ihn per Ziehen zu wechseln hieße, den Folder umzubenennen. Das wäre eine
   * Überraschung, also nimmt der fremde Abschnitt die Karte gar nicht erst an.
   */
  protected readonly canEnter = (
    drag: { dropContainer: unknown },
    drop: unknown,
  ): boolean => this.grouping() === 'custom' || drag.dropContainer === drop;

  /**
   * Einen ganzen Abschnitt verschieben.
   *
   * Beim Suchen und für den Sammelabschnitt gesperrt — siehe sectionDragOff.
   */
  dropSection(event: CdkDragDrop<unknown>) {
    const ids = reorderSections(
      this.sections(),
      event.previousIndex,
      event.currentIndex,
    );
    if (ids) this.labelService.setLabelOrder(ids);
  }

  /**
   * Warum ein Abschnitt sich nicht ziehen lässt — oder null, wenn er es tut.
   *
   * Beim Suchen enthalten die Abschnitte nur die Treffer. Aus ihnen die neue
   * Gesamtreihenfolge zu bauen hieße, alle nicht gefundenen Folder aus der
   * Liste zu verlieren; sie behielten serverseitig ihre alten Positionen und
   * stünden danach wahllos zwischen den neu nummerierten.
   *
   * Der Sammelabschnitt steht immer am Ende — dahin sortiert groupFolders,
   * was zu keiner Gruppe gehört. Ihn ziehen zu lassen hieße, einen Griff
   * anzubieten, der nach dem Loslassen sichtbar nichts tut.
   */
  sectionDragOff(section: FolderGroup): string | null {
    if (this.isSearching()) return 'Sections cannot be moved while searching';
    if (section.rest) return 'The leftovers always come last';
    return null;
  }

  // ---- Farbe der Abschnitte ----
  //
  // Die Überschrift trägt die Farbe ihrer Folder, damit sie sichtbar zu den
  // Karten darunter gehört. Der Sammelabschnitt bleibt gedämpft: er ist kein
  // Thema, sondern der Rest, und eine Farbe würde eine Zusammengehörigkeit
  // behaupten, die es dort nicht gibt.

  sectionTextClass(section: FolderGroup): string {
    return section.rest ? 'text-subtle' : folderColorClass(section.color, 'text');
  }

  sectionBadgeClass(section: FolderGroup): string {
    return section.rest
      ? 'bg-fill text-subtle'
      : `${folderColorClass(section.color, 'iconBox')} ${folderColorClass(section.color, 'text')}`;
  }

  drop(event: CdkDragDrop<FolderGroup>) {
    // Flaches Raster: ein einziger Abschnitt, die Indizes passen direkt.
    if (!this.isGrouped()) {
      this.labelService.reorderLabels(event.previousIndex, event.currentIndex);
      return;
    }

    const from = event.previousContainer.data;
    const to = event.container.data;

    if (event.previousContainer === event.container) {
      // Der Abschnitt zeigt nur einen Ausschnitt der gespeicherten Liste.
      const move = toGlobalMove(
        this.labels(),
        from.labels,
        event.previousIndex,
        event.currentIndex,
      );
      if (move) {
        this.labelService.reorderLabels(move.previousIndex, move.currentIndex);
      }
      return;
    }

    // In einen anderen Abschnitt gezogen heißt: neu zuordnen. Der Sammel-
    // abschnitt am Ende ist keine Sammlung — dort landet, was zu keiner gehört.
    const moved: Label | undefined = from.labels[event.previousIndex];
    if (!moved) return;

    this.labelService.setCollection(moved.id, to.rest ? null : to.title);
  }

  add(name: string) {
    this.labelService.addLabel(name, this.draftColor());
  }

  close() {
    this.labelService.closeOverlay();
  }

  select(id: string | null) {
    this.labelService.selectLabel(id);
  }

  toggleFavorite(id: string, event: Event) {
    event.stopPropagation(); // verhindert, dass select(id) feuert
    this.labelService.toggleFavorite(id);
  }

  /** Gedaempfter Hintergrund fuer den Typ-Chip, in der Folder-Farbe. */
  chipClass(color: string): string {
    return (
      folderColorClass(color, 'iconBox') + ' ' + folderColorClass(color, 'text')
    );
  }

  /** Prefix wie projekt: vom Namen trennen - siehe folder-name.ts. */
  nameParts(raw: string) {
    return splitFolderName(raw);
  }

  textClass(color: string): string {
    return folderColorClass(color, 'text');
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.close();
      const opener = this.opener ?? document.querySelector<HTMLElement>('.folder-pill');
      this.opener = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    }
  }

  /**
   * Esc in der Suche leert sie zuerst; ist sie leer, schliesst Esc den
   * Dialog. Vorher hielt das Feld jedes Esc fest — seit der Cursor beim
   * Öffnen darin steht, ging der Dialog per Tastatur gar nicht mehr zu.
   */
  protected onSearchEscape(event: Event, field: HTMLInputElement): void {
    if (!this.isSearching()) return;
    event.stopPropagation();
    this.clearSearch();
    field.value = '';
  }


askDelete(id: string, event: Event) {
  event.stopPropagation();          // verhindert, dass select(id) feuert
  this.confirmDeleteId.set(id);
}

cancelDelete(event: Event) {
  event.stopPropagation();
  this.confirmDeleteId.set(null);
}

confirmDelete(id: string, event: Event) {
  event.stopPropagation();
  this.todoService.clearLabel(id);  // TodoService injecten nicht vergessen
  this.labelService.removeLabel(id);
  this.confirmDeleteId.set(null);
}
}