import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../../environments/enviroment'
import { folderColorClass } from '../shared/folder-color';
import { ToastService } from '../../shared/toast.service';

/** Maximale Anzahl favorisierter Folder (Kacheln über der Todo-Liste). */
export const MAX_FAVORITE_LABELS = 4;

export interface Label {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Platz 0–2 in den Favoriten-Kacheln, null = kein Favorit. */
  favoritePosition: number | null;
  /** Abgeleitet aus favoritePosition — für einfache Abfragen im Template. */
  isFavorite: boolean;
  /**
   * Name der selbst angelegten Sammlung, in der dieser Folder in der Übersicht
   * steht. null = keiner zugeordnet.
   *
   * Die Sammlung ist bewusst nur ein Name am Folder: sie besteht aus den
   * Foldern, die ihn tragen, und verschwindet, sobald der letzte ihn ablegt.
   */
  collection: string | null;
}

// So liefert das Backend eine Kategorie (zusätzliche Felder ignorieren wir).
interface CategoryDto {
  id: string;
  name: string;
  color: string;
  icon: string;
  favoritePosition: number | null;
  collection?: string | null;
}

interface CategoryListResponse {
  categories: CategoryDto[];
  total: number;
}

const DEFAULT_LABELS: Array<{ name: string; color: string; icon: string }> = [
  { name: 'Work',     color: 'rose',    icon: 'briefcase' },
  { name: 'Freetime', color: 'emerald', icon: 'mountain' },
  { name: 'Holiday',  color: 'orange',  icon: 'sun' },
  { name: 'Other',    color: 'violet',  icon: 'question-mark-circle' },
];

@Injectable({ providedIn: 'root' })
export class LabelService {
  private readonly http = inject(HttpClient);
  private readonly clerk = inject(ClerkService);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = `${environment.apiUrl}/category`;

  readonly labels = signal<Label[]>([]);
  readonly isOverlayOpen = signal(false);
  readonly activeLabelId = signal<string | null>(null); // null = alle

  /**
   * Nachschlagewerk statt linearer Suche.
   *
   * Jede Todo-Zeile fragt mehrfach nach ihrem Label — für Farbe, Rand, Punkt
   * und Symbol. Als `labels().find(…)` war das pro Zeile und Durchlauf ein
   * Durchmarsch durch alle Folder; bei 50 Zeilen und einem Tastendruck in der
   * Suche summiert sich das. Die Map wird nur neu gebaut, wenn sich die Folder
   * ändern — also praktisch nie.
   */
  private readonly labelsById = computed(
    () => new Map(this.labels().map((label) => [label.id, label])),
  );

  /** Ein Label in konstanter Zeit. null, wenn es keins (mehr) gibt. */
  labelById(id: string | null | undefined): Label | null {
    return id ? this.labelsById().get(id) ?? null : null;
  }

  /**
   * Favorisierte Folder in der Reihenfolge ihrer Plätze (0–3) — werden als
   * Kacheln über der Todo-Liste angezeigt.
   */
  readonly favoriteLabels = computed(() =>
    this.labels()
      .filter((l) => l.isFavorite)
      .sort((a, b) => (a.favoritePosition ?? 0) - (b.favoritePosition ?? 0)),
  );

  /** true, wenn alle vier Favoriten-Plätze belegt sind. */
  readonly favoritesFull = computed(
    () => this.favoriteLabels().length >= MAX_FAVORITE_LABELS,
  );

  constructor() {
    // Erst laden, wenn ein Nutzer eingeloggt ist — vorher liefe der Request
    // ohne Token ins Leere (401). Bei Logout/Userwechsel Zustand zurücksetzen.
    this.clerk.user$
      .pipe(
        map((user) => user?.id ?? null),
        distinctUntilChanged(),
      )
      .subscribe((userId) => {
        if (userId) {
          this.loadLabels();
        } else {
          this.labels.set([]);
          this.activeLabelId.set(null);
        }
      });
  }

