import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../../environments/enviroment'

export interface Label {
  id: string;
  name: string;
  color: string;
  icon: string;
}

// So liefert das Backend eine Kategorie (zusätzliche Felder ignorieren wir).
interface CategoryDto {
  id: string;
  name: string;
  color: string;
  icon: string;
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
  private readonly apiUrl = `${environment.apiUrl}/category`;

  readonly labels = signal<Label[]>([]);
  readonly isOverlayOpen = signal(false);
  readonly activeLabelId = signal<string | null>(null); // null = alle

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
      error: (err) => console.error('Kategorien laden fehlgeschlagen', err),
    });
  }

  private seedDefaults() {
    DEFAULT_LABELS.forEach((d) => this.addLabel(d.name, d.color, d.icon));
  }

  private toLabel(c: CategoryDto): Label {
    return { id: c.id, name: c.name, color: c.color, icon: c.icon };
  }

  // ---- Schreiben ----
  addLabel(name: string, color: string, icon: string = 'tag') {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.http
      .post<CategoryDto>(this.apiUrl, { name: trimmed, color, icon })
      .subscribe({
        next: (c) => this.labels.update((list) => [...list, this.toLabel(c)]),
        error: (err) => console.error('Kategorie anlegen fehlgeschlagen', err),
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
      error: (err) => console.error('Kategorie löschen fehlgeschlagen', err),
    });
  }

  // ---- UI-State / Helfer (unverändert) ----
  private readonly colorToBorder: Record<string, string> = {
    violet:  'border-violet-500',
    emerald: 'border-emerald-500',
    rose:    'border-rose-500',
    orange:  'border-orange-500',
    amber:   'border-amber-500',
    teal:    'border-teal-500',
    sky:     'border-sky-500',
    fuchsia: 'border-fuchsia-500',
  };

  borderClassFor(labelId: string | null): string {
    if (labelId === null) return 'border-zinc-600';
    const label = this.labels().find((l) => l.id === labelId);
    return this.colorToBorder[label?.color ?? ''] ?? 'border-zinc-600';
  }

  openOverlay()  { this.isOverlayOpen.set(true); }
  closeOverlay() { this.isOverlayOpen.set(false); }

  selectLabel(id: string | null) {
    this.activeLabelId.set(id);
    this.closeOverlay();
  }
}
