import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClerkService } from 'ngx-clerk';
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs';

import { environment } from '../../../environments/enviroment';

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

/** Der laufende Block in Flow, umgerechnet auf die eigene Uhr. */
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
}

/** Wie oft nachgesehen wird, ob in Flow etwas läuft — nur bei sichtbarem Tab. */
const POLL_MS = 60_000;

/**
 * Was Flow gerade tut, und wie viel Fokus schon in jedem Todo steckt.
 *
 * Flow schreibt seine Sessions ins Backend (siehe focus-session im API-Repo),
 * und der Fokus-Timer der Webseite (focus-timer.service.ts) mit denselben
 * Aufrufen ebenso. Damit sieht man hier, woran man gerade sitzt — in Flow
 * oder auf der Webseite —, und an jedem Todo, wie viel Zeit es schon
 * bekommen hat. Flow sieht umgekehrt die Sitzungen der Webseite.
 *
 * Nachgesehen wird einmal pro Minute und beim Zurückkehren in den Tab, nie in
 * einem Hintergrund-Tab. Fällt eine Anfrage aus, bleibt der alte Stand stehen:
 * das ist eine Anzeige, kein Zustand, an dem etwas hängt.
 */
@Injectable({ providedIn: 'root' })
export class FocusSessionService {
  private readonly http = inject(HttpClient);
  private readonly clerk = inject(ClerkService);
  private readonly baseUrl = `${environment.apiUrl}/focus-session`;

  readonly active = signal<ActiveFocus | null>(null);

  /** Sekunden Fokus je Todo, über alle Zeit. */
  readonly totals = signal<ReadonlyMap<string, number>>(new Map());

  /** Alle Sitzungen auf dem Server, aus Flow und von der Webseite. null = unbekannt. */
  readonly sessionCount = signal<number | null>(null);

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
  // Der Timer der Webseite verbucht Sitzungen mit Aufgabe genauso wie Flow.
  // Dann zählen sie in Flow („Today"), auf der Webseite und in der Statistik
  // gleich. Fällt eine Anfrage aus, läuft der Timer trotzdem weiter: das hier
  // ist ein Protokoll, keine Voraussetzung.

  /** Startet eine Session auf dem Server; null, wenn es nicht ging. */
  async start(todoId: string, plannedSeconds: number): Promise<string | null> {
    try {
      const session = await firstValueFrom(
        this.http.post<FocusSessionDto>(this.baseUrl, {
          todoId,
          plannedSeconds: Math.min(86400, Math.max(60, Math.round(plannedSeconds))),
        }),
      );
      void this.refresh(false);
      return session.id;
    } catch {
      return null;
    }
  }

  async pause(id: string): Promise<void> {
    await this.send(`${this.baseUrl}/${encodeURIComponent(id)}/pause`, {});
  }

  async resume(id: string): Promise<void> {
    await this.send(`${this.baseUrl}/${encodeURIComponent(id)}/resume`, {});
  }

  /** completed: durchgelaufen (true) oder abgebrochen (false). */
  async stop(id: string, completed: boolean): Promise<void> {
    await this.send(`${this.baseUrl}/${encodeURIComponent(id)}/stop`, { completed });
    await this.refresh(true);
  }

  private async send(url: string, body: unknown): Promise<void> {
    try {
      await firstValueFrom(this.http.post(url, body));
    } catch {
      /* Siehe oben: der Timer läuft auch ohne Protokoll. */
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
    } catch {
      /* Eine Anzeige. Der alte Stand bleibt stehen. */
    }
  }
}

function toActive(session: FocusSessionDto): ActiveFocus {
  return {
    id: session.id,
    todoId: session.todoId,
    title: session.todoTitle,
    paused: session.isPaused,
    endsAt: session.isRunning ? Date.now() + session.remainingSeconds * 1000 : null,
    remainingSeconds: session.remainingSeconds,
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
