import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ChevronLeft, ChevronRight, Download, Flame, RefreshCw, LucideAngularModule } from 'lucide-angular';

import { TodoService } from '../../services/todo';
import { FocusDayTotal, FocusSessionRecord, FocusSessionService } from '../../services/focus-session.service';
import {
  Span,
  bestStreak,
  blocksByDay,
  capped,
  doneByDay,
  doneByTimeOfDay,
  focusPerTodo,
  formatMinutes,
  periodDays,
  toCSV,
} from '../../shared/focus-stats';
import { completionStreak } from '../../shared/streak';
import { fromISODate, todayISO } from '../../shared/week';
import { stripPriorityPrefix } from '../../shared/title-priority';
import { splitLeadingEmoji, taskIcon } from '../../shared/task-icon';

/** Wie weit die Statistik zurückreicht: so viel liefert der Server je Tag. */
const SERVER_DAYS = 90;

interface DayBar {
  iso: string;
  label: string;
  name: string;
  minutes: number;
  done: number;
  future: boolean;
  isToday: boolean;
}

/**
 * Die Statistik: Woche oder Monat, gebaut wie die in Flow — die Summe, der
 * Schnitt je Arbeitstag, ein Balken je Tag mit dem Schnitt als Linie, und
 * die Tage mit ihren Zeitblöcken. Dazu, was die Todo-App weiss und Flow
 * nicht: erledigte Aufgaben, die Reihe in Folge, wann am Tag man etwas
 * schafft.
 *
 * Die Fokuszeit kommt vom Server, auf den Flow und der Timer der Webseite
 * dieselben Sitzungen schreiben. Beide Apps zeigen deshalb dieselben Zahlen.
 */
@Component({
  selector: 'app-stats-view',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-view.html',
  styleUrl: './stats-view.scss',
})
export class StatsView {
  private readonly todoService = inject(TodoService);
  private readonly sessions = inject(FocusSessionService);

  protected readonly span = signal<Span>('week');
  protected readonly offset = signal(0);
  protected readonly selected = signal<string | null>(null);

  // ---- Daten vom Server ----

  private readonly perDay = signal<ReadonlyMap<string, FocusDayTotal>>(new Map());
  private readonly recent = signal<readonly FocusSessionRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly offline = signal(false);

