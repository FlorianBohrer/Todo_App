import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodoFilter } from './todo-filter';
import { TodoService } from '../../services/todo';

describe('TodoFilter', () => {
  let component: TodoFilter;
  let fixture: ComponentFixture<TodoFilter>;
  let host: HTMLElement;
  let todoService: TodoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodoFilter],
    }).compileComponents();

    fixture = TestBed.createComponent(TodoFilter);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    todoService = TestBed.inject(TodoService);
    await fixture.whenStable();
  });

  const morph = () => host.querySelector<HTMLElement>('.search-morph')!;
  const input = () => host.querySelector<HTMLInputElement>('.search-morph__input')!;
  const toggle = () => host.querySelector<HTMLButtonElement>('.search-morph__toggle');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts as a magnifier and opens into a focused search bar', async () => {
    expect(morph().classList).not.toContain('is-open');
    expect(input().tabIndex).toBe(-1);

    toggle()!.click();
    await settle();

    expect(morph().classList).toContain('is-open');
    expect(document.activeElement).toBe(input());
    expect(toggle()).toBeNull();
    expect(input().tabIndex).toBe(0);
  });

  it('says in the placeholder which tab it searches', async () => {
    expect(input().placeholder).toBe('Search active todos…');
    todoService.filter.set('favorites');
    await settle();
    expect(input().placeholder).toBe('Search favorites…');
  });

  it('closes when left empty, but stays open while it filters', async () => {
    toggle()!.click();
    await settle();
    input().blur();
    await settle();
    expect(morph().classList).not.toContain('is-open');

    toggle()!.click();
    await settle();
    input().value = 'zahn';
    input().dispatchEvent(new Event('input'));
    input().blur();
    await settle();
    expect(morph().classList).toContain('is-open');
    expect(todoService.searchTerm()).toBe('zahn');
  });

  it('clears on the first Escape and closes on the second', async () => {
    toggle()!.click();
    await settle();
    input().value = 'zahn';
    input().dispatchEvent(new Event('input'));

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(todoService.searchTerm()).toBe('');
    expect(morph().classList).toContain('is-open');

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(morph().classList).not.toContain('is-open');
  });

  it('the close button clears the search and folds it back', async () => {
    todoService.searchTerm.set('zahn');
    await settle();
    expect(morph().classList).toContain('is-open');

    host.querySelector<HTMLButtonElement>('.search-morph__close')!.click();
    await settle();
    expect(todoService.searchTerm()).toBe('');
    expect(morph().classList).not.toContain('is-open');
  });

  it('opens with "/" from anywhere outside a text field', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    await settle();
    expect(morph().classList).toContain('is-open');
    expect(document.activeElement).toBe(input());
  });
});
