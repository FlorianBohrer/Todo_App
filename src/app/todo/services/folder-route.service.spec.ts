import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { SpyLocation } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { ClerkService } from 'ngx-clerk';
import { of } from 'rxjs';

import { ToastService } from '../../shared/toast.service';
import { FolderRoute } from './folder-route.service';
import { Label, LabelService } from './label.service';
import { TodoService } from './todo';

const label = (id: string, name: string): Label => ({
  id,
  name,
  color: 'rose',
  icon: 'briefcase',
  favoritePosition: null,
  isFavorite: false,
  collection: null,
});

const FOLDERS = [
  label('c1', 'Work'),
  label('c2', 'Freetime'),
  label('c3', 'Küche'),
  label('c4', 'Holiday planning for the summer'),
  label('c5', 'Haushalt'),
];

describe('FolderRoute', () => {
  let location: SpyLocation;
  let labels: LabelService;
  let todos: TodoService;
  let toast: ToastService;

  /** Die App starten, als läge `path` in der Adresszeile. */
  function start(path: string): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClerkService, useValue: { user$: of(null) } },
        { provide: Location, useClass: SpyLocation },
      ],
    });
    location = TestBed.inject(Location) as SpyLocation;
    location.setInitialPath(path);
    labels = TestBed.inject(LabelService);
    todos = TestBed.inject(TodoService);
    toast = TestBed.inject(ToastService);
    TestBed.inject(FolderRoute);
    TestBed.tick();
  }

  /** Die Folder kommen vom Server. */
  function load(): void {
    labels.labels.set(FOLDERS);
    TestBed.tick();
  }

  it('opens the folder from the address once the folders are loaded, in the list', () => {
    start('/work');
    todos.view.set('week');
    TestBed.tick();

    // Vor der Anmeldung: Adresse bleibt stehen, nichts wird überschrieben.
    expect(location.path()).toBe('/work');
    expect(labels.activeLabelId()).toBeNull();

    load();

    expect(labels.activeLabelId()).toBe('c1');
    expect(todos.view()).toBe('list');
    expect(location.path()).toBe('/work');
    expect(TestBed.inject(Title).getTitle()).toBe('Work · ToDo');
  });

  it('writes the canonical address for a sloppy one, without a new history entry', () => {
    start('/K%C3%BCche');
    load();

    expect(labels.activeLabelId()).toBe('c3');
    expect(location.path()).toBe('/kueche');
  });

  it('puts a folder chosen in the app into the address, and back leads back', () => {
    start('/');
    load();

    labels.selectLabel('c2');
    TestBed.tick();
    expect(location.path()).toBe('/freetime');

    labels.selectLabel(null);
    TestBed.tick();
    expect(location.path()).toBe('/');

    location.simulateUrlPop('/freetime');
    TestBed.tick();
    expect(labels.activeLabelId()).toBe('c2');

    location.simulateUrlPop('/');
    TestBed.tick();
    expect(labels.activeLabelId()).toBeNull();
  });

  it('follows a rename without adding a history step', () => {
    start('/work');
    load();
    const steps = location.urlChanges.length;

    labels.labels.update((list) => list.map((l) => (l.id === 'c1' ? { ...l, name: 'Office' } : l)));
    TestBed.tick();

    expect(location.path()).toBe('/office');
    expect(location.urlChanges.length).toBe(steps + 1);
    expect(location.urlChanges.at(-1)).toContain('replace');
  });

  it('opens every folder, also by a short form, and writes its full address', () => {
    start('/holiday');
    load();

    expect(labels.activeLabelId()).toBe('c4');
    expect(location.path()).toBe('/holiday-planning-for-the-summer');

    for (const [path, id] of [['/freetime', 'c2'], ['/haushalt', 'c5'], ['/kueche', 'c3'], ['/work', 'c1']] as const) {
      location.simulateUrlPop(path);
      TestBed.tick();
      expect(labels.activeLabelId()).toBe(id);
    }
  });

  it('names the candidates when a short form fits several folders', () => {
    start('/h');
    load();

    expect(labels.activeLabelId()).toBeNull();
    expect(toast.toasts().map((t) => t.message)).toEqual([
      '“h” fits 2 folders: Holiday planning for the summer, Haushalt',
    ]);
  });

  it('says so when there is no such folder, and shows all', () => {
    start('/nope');
    load();

    expect(labels.activeLabelId()).toBeNull();
    // Die Startseite: im Browser '', im SpyLocation '/'.
    expect(['', '/']).toContain(location.path());
    expect(toast.toasts().map((t) => t.message)).toEqual(['There is no folder called “nope”']);
  });
});
