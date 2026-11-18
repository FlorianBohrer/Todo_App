import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { Observable, distinctUntilChanged, firstValueFrom, map } from 'rxjs';

import { environment } from '../../../environments/enviroment';
import { ToastService } from '../../shared/toast.service';
import { OPEN_ENDED_SECONDS } from '../shared/tracking';

/** So liefert das Backend einen Fokus-Block (focus-session-response.dto). */
interface FocusSessionDto {
  id: string;
  todoId: string | null;
  todoTitle: string;
  plannedSeconds: number;
  startedAt: string;
  endedAt: string | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
}

/** Ein abgeschlossener oder laufender Block, für die Statistik. */
export interface FocusSessionRecord {
  id: string;
  todoId: string | null;
  todoTitle: string;
  startedAt: Date;
  endedAt: Date | null;
  elapsedSeconds: number;
  /** Die geplante Länge — so viel zählt Flow für eine durchgelaufene Sitzung. */
  plannedSeconds: number;
  completed: boolean;
}

/** Fokuszeit je Tag (focus-stats-response.dto). */
export interface FocusDayTotal {
  date: string;
  totalSeconds: number;
  sessionCount: number;
}

interface ActiveFocusSessionDto {
  session: FocusSessionDto | null;
}

interface FocusStatsDto {
  todaySeconds?: number;
  todaySessions?: number;
  perDay?: FocusDayTotal[];
  perTodo: { todoId: string; totalSeconds: number; sessionCount?: number }[];
}

export { OPEN_ENDED_SECONDS } from '../shared/tracking';

/** Was gerade erfasst wird, umgerechnet auf die eigene Uhr. */
export interface ActiveFocus {
  /** Die Session auf dem Server — der eigene Timer erkennt daran seine. */
  id: string;
  todoId: string | null;
  title: string;
  paused: boolean;
  /** Wann der Block endet, in Date.now()-Zeit. Bei Pause: null. */
  endsAt: number | null;
  /** Die Restzeit beim Pausieren — dann steht die Uhr. */
  remainingSeconds: number;
  /** Reine Laufzeit bis zum Abruf, ohne Pausen. */
  elapsedSeconds: number;
  /**
   * Ab wann die Laufzeit rechnerisch zählt, in Date.now()-Zeit: der Abruf
   * minus der bisherigen Laufzeit. Bei Pause: null, dann steht die Uhr.
   */
  runningFrom: number | null;
  /** Offene Zeiterfassung von der Webseite (kein Flow-Block mit Länge). */
  tracked: boolean;
  /** Wann angefangen wurde, in Date.now()-Zeit. */
  startedAt: number;
}

/** Wie lange schon an der Aufgabe gearbeitet wird, in Sekunden — ohne Pausen. */
export function elapsedNow(active: ActiveFocus, now: number = Date.now()): number {
  if (active.runningFrom === null) return active.elapsedSeconds;
  return Math.max(active.elapsedSeconds, Math.floor((now - active.runningFrom) / 1000));
}

/** 610 → „10:10", 3730 → „1:02:10" — wie eine Stoppuhr. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** Wie oft nachgesehen wird, ob in Flow etwas läuft — nur bei sichtbarem Tab. */
const POLL_MS = 60_000;

/**
 * Was Flow gerade tut, und wie viel Fokus schon in jedem Todo steckt.
 *
 * Flow schreibt seine Sessions ins Backend (siehe focus-session im API-Repo).
 * Einen eigenen Timer hat die Webseite nicht mehr: gemessen wird allein in
 * Flow. Hier sieht man, woran man dort gerade sitzt, und an jedem Todo, wie
 * viel Zeit es schon bekommen hat.
 *
 * Nachgesehen wird einmal pro Minute und beim Zurückkehren in den Tab, nie in
 * einem Hintergrund-Tab. Fällt eine Anfrage aus, bleibt der alte Stand stehen:
 * das ist eine Anzeige, kein Zustand, an dem etwas hängt.
 */