  // ---- Laden ----
  private loadLabels() {
    this.http.get<CategoryListResponse>(this.apiUrl).subscribe({
      next: (res) => {
        const labels = res.categories.map((c) => this.toLabel(c));
        if (labels.length === 0) {
          this.seedDefaults(); // neuer Account -> Standard-Kategorien anlegen
        } else {
          this.labels.set(labels);
        }
      },
      error: (err) => {
        console.error('Kategorien laden fehlgeschlagen', err);
        this.toast.error('Could not load folders');
      },
    });
  }

  private seedDefaults() {
    DEFAULT_LABELS.forEach((d) => this.addLabel(d.name, d.color, d.icon));
  }

  private toLabel(c: CategoryDto): Label {
    const favoritePosition = c.favoritePosition ?? null;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      favoritePosition,
      isFavorite: favoritePosition !== null,
      // Ein Server, der die Spalte noch nicht kennt, liefert das Feld gar
      // nicht. Dann ist der Folder eben keiner Sammlung zugeordnet — die
      // Übersicht bleibt bedienbar, statt auf undefined zu laufen.
      collection: c.collection ?? null,
    };
  }

  // ---- Schreiben ----
  addLabel(name: string, color: string, icon: string = 'tag') {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.http
      .post<CategoryDto>(this.apiUrl, { name: trimmed, color, icon })
      .subscribe({
        next: (c) => this.labels.update((list) => [...list, this.toLabel(c)]),
        error: (err) => {
          console.error('Kategorie anlegen fehlgeschlagen', err);
          this.toast.error('Could not create folder');
        },
      });
  }

  /** Favorit umschalten — sofort lokal anzeigen, bei Fehler Serverstand laden. */
  toggleFavorite(id: string) {
    const label = this.labelById(id);

    if (!label) {
      return;
    }

    const shouldBeFavorite = !label.isFavorite;

    if (
      shouldBeFavorite &&
      this.favoriteLabels().length >= MAX_FAVORITE_LABELS
    ) {
      this.toast.show('Maximum four favorites. Remove a star first');

      return;
    }

    this.http
      .patch<CategoryDto>(
        `${this.apiUrl}/${id}/favorite`,
        {
          favorite: shouldBeFavorite,
        },
      )
      .subscribe({
        next: (updatedCategory) => {
          this.labels.update((labels) =>
            labels.map((currentLabel) =>
              currentLabel.id === id
                ? this.toLabel(updatedCategory)
                : currentLabel,
            ),
          );
        },
        error: (error) => {
          console.error('Folder-Favorit speichern fehlgeschlagen', error);
          this.toast.error('Could not save favorite');
          this.loadLabels();
        },
      });
  }

  /**
   * Verschiebt einen Folder in der Übersicht. Die Indizes beziehen sich auf die
   * vollständige, unsortierte Liste (beim Suchen ist Sortieren deaktiviert).
   */
  reorderLabels(previousIndex: number, currentIndex: number) {
    if (previousIndex === currentIndex) return;

    const list = [...this.labels()];
    if (
      previousIndex < 0 || currentIndex < 0 ||
      previousIndex >= list.length || currentIndex >= list.length
    ) return;

    const [moved] = list.splice(previousIndex, 1);
    list.splice(currentIndex, 0, moved);
    this.applyOrder(list);
  }

  /**
   * Die komplette Reihenfolge setzen — für Züge, die mehr als einen Folder
   * bewegen, etwa einen ganzen Abschnitt.
   *
   * Die Liste MUSS jeden Folder genau einmal enthalten. Fehlt einer, behielte
   * er serverseitig seine alte Position und stünde danach irgendwo zwischen
   * den neu nummerierten — die Reihenfolge wäre still verwürfelt. Deshalb
   * wird hier geprüft statt vertraut.
   */
  setLabelOrder(ids: string[]) {
    const current = this.labels();
    if (ids.length !== current.length) return;

    const byId = new Map(current.map((label) => [label.id, label]));
    const list: Label[] = [];
    for (const id of ids) {
      const label = byId.get(id);
      if (!label) return; // unbekannte ID: lieber nichts tun als falsch sortieren
      byId.delete(id);
      list.push(label);
    }

    this.applyOrder(list);
  }

  /** Neue Reihenfolge sofort anzeigen und sichern; bei Fehler zurückholen. */
  private applyOrder(list: Label[]) {
    this.labels.set(list);

    this.http
      .put<void>(`${this.apiUrl}/reorder`, { ids: list.map((l) => l.id) })
      .subscribe({
        error: (err) => {
          console.error('Folder-Reihenfolge speichern fehlgeschlagen', err);
          this.toast.error('Could not save order');
          this.loadLabels();
        },
      });
  }

  removeLabel(id: string) {
    this.http.delete<void>(`${this.apiUrl}/${id}`).subscribe({
      next: () => {
        this.labels.update((list) => list.filter((l) => l.id !== id));
        if (this.activeLabelId() === id) {
          this.activeLabelId.set(null);
        }
      },
      error: (err) => {
        console.error('Kategorie löschen fehlgeschlagen', err);
        this.toast.error('Could not delete folder');
      },
    });
  }

  /** Rename or recolor a folder. Applied optimistically, reverted on error. */