  constructor() {
    void this.load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.load();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  async load(): Promise<void> {
    const [days, recent] = await Promise.all([this.sessions.loadDays(SERVER_DAYS), this.sessions.loadRecent(200)]);
    this.offline.set(days === null);
    if (days) this.perDay.set(new Map(days.map((d) => [d.date, d])));
    if (recent) this.recent.set(recent);
    this.loading.set(false);
  }

  // ---- Zeitraum ----

  setSpan(span: Span): void {
    this.span.set(span);
    this.offset.set(0);
    this.selected.set(null);
  }

  shift(by: number): void {
    this.offset.update((o) => Math.min(0, o + by));
    this.selected.set(null);
  }

  /** Weiter zurück liefert der Server keine Tageswerte. */
  protected readonly canGoBack = computed(() => {
    const first = periodDays(this.span(), this.offset() - 1)[0];
    const limit = new Date();
    limit.setDate(limit.getDate() - SERVER_DAYS);
    return fromISODate(first) >= new Date(limit.getFullYear(), limit.getMonth(), 1);
  });

  protected readonly title = computed(() => {
    const days = periodDays(this.span(), this.offset());
    const first = fromISODate(days[0]);
    const last = fromISODate(days[days.length - 1]);
    if (this.span() === 'month') return first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (this.offset() === 0) return 'This week';
    if (this.offset() === -1) return 'Last week';
    // „Oct 12 – 18", über den Monatswechsel „Sep 28 – Oct 4".
    const sameMonth = first.getMonth() === last.getMonth();
    const from = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const to = sameMonth ? String(last.getDate()) : last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${from} – ${to}`;
  });

  // ---- Zahlen ----

  private readonly todos = computed(() => this.todoService.withArchive());
  private readonly done = computed(() => doneByDay(this.todos()));

  protected readonly days = computed<DayBar[]>(() => {
    const today = todayISO();
    const span = this.span();
    return periodDays(span, this.offset()).map((iso, index) => {
      const date = fromISODate(iso);
      return {
        iso,
        label: span === 'week' ? date.toLocaleDateString('en-US', { weekday: 'narrow' }) : index % 7 === 0 ? String(date.getDate()) : '',
        name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        minutes: capped((this.perDay().get(iso)?.totalSeconds ?? 0) / 60),
        done: this.done().get(iso) ?? 0,
        future: iso > today,
        isToday: iso === today,
      };
    });
  });

  protected readonly total = computed(() => this.days().reduce((sum, d) => sum + d.minutes, 0));
  protected readonly worked = computed(() => this.days().filter((d) => d.minutes > 0));
  protected readonly average = computed(() =>
    this.worked().length === 0 ? 0 : Math.round(this.total() / this.worked().length),
  );
  protected readonly sessionsInPeriod = computed(() =>
    this.days().reduce((sum, d) => sum + (this.perDay().get(d.iso)?.sessionCount ?? 0), 0),
  );
  protected readonly doneInPeriod = computed(() => this.days().reduce((sum, d) => sum + d.done, 0));

  /** Gegen den Zeitraum davor — nur für abgeschlossene: eine halbe Woche gegen eine ganze sagt nichts. */
  protected readonly trend = computed(() => {
    if (this.offset() === 0 || this.total() === 0) return null;
    const previous = periodDays(this.span(), this.offset() - 1).reduce(
      (sum, iso) => sum + capped((this.perDay().get(iso)?.totalSeconds ?? 0) / 60),
      0,
    );
    if (previous === 0) return null;
    const change = Math.round(((this.total() - previous) / previous) * 100);
    return { change, label: `${change > 0 ? '+' : ''}${change}% vs the ${this.span()} before` };
  });

  protected readonly headline = computed(() => {
    const day = this.days().find((d) => d.iso === this.selected());
    if (day) return { label: day.name, minutes: day.minutes };
    const label = this.span() === 'week'
      ? this.offset() === 0 ? 'Focus this week' : 'Focus that week'
      : `Focus in ${fromISODate(this.days()[0].iso).toLocaleDateString('en-US', { month: 'long' })}`;
    return { label, minutes: this.total() };
  });

  protected readonly streak = computed(() => completionStreak(this.todos()));
  protected readonly bestInPeriod = computed(() => {
    const inRange = new Map([...this.done()].filter(([iso]) => this.days().some((d) => d.iso === iso)));
    return bestStreak(inRange);
  });

  // ---- Balken ----

  /** Volle Stunden, mindestens vier — damit kleine Tage nicht riesig wirken (wie Flow). */
  protected readonly scaleHours = computed(() =>
    Math.max(4, Math.ceil(Math.max(0, ...this.days().map((d) => d.minutes)) / 60)),
  );
  protected readonly hourTicks = computed(() => {
    const max = this.scaleHours();
    const step = max <= 4 ? 1 : max <= 8 ? 2 : 4;
    const ticks: number[] = [];
    for (let h = 0; h <= max; h += step) ticks.push(h);
    return ticks;
  });

  protected focusHeight(minutes: number): string {
    return `${(minutes / (this.scaleHours() * 60)) * 100}%`;
  }

  protected readonly doneScale = computed(() => Math.max(4, ...this.days().map((d) => d.done)));
  protected doneHeight(count: number): string {
    return `${(count / this.doneScale()) * 100}%`;
  }

  /** Der Balken unter dem Zeiger oder Fokus — für die Einblendung. */
  protected readonly hover = signal<{ chart: 'focus' | 'done'; iso: string } | null>(null);
  protected readonly hoverDay = computed(() => {
    const h = this.hover();
    return h ? this.days().find((d) => d.iso === h.iso) ?? null : null;
  });

  toggleDay(iso: string): void {
    this.selected.update((s) => (s === iso ? null : iso));
  }

  // ---- Tageszeit, Aufgaben, Tage ----

  protected readonly timeShare = computed(() => {
    const share = doneByTimeOfDay(this.todos(), this.days().map((d) => d.iso));
    const total = share.morning + share.afternoon + share.evening;
    const parts = [
      { key: 'morning', label: 'Morning', count: share.morning },
      { key: 'afternoon', label: 'Afternoon', count: share.afternoon },
      { key: 'evening', label: 'Evening', count: share.evening },
    ].map((p) => ({ ...p, share: total === 0 ? 0 : Math.round((p.count / total) * 100) }));
    return { total, parts };
  });

  protected readonly topTodos = computed(() => {
    const list = focusPerTodo(this.recent(), this.days().map((d) => d.iso)).slice(0, 5);
    const max = Math.max(1, ...list.map((t) => t.minutes));
    return list.map((t) => {
      const text = stripPriorityPrefix(t.title).split('\n')[0].trim();
      return {
        ...t,
        title: splitLeadingEmoji(text).rest || text,
        icon: taskIcon(text),
        share: `${(t.minutes / max) * 100}%`,
        time: formatMinutes(t.minutes),
      };
    });
  });

  private readonly blocks = computed(() => blocksByDay(this.recent()));

  /** Die Tage mit Fokus oder Erledigtem, der neueste zuerst — zugleich die Tabelle hinter den Balken. */
  protected readonly dayList = computed(() =>
    this.days()
      .filter((d) => d.minutes > 0 || d.done > 0)
      .reverse()
      .map((d) => {
        const blocks = this.blocks().get(d.iso) ?? [];
        return {
          ...d,
          blocksText: blocks.length > 0 ? blocks.map((b) => `${b.start}–${b.end}`).join(' · ') : '',
          time: formatMinutes(d.minutes),
        };
      }),
  );

  protected readonly formatMinutes = formatMinutes;

  // ---- Export ----

  /** Der gezeigte Zeitraum als Stundenliste — dieselbe Datei wie aus Flow. */
  exportCSV(): void {
    const days = this.days().map((d) => ({ date: d.iso, blocks: this.blocks().get(d.iso) ?? [], minutes: d.minutes }));
    const first = days[0]?.date ?? todayISO();
    const name = this.span() === 'month' ? `Focus ${first.slice(0, 7)}.csv` : `Focus week of ${first}.csv`;
    const url = URL.createObjectURL(new Blob(['﻿', toCSV(days)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly DownloadIcon = Download;
  protected readonly FlameIcon = Flame;
  protected readonly RefreshIcon = RefreshCw;
}
