import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { ToastService } from '../shared/toast.service';
import { Plan, PlanBlock } from './plan.model';

interface PlanListResponse {
  plans: Plan[];
  total: number;
}

type PlanPatch = Partial<Pick<Plan, 'title' | 'categoryId' | 'content'>>;

/** Wartezeit bis zum ersten Versuch. Lange genug, dass Tippen nicht jede
 *  Taste einzeln sendet, kurz genug, dass ein Tabwechsel nichts kostet. */
const SAVE_DELAY = 700;
/** Obergrenze der Wartezeit zwischen zwei Versuchen. */
const MAX_BACKOFF = 30_000;

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

  // ---- Speichern ----
  //
  // Geschrieben wird entprellt, und genau dazwischen lagen zwei Wege, auf
  // denen Text verloren ging:
  //
  // Erstens wurde die offene Änderung VOR dem Senden verworfen. Schlug das
  // PUT fehl, war sie nirgends mehr — und der Aufruf von loadPlans() holte
  // obendrein den alten Serverstand über den neuen lokalen. Die Meldung sagte
  // „Could not save", weg war aber der Text, nicht der Versuch.
  //
  // Zweitens gab es keinen zweiten Versuch. Ein kurzer Netzaussetzer, und der
  // Absatz war fort.
  //
  // Jetzt bleibt alles Ungesendete liegen, bis der Server es bestätigt hat,
  // ein Fehlschlag legt es zurück in die Schlange und versucht es erneut, und
  // ein Neuladen überschreibt nie das, was noch nicht draußen ist.

  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Noch nicht abgeschickte Änderungen je Plan. */
  private readonly queued = new Map<string, PlanPatch>();
  /** Gerade unterwegs — erst die Antwort entscheidet, ob es weg darf. */
  private readonly sending = new Map<string, PlanPatch>();
  /** Fehlversuche in Folge, je Plan; bestimmt die Wartezeit. */
  private readonly attempts = new Map<string, number>();

  private readonly dirtyIds = signal<ReadonlySet<string>>(new Set());
  private readonly failedIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Was der Kopf des Dokuments anzeigt.
   *
   * „saving" ist der Normalfall für einen Wimpernschlag und deshalb leise;
   * „retrying" heißt, dass etwas nicht durchging und die App dranbleibt — das
   * muss man sehen, bevor man den Rechner zuklappt.
   */
  readonly saveState = computed<'saved' | 'saving' | 'retrying'>(() => {
    const id = this.selectedId();
    if (!id) return 'saved';
    if (this.failedIds().has(id)) return 'retrying';
    return this.dirtyIds().has(id) ? 'saving' : 'saved';
  });

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

    // Beim Wegklicken sofort senden, statt die Entprellung abzuwarten. Das
    // deckt den häufigsten Fall ab — Tab wechseln, Fenster schließen — und
    // kostet nichts, wenn nichts offen ist.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });

    // Und wenn es doch nicht mehr rausging: fragen, statt es verschwinden zu
    // lassen. Der Browser zeigt seinen eigenen Text, nicht diesen.
    //
    // Gefragt wird nur, wenn wirklich etwas liegen bleibt: was nach dem flush
    // gerade unterwegs ist, bringt der Browser in aller Regel noch zu Ende.
    // Ein Dialog bei jedem Schliessen waere die Sorte Warnung, die man nach
    // dreimal wegklickt, ohne sie zu lesen.
    window.addEventListener('beforeunload', (event) => {
      if (this.queued.size === 0 && this.failedIds().size === 0) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /** Alles Offene sofort abschicken. */
  private flush() {
    for (const id of [...this.queued.keys()]) {
      const timer = this.saveTimers.get(id);
      if (timer) clearTimeout(timer);
      this.saveTimers.delete(id);
      this.savePlan(id);
    }
  }

  /** Die lokale Änderung eines Plans, die der Server noch nicht kennt. */
  private localPatch(id: string): PlanPatch {
    return { ...this.sending.get(id), ...this.queued.get(id) };
  }

  private markDirty(id: string, dirty: boolean) {
    this.dirtyIds.update((ids) => {
      const next = new Set(ids);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private markFailed(id: string, failed: boolean) {
    this.failedIds.update((ids) => {
      if (!failed && !ids.has(id)) return ids;
      const next = new Set(ids);
      if (failed) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private loadPlans() {
    this.loading.set(true);
    this.http.get<PlanListResponse>(this.apiUrl).subscribe({
      next: (res) => {
        // Was noch nicht beim Server ist, überlebt den Serverstand. Sonst
        // löscht ein Neuladen genau die Änderung, die gerade nicht durchkam.
        this.plans.set(res.plans.map((p) => ({ ...p, ...this.localPatch(p.id) })));
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

  /**
   * Einen fertigen Plan anlegen — mit Inhalt (Import).
   *
   * Zwei Schritte, weil das Anlegen serverseitig nur Titel und Folder kennt:
   * erst der leere Plan, dann der Inhalt über denselben Weg wie jede andere
   * Änderung. Damit hängt der Import an der Speicherlogik mit Wiederholung
   * statt an einem eigenen, ungetesteten Pfad.
   *
   * Fehler fliegen weiter: der Aufrufer importiert mehrere Dateien und muss
   * am Ende sagen können, wie viele davon angekommen sind.
   */
  async importPlan(title: string, categoryId: string | null, content: PlanBlock[]): Promise<Plan> {
    const created = await firstValueFrom(
      this.http.post<Plan>(this.apiUrl, { title: title.trim() || 'Untitled', categoryId }),
    );

    const plan = { ...created, content };
    this.plans.update((list) => [plan, ...list]);
    this.patchPlan(plan.id, { content });
    return plan;
  }

  /** Änderung sofort lokal anzeigen und (entprellt) speichern. */
  patchPlan(id: string, patch: PlanPatch) {
    this.plans.update((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

    this.queued.set(id, { ...this.queued.get(id), ...patch });
    this.markDirty(id, true);
    this.schedule(id, SAVE_DELAY);
  }

  private schedule(id: string, delay: number) {
    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(id, setTimeout(() => this.savePlan(id), delay));
  }

  /**
   * Schreibt die neue Reihenfolge sofort lokal und schickt sie hinterher —
   * genau wie patchPlan, damit sich das Ziehen nicht verzögert anfühlt.
   */
  reorderPlans(ids: string[]) {
    const rank = new Map(ids.map((id, i) => [id, i]));
    this.plans.update((list) =>
      [...list].sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      ),
    );

    this.http.put<void>(`${this.apiUrl}/reorder`, { ids }).subscribe({
      error: (err) => {
        console.error('Reihenfolge speichern fehlgeschlagen', err);
        this.toast.error('Could not save plan order');
        this.loadPlans();
      },
    });
  }

  private savePlan(id: string) {
    this.saveTimers.delete(id);

    const patch = this.queued.get(id);
    // Nichts offen, oder es ist schon eins unterwegs: die Antwort schickt den
    // Rest hinterher. Zwei parallele PUTs auf denselben Plan wären ein Rennen.
    if (!patch || this.sending.has(id)) return;

    this.queued.delete(id);
    this.sending.set(id, patch);

    this.http.put<Plan>(`${this.apiUrl}/${id}`, patch).subscribe({
      next: () => {
        this.sending.delete(id);
        this.attempts.delete(id);
        this.markFailed(id, false);

        // Während der Antwort kann weitergetippt worden sein.
        if (this.queued.has(id)) this.schedule(id, 0);
        else this.markDirty(id, false);
      },
      error: (err) => {
        console.error('Plan speichern fehlgeschlagen', err);
        this.sending.delete(id);

        // Zurück in die Schlange, aber UNTER das Neuere: was seither getippt
        // wurde, ist der aktuellere Stand derselben Felder.
        this.queued.set(id, { ...patch, ...this.queued.get(id) });

        const tries = (this.attempts.get(id) ?? 0) + 1;
        this.attempts.set(id, tries);
        this.markFailed(id, true);

        // Einmal sagen, nicht bei jedem Versuch — sonst ist der Bildschirm
        // voller Meldungen, während die App das Problem selbst löst.
        if (tries === 1) this.toast.error('Could not save — keeping your changes and retrying');

        this.schedule(id, Math.min(MAX_BACKOFF, 1000 * 2 ** (tries - 1)));
      },
    });
  }

  deletePlan(id: string) {
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    this.queued.delete(id);
    this.sending.delete(id);
    this.attempts.delete(id);
    this.markDirty(id, false);
    this.markFailed(id, false);

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