updateLabel(
  id: string,
  changes: {
    name?: string;
    color?: string;
    icon?: string;
    /** null löst die Zuordnung zu einer Sammlung wieder auf. */
    collection?: string | null;
  },
) {
  const snapshot = this.labels();

  const patch: Record<string, string | null> = {};
  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (!name) return;                 // empty name discards the edit
    patch['name'] = name;
  }
  if (changes.color !== undefined) patch['color'] = changes.color;
  if (changes.icon !== undefined) patch['icon'] = changes.icon;
  if (changes.collection !== undefined) {
    // Ein leer getippter Name ist dasselbe wie „keine Sammlung" — sonst
    // entstünde ein Abschnitt mit dem Titel "" , den man nicht mehr trifft.
    const collection = changes.collection?.trim();
    patch['collection'] = collection ? collection : null;
  }
  if (Object.keys(patch).length === 0) return;

  // Show it right away — the folder colour is used all over the app.
  this.labels.update((list) =>
    list.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  );

  this.http.put<CategoryDto>(`${this.apiUrl}/${id}`, patch).subscribe({
    next: (c) =>
      this.labels.update((list) =>
        list.map((l) =>
          l.id === id
            ? {
                ...l,
                name: c.name,
                color: c.color,
                icon: c.icon,
                collection: c.collection ?? null,
              }
            : l,
        ),
      ),
    error: (err) => {
      console.error('Folder speichern fehlgeschlagen', err);
      this.toast.error('Could not save folder');
      this.labels.set(snapshot);       // roll back
    },
  });
}

  /**
   * Folder einer Sammlung zuordnen. null löst die Zuordnung auf.
   *
   * Eigene Methode, weil das der einzige Weg ist, eine Sammlung anzulegen
   * oder aufzulösen: es gibt keinen Sammlungs-Datensatz, nur diesen Namen.
   */
  setCollection(id: string, collection: string | null) {
    const label = this.labelById(id);
    if (!label) return;

    const next = collection?.trim() || null;
    if (next === label.collection) return; // nichts geändert, kein Request

    this.updateLabel(id, { collection: next });
  }

  // ---- UI-State / Helfer ----
  borderClassFor(labelId: string | null): string {
    if (labelId === null) return 'border-zinc-600';
    return folderColorClass(this.labelById(labelId)?.color, 'border');
  }

  openOverlay()  { this.isOverlayOpen.set(true); }
  closeOverlay() { this.isOverlayOpen.set(false); }

  selectLabel(id: string | null) {
    this.activeLabelId.set(id);
    this.closeOverlay();
  }
}
