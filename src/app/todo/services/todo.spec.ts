import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClerkService } from 'ngx-clerk';
import { of } from 'rxjs';
import { TodoService } from './todo';
import { Todo } from '../model/todo.model';

const todo = (id: string, title: string, completed = false): Todo => ({
  id,
  title,
  completed,
  isFavorite: false,
  labelIds: [],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  scheduledDate: null,
  archivedAt: null,
  completedAt: null,
  seriesId: null,
  repeat: null,
} as unknown as Todo);

describe('TodoService', () => {
  let service: TodoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Ohne angemeldeten Nutzer lädt der Dienst nichts von selbst.
        { provide: ClerkService, useValue: { user$: of(null) } },
      ],
    });
    service = TestBed.inject(TodoService);
    http = TestBed.inject(HttpTestingController);
  });

  const seed = (items: Todo[]) =>
    (service as unknown as { todos: { set(v: Todo[]): void } }).todos.set(items);
  const titles = () => service.snapshot().map((t) => t.title);

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('counts the progress of each task with steps', () => {
    seed([todo('a', 'Umzug'), todo('a1', '/sub Kartons', true), todo('a2', '/sub Bus'), todo('b', 'Milch')]);
    expect(service.stepProgress().get('a')).toEqual({ done: 1, total: 2 });
    expect(service.stepProgress().has('b')).toBe(false);
  });

  it('keeps done steps under "Active" while their task is open', () => {
    seed([todo('a', 'Umzug'), todo('a1', '/sub Kartons', true), todo('b', 'Milch', true)]);
    service.filter.set('active');
    expect(service.filteredTodos().map((t) => t.id)).toEqual(['a', 'a1']);
  });

  it('makes a task a step at the end of another task', () => {
    seed([todo('a', 'Umzug'), todo('a1', '/sub Kartons'), todo('b', 'Bus mieten'), todo('c', 'Milch')]);
    expect(service.makeStepOf('c', 'a')).toBe(true);
    expect(titles()).toEqual(['Umzug', '/sub Kartons', '/sub Milch', 'Bus mieten']);
    http.match(() => true);
  });

  it('does not make a task with steps a step', () => {
    seed([todo('a', 'Umzug'), todo('b', 'Bus'), todo('b1', '/sub Anrufen')]);
    expect(service.makeStepOf('b', 'a')).toBe(false);
    expect(titles()).toEqual(['Umzug', 'Bus', '/sub Anrufen']);
  });

  it('turns a step into its own task right behind its group', () => {
    seed([todo('a', 'Umzug'), todo('a1', '/must /sub Kartons'), todo('a2', '/sub Bus'), todo('c', 'Milch')]);
    expect(service.makeOwnTask('a1')).toBe(true);
    expect(titles()).toEqual(['Umzug', '/sub Bus', '/must Kartons', 'Milch']);
    http.match(() => true);
  });

  describe('sections', () => {
    const order = () => service.filteredTodos().map((t) => t.id);
    const created = (id: string, title: string) =>
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/todo')).flush({
        id, title, completed: false, isFavorite: false, categoryIds: [],
        createdAt: '2026-10-27T10:00:00Z', scheduledDate: null, archivedAt: null, completedAt: null,
      });

    it('is no task: not counted, not in the week', () => {
      seed([todo('s', '/section Später'), todo('a', 'Milch')]);
      expect(service.stats().total).toBe(1);
      expect(service.allTodos().map((t) => t.id)).toEqual(['a']);
      expect(order()).toEqual(['s', 'a']);
    });

    it('puts a todo typed at the top above the first section', () => {
      seed([todo('x', 'Paket'), todo('s', '/section Später'), todo('y', 'Steuer')]);
      service.addTodo('Milch');
      created('n', 'Milch');
      expect(titles()).toEqual(['Paket', 'Milch', '/section Später', 'Steuer']);
      http.match(() => true);
    });

    it('adds into a section at its end, and a new section at the end of the list', () => {
      seed([todo('s', '/section Später'), todo('y', 'Steuer'), todo('t', '/section Ideen')]);
      service.addTodo('Milch', null, null, 's');
      created('n', 'Milch');
      service.addSection('Haushalt');
      created('h', '/section Haushalt');
      expect(titles()).toEqual(['/section Später', 'Steuer', 'Milch', '/section Ideen', '/section Haushalt']);
      http.match(() => true);
    });

    it('moves a todo with its steps into another section', () => {
      seed([todo('a', 'Umzug'), todo('a1', '/sub Kartons'), todo('s', '/section Später'), todo('y', 'Steuer')]);
      service.moveTodoToSection('a', 's');
      expect(titles()).toEqual(['/section Später', 'Steuer', 'Umzug', '/sub Kartons']);
      service.moveTodoToSection('a', null);
      expect(titles()).toEqual(['Umzug', '/sub Kartons', '/section Später', 'Steuer']);
      http.match(() => true);
    });

    it('takes the done todos of a section along when it is dragged', () => {
      seed([
        todo('A', '/section A'), todo('a', 'EMQX'), todo('a1', '/sub ENTC-42'), todo('a2', '/sub ENTC-59'),
        todo('B', '/section B'), todo('b', 'Steuer'), todo('d', 'Rechnung', true),
      ]);
      service.moveTo('B', 'A');
      expect(service.snapshot().map((t) => t.id)).toEqual(['B', 'b', 'd', 'A', 'a', 'a1', 'a2']);
      http.match(() => true);
    });

    it('moves only the dragged todo, a done neighbour stays in its section', () => {
      seed([todo('A', '/section A'), todo('x', 'X'), todo('d', 'Done', true), todo('y', 'Y'), todo('B', '/section B'), todo('b', 'B1')]);
      service.moveTo('y', 'b');
      expect(service.snapshot().map((t) => t.id)).toEqual(['A', 'x', 'd', 'B', 'b', 'y']);
      http.match(() => true);
    });

    it('hides empty sections where a filter sifts, keeps them under "Active"', () => {
      seed([todo('s', '/section Später'), todo('y', 'Steuer'), todo('t', '/section Leer'), todo('d', 'Alt', true)]);
      service.filter.set('completed');
      expect(order()).toEqual(['t', 'd']);
      service.filter.set('active');
      expect(order()).toEqual(['s', 'y', 't']);
      service.searchTerm.set('steuer');
      expect(order()).toEqual(['s', 'y']);
    });
  });
});

