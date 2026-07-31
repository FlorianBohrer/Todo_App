import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, map } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { ToastService } from '../shared/toast.service';
import { Plan } from './plan.model';

interface PlanListResponse {
  plans: Plan[];
  total: number;
}

type PlanPatch = Partial<Pick<Plan, 'title' | 'categoryId' | 'content'>>;

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);
  private readonly clerk = inject(ClerkService);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = `${environment.apiUrl}/plan`;

  readonly plans = signal<Plan[]>([]);
  readonly loading = signal(false);
  /** Aktuell geöffneter Plan (Editor) — null = Übersichtsliste. */
  readonly selectedId = signal<string | null>(null);

  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Noch nicht gesendete Änderungen je Plan — sonst überschreibt ein
   *  schnell folgender Patch den vorherigen, bevor dieser rausging. */
  private readonly pendingPatches = new Map<string, PlanPatch>();

  constructor() {
    this.clerk.user$
      .pipe(map((u) => u?.id ?? null), distinctUntilChanged())
      .subscribe((userId) => {
        if (userId) {
          this.loadPlans();
        } else {
          this.plans.set([]);
          this.selectedId.set(null);
        }
      });
  }

  private loadPlans() {
    this.loading.set(true);
    this.http.get<PlanListResponse>(this.apiUrl).subscribe({
      next: (res) => {
        this.plans.set(res.plans);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Pläne laden fehlgeschlagen', err);
        this.loading.set(false);
        this.toast.error('Could not load plans');
      },
    });
  }

  createPlan(title: string, categoryId: string | null = null) {
    const t = title.trim();
    if (!t) return;
    this.http
      .post<Plan>(this.apiUrl, { title: t, categoryId })
      .subscribe({
        next: (plan) => {
          this.plans.update((list) => [plan, ...list]);
          this.selectedId.set(plan.id); // direkt öffnen
        },
        error: (err) => {
          console.error('Plan anlegen fehlgeschlagen', err);
          this.toast.error('Could not create plan');
        },
      });
  }

  /** Änderung sofort lokal anzeigen und (entprellt) speichern. */
  patchPlan(id: string, patch: PlanPatch) {
    this.plans.update((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

    this.pendingPatches.set(id, { ...this.pendingPatches.get(id), ...patch });

    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(id, setTimeout(() => this.savePlan(id), 700));
  }

  private savePlan(id: string) {
    this.saveTimers.delete(id);
    const patch = this.pendingPatches.get(id);
    if (!patch) return;
    this.pendingPatches.delete(id);

    this.http.put<Plan>(`${this.apiUrl}/${id}`, patch).subscribe({
      error: (err) => {
        console.error('Plan speichern fehlgeschlagen', err);
        this.toast.error('Could not save plan');
        this.loadPlans();
      },
    });
  }

  deletePlan(id: string) {
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    this.pendingPatches.delete(id);

    this.plans.update((list) => list.filter((p) => p.id !== id));
    if (this.selectedId() === id) this.selectedId.set(null);
    this.http.delete<void>(`${this.apiUrl}/${id}`).subscribe({
      error: (err) => {
        console.error('Plan löschen fehlgeschlagen', err);
        this.toast.error('Could not delete plan');
        this.loadPlans();
      },
    });
  }

  select(id: string | null) { this.selectedId.set(id); }
}
