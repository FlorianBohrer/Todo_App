import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Location } from '@angular/common';
import { Title } from '@angular/platform-browser';

import { ToastService } from '../../shared/toast.service';
import { folderForSlug, folderSlugs, slugFromPath } from '../shared/folder-slug';
import { Label, LabelService } from './label.service';
import { TodoService } from './todo';

const APP_TITLE = 'ToDo';

/**
 * Der offene Folder steht in der Adresse: my-todo.app/work.
 *
 * Zwei Richtungen, eine Quelle: der aktive Folder bleibt
 * LabelService.activeLabelId. Dieser Dienst liest ihn aus der Adresse
 * (beim Laden, bei Zurück/Vor im Browser) und schreibt ihn hinein, sobald er
 * sich in der App ändert. Ohne Router — es gibt genau ein Segment, und dafür
 * reicht die History-Schnittstelle.
 *
 * Ein Link auf einen Folder öffnet die Liste: dort wirkt der Folder. Woche
 * und Pläne haben ihre eigenen Filter.
 */
@Injectable({ providedIn: 'root' })
export class FolderRoute {
  private readonly location = inject(Location);
  private readonly labelService = inject(LabelService);
  private readonly todoService = inject(TodoService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);

  /**
   * Ein Folder aus der Adresse, der noch auf die Folder wartet.
   *
   * Beim Laden kennt die App ihre Folder noch nicht — die kommen erst nach
   * der Anmeldung vom Server. Bis dahin bleibt die Adresse, wie sie ist;
   * sonst stuende nach dem ersten Bild schon wieder „/" darin.
   */
  private readonly pending = signal<string | null>(slugFromPath(this.location.path()));

  /** Der Folder, den die Adresse zuletzt gezeigt hat. */
  private shownId: string | null = null;

  constructor() {
    // Adresse → Folder, sobald die Folder da sind.
    effect(() => {
      const slug = this.pending();
      const labels = this.labelService.labels();
      if (slug === null || labels.length === 0) return;
      untracked(() => {
        this.pending.set(null);
        this.open(slug, labels);
      });
    });

    // Folder → Adresse und Titel des Tabs.
    effect(() => {
      const id = this.labelService.activeLabelId();
      const labels = this.labelService.labels();
      if (this.pending() !== null) return;

      const slugs = folderSlugs(labels);
      // Ein Folder, den die Liste (noch) nicht kennt: nichts anfassen.
      if (id !== null && !slugs.has(id)) return;

      const path = id === null ? '/' : `/${slugs.get(id)}`;
      const label = id === null ? null : labels.find((l) => l.id === id) ?? null;
      untracked(() => this.title.setTitle(label ? `${label.name} · ${APP_TITLE}` : APP_TITLE));

      if (currentPath(this.location.path()) === path) {
        this.shownId = id;
        return;
      }

      // Ein anderer Folder ist ein Schritt, zu dem „Zurück" führen soll.
      // Derselbe unter neuem Namen (umbenannt) ist keiner.
      if (id !== this.shownId) this.location.go(path);
      else this.location.replaceState(path);
      this.shownId = id;
    });

    // Zurück und Vor im Browser.
    this.location.subscribe((event) => {
      const slug = slugFromPath(event.url ?? this.location.path());
      if (slug === null) {
        this.shownId = null;
        this.labelService.activeLabelId.set(null);
        return;
      }
      const labels = this.labelService.labels();
      if (labels.length === 0) this.pending.set(slug);
      else this.open(slug, labels);
    });
  }

  /** Den Folder zur Adresse öffnen — oder sagen, dass es ihn nicht gibt. */
  private open(slug: string, labels: readonly Label[]): void {
    const id = folderForSlug(slug, labels);

    if (id === null) {
      this.toast.show(`There is no folder called “${slug}”`);
      this.shownId = null;
      this.labelService.activeLabelId.set(null);
      this.location.replaceState('/');
      return;
    }

    // Vorher setzen: die Adresse zeigt diesen Folder schon. Weicht sie nur in
    // der Schreibweise ab („/Work"), wird sie ersetzt statt neu angelegt.
    this.shownId = id;
    this.labelService.activeLabelId.set(id);
    this.todoService.view.set('list');
  }
}

/** „/work?x=1#y" → „/work"; leer und „/" → „/". */
function currentPath(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return clean === '' ? '/' : clean.startsWith('/') ? clean : `/${clean}`;
}
