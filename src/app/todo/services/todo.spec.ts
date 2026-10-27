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
});
