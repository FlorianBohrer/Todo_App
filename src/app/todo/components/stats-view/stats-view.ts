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
  MAX_DAY_MINUTES,
  Span,
  WorkBlock,
  bestStreak,
  capDay,
  describeBlocks,
  doneByDay,
  doneByTimeOfDay,
  flowHistory,
  focusPerTodo,
  formatMinutes,
  heatLevel,
  heatmapWeeks,
  minutesOn,
  periodDays,
  periodTrend,
  timedBlocks,
  timelineSpans,
  toCSV,
} from '../../shared/focus-stats';
import { FLOW_IMPORT } from '../../shared/flow-import';
import { completionStreak } from '../../shared/streak';
import { fromISODate, shiftISODate, toISODate, todayISO } from '../../shared/week';
import { stripPriorityPrefix } from '../../shared/title-priority';
import { splitLeadingEmoji, taskIcon } from '../../shared/task-icon';
import { TaskGlyph } from '../../shared/task-glyph';
import { stripBold } from '../../shared/rich-title';

/** Wie weit die Statistik zurückreicht: so viel liefert der Server je Tag. */
const SERVER_DAYS = 90;

/** Mehr Sitzungen gibt GET /focus-session nicht auf einmal her. */
const RECENT_LIMIT = 200;

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
 * Flow ist die Quelle der Wahrheit: gemessen wird nur dort, Flow schreibt
 * seine Sitzungen auf den Server, und gerechnet wird hier nach Flows Regeln
 * (focus-stats.ts) — mit den Stunden, die Flow vor seiner Statistik
 * eingelesen hat (flow-import.ts). Beide Apps zeigen dieselben Zahlen.
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
    const [days, recent] = await Promise.all([this.sessions.loadDays(SERVER_DAYS), this.sessions.loadRecent(RECENT_LIMIT)]);
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

  /** Was Flow zeigt: Sitzungen und eingelesene Stunden, je Tag gedeckelt. */
  private readonly history = computed(() => flowHistory(this.recent(), FLOW_IMPORT));

  /**
   * Ab welchem Tag die geladenen Sitzungen vollständig sind. Der Server gibt
   * höchstens 200 her; sind es so viele, kann davor etwas fehlen. null =
   * alles geladen.
   */
  private readonly coveredFrom = computed(() => {
    const list = this.recent();
    if (list.length < RECENT_LIMIT) return null;
    return list.reduce((first, s) => {
      const day = toISODate(s.startedAt);
      return day < first ? day : first;
    }, '9999-12-31');
  });

  /**
   * Die Blöcke eines Tages, wie Flow sie zählt. Vor dem ersten geladenen Tag
   * (nur bei sehr vielen Sitzungen) steht statt der Sitzungen die Tagessumme
   * des Servers, als ein Block ohne Uhrzeit.
   */
  protected blocksOn(iso: string): readonly WorkBlock[] {
    const from = this.coveredFrom();
    if (from === null || iso >= from) return this.history()[iso] ?? [];
    const imported = FLOW_IMPORT[iso] ?? [];
    const server = Math.round((this.perDay().get(iso)?.totalSeconds ?? 0) / 60);
    const blocks: WorkBlock[] = server > 0 ? [...imported, { start: null, end: null, minutes: server, source: 'flow' }] : [...imported];
    return capDay(blocks, MAX_DAY_MINUTES);
  }

  private minutesOf(iso: string): number {
    return minutesOn(this.blocksOn(iso));
  }

  protected readonly days = computed<DayBar[]>(() => {
    const today = todayISO();
    const span = this.span();
    return periodDays(span, this.offset()).map((iso, index) => {
      const date = fromISODate(iso);
      return {
        iso,
        label: span === 'week' ? date.toLocaleDateString('en-US', { weekday: 'narrow' }) : index % 7 === 0 ? String(date.getDate()) : '',
        name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        minutes: this.minutesOf(iso),
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
  /** Flow-Sitzungen im Zeitraum, mit ihren Minuten — ohne die eingelesenen Blöcke. */
  private readonly flowBlocks = computed(() =>
    this.days().flatMap((d) => this.blocksOn(d.iso).filter((b) => b.source === 'flow' && b.start !== null)),
  );
  protected readonly sessionsInPeriod = computed(() => this.flowBlocks().length);
  protected readonly doneInPeriod = computed(() => this.days().reduce((sum, d) => sum + d.done, 0));

  /**
   * Gegen den Zeitraum davor — wie in Flow nur für abgeschlossene Zeiträume:
   * eine halbe Woche gegen eine ganze sagt nichts.
   */
  protected readonly trend = computed(() => {
    const previous = periodDays(this.span(), this.offset() - 1).reduce((sum, iso) => sum + this.minutesOf(iso), 0);
    const change = periodTrend(this.total(), previous, this.offset());
    if (change === null) return null;
    const label = `${change > 0 ? '+' : ''}${change}%`;
    return { change, up: change >= 0, label, title: `${label} vs last ${this.span()}` };
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

  /** Wie lang eine Flow-Sitzung im Schnitt war. */
  protected readonly avgSession = computed(() => {
    const blocks = this.flowBlocks();
    return blocks.length > 0 ? Math.round(minutesOn(blocks) / blocks.length) : 0;
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
        const minutes = this.minutesOf(iso);
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
      .map((d) => ({ day: d, blocks: this.blocksOn(d.iso) }));
    const from = Math.min(6 * 60, ...rows.map((r) => timelineSpans(timedBlocks(r.blocks)).start));
    return rows.map(({ day, blocks }) => ({
      ...day,
      // Wie in Flow: die Uhrzeiten, oder „2 blocks", wo sie fehlen.
      blocksText: blocks.length > 0 ? describeBlocks(blocks) : '',
      time: formatMinutes(day.minutes),
      timeline: timelineSpans(timedBlocks(blocks), from),
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
    const days = this.days().map((d) => ({ date: d.iso, blocks: this.blocksOn(d.iso) }));
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