@Injectable({ providedIn: 'root' })
export class FocusSessionService {
  private readonly http = inject(HttpClient);
  private readonly clerk = inject(ClerkService);
  private readonly toast = inject(ToastService);
  private readonly baseUrl = `${environment.apiUrl}/focus-session`;

  readonly active = signal<ActiveFocus | null>(null);

  /** Ein Aufruf zum Starten, Pausieren oder Stoppen läuft gerade. */
  readonly busy = signal(false);

  /** Sekunden Fokus je Todo, über alle Zeit. */
  readonly totals = signal<ReadonlyMap<string, number>>(new Map());

  /** Alle Sitzungen auf dem Server, aus Flow. null = unbekannt. */
  readonly sessionCount = signal<number | null>(null);

  /** Fokus heute aus Flow, in der eigenen Zeitzone. null = unbekannt. */
  readonly today = signal<{ seconds: number; sessions: number } | null>(null);

  private signedIn = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.clerk.user$
      .pipe(
        map((user) => user?.id ?? null),
        distinctUntilChanged(),
      )
      .subscribe((userId) => {
        this.signedIn = userId !== null;
        if (this.signedIn) {
          void this.refresh(true);
          this.startPolling();
        } else {
          this.stopPolling();
          this.active.set(null);
          this.totals.set(new Map());
          this.sessionCount.set(null);
          this.today.set(null);
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.signedIn) void this.refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      this.stopPolling();
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private startPolling() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh(false);
    }, POLL_MS);
  }

  private stopPolling() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Den laufenden Block holen — und die Summen, wenn sich etwas getan haben
   * kann: beim Laden, beim Zurückkehren, und wenn ein Block eben zu Ende ging.
   */
  async refresh(withTotals: boolean): Promise<void> {
    const before = this.active();

    try {
      const { session } = await firstValueFrom(
        this.http.get<ActiveFocusSessionDto>(`${this.baseUrl}/active`),
      );
      this.active.set(session && session.endedAt === null ? toActive(session) : null);
    } catch {
      return;
    }

    const ended = before !== null && this.active() === null;
    if (withTotals || ended) await this.loadTotals();
  }

  // ---- Schreiben: dieselben Aufrufe wie Flow (src/todo-link/api.ts) ----
  //
  // Die Webseite erfasst Zeit offen: starten, und die Uhr läuft, bis man
  // stoppt (OPEN_ENDED_SECONDS). Es gibt immer nur eine laufende Sitzung —
  // startet man eine neue, beendet das Backend die alte, auch einen Block in
  // Flow. Die Antwort des Servers ist der neue Stand, kein Raten.

  /** Zeit auf diese Aufgabe erfassen, ab jetzt. */
  async track(todoId: string): Promise<boolean> {
    return this.write(
      this.http.post<FocusSessionDto>(this.baseUrl, { todoId, plannedSeconds: OPEN_ENDED_SECONDS }),
      'Could not start tracking',
    );
  }

  async pause(): Promise<boolean> {
    const active = this.active();
    if (!active || active.paused) return false;
    return this.write(
      this.http.post<FocusSessionDto>(`${this.baseUrl}/${encodeURIComponent(active.id)}/pause`, {}),
      'Could not pause',
    );
  }

  async resume(): Promise<boolean> {
    const active = this.active();
    if (!active || !active.paused) return false;
    return this.write(
      this.http.post<FocusSessionDto>(`${this.baseUrl}/${encodeURIComponent(active.id)}/resume`, {}),
      'Could not resume',
    );
  }

  /**
   * Erfassung beenden. Die Laufzeit zählt so, wie sie ist; „durchgelaufen"
   * gibt es bei offener Erfassung nicht (focus-stats.ts zählt sie trotzdem).
   */
  async stop(): Promise<boolean> {
    const active = this.active();
    if (!active) return false;
    return this.write(
      this.http.post<FocusSessionDto>(`${this.baseUrl}/${encodeURIComponent(active.id)}/stop`, { completed: false }),
      'Could not stop tracking',
    );
  }

  private async write(request: Observable<FocusSessionDto>, failure: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const session = await firstValueFrom(request);
      this.active.set(session.endedAt === null ? toActive(session) : null);
      void this.loadTotals();
      return true;
    } catch (error) {
      // Status statt Servertext, wie überall.
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.toast.error(status > 0 ? `${failure} (${status})` : failure);
      void this.refresh(true);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Lesen für die Statistik ----

  /** Fokus je Tag der letzten `days` Tage (höchstens 90), in der eigenen Zeitzone. */
  async loadDays(days: number): Promise<FocusDayTotal[] | null> {
    try {
      const offset = -new Date().getTimezoneOffset();
      const stats = await firstValueFrom(
        this.http.get<FocusStatsDto>(`${this.baseUrl}/stats?days=${Math.min(90, Math.max(1, days))}&tzOffsetMinutes=${offset}`),
      );
      return stats.perDay ?? [];
    } catch {
      return null;
    }
  }

  /** Die letzten Sitzungen (höchstens 200), für Zeitblöcke und Aufgaben. */
  async loadRecent(limit = 200): Promise<FocusSessionRecord[] | null> {
    try {
      const sessions = await firstValueFrom(
        this.http.get<(FocusSessionDto & { completed?: boolean })[]>(`${this.baseUrl}?limit=${limit}`),
      );
      return sessions.map((s) => ({
        id: s.id,
        todoId: s.todoId,
        todoTitle: s.todoTitle,
        startedAt: new Date(s.startedAt),
        endedAt: s.endedAt ? new Date(s.endedAt) : null,
        elapsedSeconds: s.elapsedSeconds,
        plannedSeconds: s.plannedSeconds,
        completed: s.completed ?? false,
      }));
    } catch {
      return null;
    }
  }

  private async loadTotals(): Promise<void> {
    try {
      // days steuert nur die Tagesaufstellung; perTodo zählt über alle Zeit.
      const offset = -new Date().getTimezoneOffset();
      const stats = await firstValueFrom(
        this.http.get<FocusStatsDto>(`${this.baseUrl}/stats?days=1&tzOffsetMinutes=${offset}`),
      );
      this.totals.set(new Map(stats.perTodo.map((entry) => [entry.todoId, entry.totalSeconds])));
      this.sessionCount.set(stats.perTodo.reduce((sum, entry) => sum + (entry.sessionCount ?? 0), 0));
      this.today.set({ seconds: stats.todaySeconds ?? 0, sessions: stats.todaySessions ?? 0 });
    } catch {
      /* Eine Anzeige. Der alte Stand bleibt stehen. */
    }
  }
}

function toActive(session: FocusSessionDto): ActiveFocus {
  const now = Date.now();
  // Ältere Antworten ohne Laufzeit: aus geplanter Länge und Rest zurückrechnen.
  const elapsed = session.elapsedSeconds ?? Math.max(0, session.plannedSeconds - session.remainingSeconds);
  return {
    id: session.id,
    todoId: session.todoId,
    title: session.todoTitle,
    paused: session.isPaused,
    endsAt: session.isRunning ? now + session.remainingSeconds * 1000 : null,
    remainingSeconds: session.remainingSeconds,
    elapsedSeconds: elapsed,
    runningFrom: session.isRunning ? now - elapsed * 1000 : null,
    tracked: session.plannedSeconds >= OPEN_ENDED_SECONDS,
    startedAt: Number.isFinite(Date.parse(session.startedAt)) ? Date.parse(session.startedAt) : now - elapsed * 1000,
  };
}

/** 25 → „25m", 80 → „1h 20m", 120 → „2h". Knapp, weil es in einer Zeile steht. */
export function formatFocus(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
