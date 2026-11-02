import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Flame,
  Moon,
  Sun,
  Sunrise,
  Timer,
  Trophy,
  LucideAngularModule,
} from 'lucide-angular';

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
  heatLevel,
  heatmapWeeks,
  paceChange,
  periodDays,
  timelineSpans,
  toCSV,
} from '../../shared/focus-stats';
import { completionStreak } from '../../shared/streak';
import { fromISODate, shiftISODate, todayISO } from '../../shared/week';
import { stripPriorityPrefix } from '../../shared/title-priority';
import { splitLeadingEmoji, taskIcon } from '../../shared/task-icon';
import { TaskGlyph } from '../../shared/task-glyph';
import { stripBold } from '../../shared/rich-title';

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
  imports: [LucideAngularModule, TaskGlyph],
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

  /**
   * Gegen den Zeitraum davor. Beim laufenden nur bis heute und gegen
   * dieselben Tage davor — Mittwoch gegen Mittwoch, nicht eine halbe Woche
   * gegen eine ganze.
   */
  protected readonly trend = computed(() => {
    const days = this.days();
    const minutesOf = (iso: string) => capped((this.perDay().get(iso)?.totalSeconds ?? 0) / 60);
    const previous = periodDays(this.span(), this.offset() - 1).map(minutesOf);
    const today = days.findIndex((d) => d.isToday);
    const upto = this.offset() === 0 && today >= 0 ? today : days.length - 1;
    const change = paceChange(days.map((d) => d.minutes), previous, upto);
    if (change === null) return null;
    const what = this.offset() === 0 ? `the same days last ${this.span()}` : `the ${this.span()} before`;
    return { change, up: change >= 0, label: `${change > 0 ? '+' : ''}${change}%`, title: `${change > 0 ? '+' : ''}${change}% vs ${what}` };
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

  /** Die letzten sieben Tage bis heute: an welchen etwas erledigt wurde. */
  protected readonly streakDots = computed(() => {
    const today = todayISO();
    return Array.from({ length: 7 }, (_, i) => {
      const iso = shiftISODate(today, i - 6);
      return { iso, lit: (this.done().get(iso) ?? 0) > 0, letter: fromISODate(iso).toLocaleDateString('en-US', { weekday: 'narrow' }) };
    });
  });

  /** Der Tag mit dem meisten Fokus im Zeitraum. */
  protected readonly bestDay = computed(() => {
    const best = this.days().reduce<DayBar | null>((top, d) => (d.minutes > (top?.minutes ?? 0) ? d : top), null);
    return best ? { iso: best.iso, minutes: best.minutes, name: fromISODate(best.iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) } : null;
  });

  /** Wie lang eine Sitzung im Schnitt war. */
  protected readonly avgSession = computed(() => {
    const sessions = this.sessionsInPeriod();
    return sessions > 0 ? Math.round(this.total() / sessions) : 0;
  });

  /** Der Tag mit den meisten erledigten Aufgaben. */
  protected readonly bestDoneDay = computed(() => {
    const best = this.days().reduce<DayBar | null>((top, d) => (d.done > (top?.done ?? 0) ? d : top), null);
    return best ? { label: fromISODate(best.iso).toLocaleDateString('en-US', { weekday: 'short' }), done: best.done } : null;
  });

  // ---- Heatmap: die letzten 13 Wochen ----

  protected readonly heat = computed(() => {
    const today = todayISO();
    const weeks = heatmapWeeks(13, today).map((week) => ({
      month: week.month ? fromISODate(`${week.month}-01`).toLocaleDateString('en-US', { month: 'short' }) : '',
      days: week.days.map((iso) => {
        const minutes = capped((this.perDay().get(iso)?.totalSeconds ?? 0) / 60);
        const future = iso > today;
        const name = fromISODate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return { iso, future, minutes, level: future ? -1 : heatLevel(minutes), title: future ? name : `${name}: ${formatMinutes(minutes)}` };
      }),
    }));
    const past = weeks.flatMap((w) => w.days).filter((d) => !d.future);
    const active = past.filter((d) => d.level > 0).length;
    const minutes = past.reduce((sum, d) => sum + d.minutes, 0);
    // Die längste Reihe von Tagen in Folge mit Fokus.
    let run = 0;
    let longest = 0;
    for (const d of past) {
      run = d.level > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return { weeks, active, total: past.length, minutes, longest, perActive: active > 0 ? Math.round(minutes / active) : 0 };
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
      { key: 'morning', label: 'Morning', hint: 'before 12', icon: Sunrise, count: share.morning },
      { key: 'afternoon', label: 'Afternoon', hint: '12 to 17', icon: Sun, count: share.afternoon },
      { key: 'evening', label: 'Evening', hint: 'after 17', icon: Moon, count: share.evening },
    ].map((p) => ({ ...p, share: total === 0 ? 0 : Math.round((p.count / total) * 100) }));
    return { total, parts };
  });

  protected readonly topTodos = computed(() => {
    const list = focusPerTodo(this.recent(), this.days().map((d) => d.iso)).slice(0, 5);
    const max = Math.max(1, ...list.map((t) => t.minutes));
    return list.map((t) => {
      const text = stripBold(stripPriorityPrefix(t.title).split('\n')[0].trim());
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

  /**
   * Die Tage mit Fokus oder Erledigtem, der neueste zuerst — zugleich die
   * Tabelle hinter den Balken. Jeder Tag bekommt eine Zeitleiste; alle auf
   * derselben Achse (ab 6 Uhr, oder früher, wenn ein Block früher begann),
   * damit man die Tage untereinander vergleichen kann.
   */
  protected readonly dayList = computed(() => {
    const rows = this.days()
      .filter((d) => d.minutes > 0 || d.done > 0)
      .reverse()
      .map((d) => ({ day: d, blocks: this.blocks().get(d.iso) ?? [] }));
    const from = Math.min(6 * 60, ...rows.map((r) => timelineSpans(r.blocks).start));
    return rows.map(({ day, blocks }) => ({
      ...day,
      blocksText: blocks.length > 0 ? blocks.map((b) => `${b.start}–${b.end}`).join(' · ') : '',
      time: formatMinutes(day.minutes),
      timeline: timelineSpans(blocks, from),
    }));
  });

  /** Die Stunden über den Zeitleisten: Anfang, 12, 18, 24 Uhr. */
  protected readonly dayAxis = computed(() => {
    const start = this.dayList()[0]?.timeline.start ?? 6 * 60;
    const range = 24 * 60 - start;
    const hours = [start / 60, 12, 18, 24].filter((h, i, all) => all.indexOf(h) === i && h * 60 >= start);
    return hours.map((h) => ({ label: String(h).padStart(2, '0'), left: ((h * 60 - start) / range) * 100 }));
  });

  protected readonly litDays = computed(() => this.streakDots().filter((d) => d.lit).length);

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
  protected readonly DoneIcon = CircleCheck;
  protected readonly TimerIcon = Timer;
  protected readonly TrophyIcon = Trophy;
  protected readonly UpIcon = ArrowUpRight;
  protected readonly DownIcon = ArrowDownRight;
  protected readonly weekdayLabels = ['M', '', 'W', '', 'F', '', ''];
}
