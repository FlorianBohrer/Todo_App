import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClerkService } from 'ngx-clerk';
import { of } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { PlanService } from './plan.service';
import { ToastService } from '../shared/toast.service';
import type { Plan } from './plan.model';

/**
 * Die Wege, auf denen Text verloren ging.
 *
 * Alle vier Fälle hier sind derselbe Fehler aus verschiedenen Richtungen: der
 * Server wurde geglaubt, bevor er geantwortet hatte. Sie stehen deshalb
 * zusammen — wer einen davon bricht, bricht sehr wahrscheinlich alle.
 */
const url = `${environment.apiUrl}/plan`;

function plan(id: string, title = 'Plan'): Plan {
  return {
    id,
    title,
    categoryId: null,
    content: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('PlanService saving', () => {
  let service: PlanService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Ohne angemeldeten Nutzer laedt der Dienst nichts von selbst — die
        // Tests bestimmen den Ausgangsstand.
        { provide: ClerkService, useValue: { user$: of(null) } },
      ],
    });
    service = TestBed.inject(PlanService);
    http = TestBed.inject(HttpTestingController);
    service.plans.set([plan('p1')]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const textOf = (id: string) => service.plans().find((p) => p.id === id)?.title;

  it('keeps the change when the server refuses it', () => {
    service.patchPlan('p1', { title: 'Neu' });
    vi.advanceTimersByTime(700);

    http.expectOne(`${url}/p1`).error(new ProgressEvent('offline'));

    // Vorher war die Aenderung an dieser Stelle weg: sie wurde vor dem Senden
    // aus der Schlange genommen, und loadPlans holte den alten Stand.
    expect(textOf('p1')).toBe('Neu');
    http.expectNone(url); // kein Neuladen, das den Text ueberschreibt
  });

  it('tries again, and stops once it worked', () => {
    service.patchPlan('p1', { title: 'Neu' });
    vi.advanceTimersByTime(700);
    http.expectOne(`${url}/p1`).error(new ProgressEvent('offline'));

    vi.advanceTimersByTime(1000); // erster Backoff
    const retry = http.expectOne(`${url}/p1`);
    expect(retry.request.body).toEqual({ title: 'Neu' });
    retry.flush(plan('p1', 'Neu'));

    vi.advanceTimersByTime(60_000);
    http.expectNone(`${url}/p1`);
  });

  it('loses nothing that was typed while a save was in flight', () => {
    service.patchPlan('p1', { title: 'Eins' });
    vi.advanceTimersByTime(700);
    const first = http.expectOne(`${url}/p1`);

    // Waehrend der Antwort weitergetippt.
    service.patchPlan('p1', { title: 'Zwei' });
    first.flush(plan('p1', 'Eins'));

    vi.advanceTimersByTime(700);
    const second = http.expectOne(`${url}/p1`);
    expect(second.request.body).toEqual({ title: 'Zwei' });
  });

  it('never sends two requests for the same plan at once', () => {
    service.patchPlan('p1', { title: 'Eins' });
    vi.advanceTimersByTime(700);
    http.expectOne(`${url}/p1`);

    service.patchPlan('p1', { title: 'Zwei' });
    vi.advanceTimersByTime(700);

    // Das zweite wartet auf die Antwort des ersten — sonst entschiede die
    // Reihenfolge der Antworten, was gespeichert ist.
    http.expectNone(`${url}/p1`);
  });

  it('reports the state so the header can show it', () => {
    service.selectedId.set('p1');
    expect(service.saveState()).toBe('saved');

    service.patchPlan('p1', { title: 'Neu' });
    expect(service.saveState()).toBe('saving');

    vi.advanceTimersByTime(700);
    http.expectOne(`${url}/p1`).error(new ProgressEvent('offline'));
    expect(service.saveState()).toBe('retrying');

    vi.advanceTimersByTime(1000);
    http.expectOne(`${url}/p1`).flush(plan('p1', 'Neu'));
    expect(service.saveState()).toBe('saved');
  });
});

describe('PlanService deleting', () => {
  let service: PlanService;
  let http: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClerkService, useValue: { user$: of(null) } },
      ],
    });
    service = TestBed.inject(PlanService);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    service.plans.set([plan('p1', 'Eins'), plan('p2', 'Zwei'), plan('p3', 'Drei')]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ids = () => service.plans().map((p) => p.id);

  it('takes the plan out at once, but tells the server only after the undo window', () => {
    service.select('p2');
    service.deletePlan('p2');

    expect(ids()).toEqual(['p1', 'p3']);
    expect(service.selectedId()).toBeNull();
    http.expectNone(`${url}/p2`);

    vi.advanceTimersByTime(5000);
    expect(http.expectOne(`${url}/p2`).request.method).toBe('DELETE');
    expect(toast.toasts()).toEqual([]);
  });

  it('brings the plan back to its old place on undo, and never deletes it', () => {
    service.deletePlan('p2');
    const undo = toast.toasts().find((t) => t.actionLabel === 'Undo');
    expect(undo?.message).toContain('Zwei');

    toast.runAction(undo!);

    expect(ids()).toEqual(['p1', 'p2', 'p3']);
    vi.advanceTimersByTime(60_000);
    http.expectNone(`${url}/p2`);
  });

  it('keeps sending an edit that was still waiting when the plan was deleted', () => {
    service.patchPlan('p2', { title: 'Zwei, neu' });
    service.deletePlan('p2');

    vi.advanceTimersByTime(700);
    http.expectOne((r) => r.method === 'PUT' && r.url === `${url}/p2`).flush(plan('p2', 'Zwei, neu'));

    toast.runAction(toast.toasts()[0]);
    expect(service.plans().find((p) => p.id === 'p2')?.title).toBe('Zwei, neu');
  });
});
