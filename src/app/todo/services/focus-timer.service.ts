import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { DIAL_MAX, DIAL_MIN } from '../shared/focus-dial';
import { ToastService } from '../../shared/toast.service';
import { TodoService } from './todo';
import { stripPriorityPrefix } from '../shared/title-priority';
import { FocusSessionService } from './focus-session.service';

export type TimerState = 'idle' | 'running' | 'paused' | 'done';

/** Hintergrundklang beim Arbeiten — erzeugt, nicht geladen: keine Datei, kein Server. */
export type Ambience = 'off' | 'brown' | 'rain' | 'white';

interface Saved {
  minutes: number;
  state: TimerState;
  /** Wann es endet (ms seit 1970), solange es läuft. */
  endsAt: number | null;
  /** Rest in Sekunden, solange es pausiert. */
  left: number | null;
  taskId: string | null;
  /** Die Session auf dem Server, solange eine mit Aufgabe läuft (Flow-Sync). */
  serverId?: string | null;
}

const KEY = 'focus.timer';
/** Sitzungen ohne Aufgabe: die kennt nur dieses Gerät, nicht der Server. */
const COUNT_KEY = 'focus.untracked';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privater Modus: der Timer läuft trotzdem, er übersteht nur kein Neuladen.
  }
}

/**
 * Der Fokus-Timer: einstellen, laufen lassen, pausieren, fertig.
 *
 * Gemessen wird gegen die Uhr (endsAt), nicht durch Mitzählen: ein Tab im
 * Hintergrund bekommt seine Intervalle gedrosselt, und eine mitgezählte Zeit
 * ginge dann nach. Deshalb übersteht er auch ein Neuladen — der Zeitpunkt
 * steht im Speicher des Browsers.
 *
 * Mit Aufgabe wird jede Sitzung auf dem Server verbucht, mit denselben
 * Aufrufen wie Flow: Start, Pause, Fortsetzen, Ende, Abbruch. Dann zählt sie
 * in Flow unter „Today", an der Aufgabe und in der Statistik — und Flow und
 * Webseite zeigen dieselben Zahlen. Ohne Aufgabe bleibt sie lokal, wie in
 * Flow auch: der Server führt Sitzungen je Aufgabe.
 */
@Injectable({ providedIn: 'root' })
export class FocusTimerService {
  private readonly saved = load<Saved>(KEY, {
    minutes: 25,
    state: 'idle',
    endsAt: null,
    left: null,
    taskId: null,
  });

  readonly minutes = signal(clampMinutes(this.saved.minutes));
  readonly state = signal<TimerState>(this.saved.state);
  readonly taskId = signal<string | null>(this.saved.taskId);
  private readonly endsAt = signal<number | null>(this.saved.endsAt);
  private readonly pausedLeft = signal<number | null>(this.saved.left);
  /** Die eigene Session auf dem Server — null ohne Aufgabe oder ohne Verbindung. */
  readonly serverId = signal<string | null>(this.saved.serverId ?? null);
  private readonly now = signal(Date.now());

  /**
   * Abgeschlossene Sitzungen ohne Aufgabe. Die mit Aufgabe zählt der Server
   * (FocusSessionService.sessionCount), zusammen mit denen aus Flow.
   */
  readonly finishedLocal = signal<number>(load<number>(COUNT_KEY, 0));

  readonly ambience = signal<Ambience>('off');

  /** Übrige Sekunden — beim Einstellen die volle Dauer. */
  readonly left = computed(() => {
    const state = this.state();
    if (state === 'running') return Math.max(0, ((this.endsAt() ?? 0) - this.now()) / 1000);
    if (state === 'paused') return this.pausedLeft() ?? this.minutes() * 60;
    if (state === 'done') return 0;
    return this.minutes() * 60;
  });

  /** Anteil, der noch übrig ist (1 → 0). */
  readonly fraction = computed(() => {
    const total = this.minutes() * 60;
    return total === 0 ? 0 : this.left() / total;
  });

  private tick: number | null = null;
  private audio: AudioContext | null = null;
  private noise: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly finishListeners = new Set<(taskId: string | null) => void>();
  private readonly toast = inject(ToastService);
  private readonly todos = inject(TodoService);
  private readonly sessions = inject(FocusSessionService);

  constructor() {
    // Beim Neuladen abgelaufen? Dann ist die Sitzung fertig, ohne Gong —
    // der käme zu spät und erschreckte nur.
    if (this.state() === 'running') {
      if ((this.endsAt() ?? 0) <= Date.now()) this.complete(false);
      else this.startTicking();
    }
    inject(DestroyRef).onDestroy(() => {
      this.stopTicking();
      this.setAmbience('off');
    });
  }

  /** Wird gerufen, wenn eine Sitzung von selbst endet. */
  onFinish(listener: (taskId: string | null) => void): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  setMinutes(minutes: number): void {
    if (this.state() !== 'idle' && this.state() !== 'done') return;
    this.minutes.set(clampMinutes(minutes));
    if (this.state() === 'done') this.state.set('idle');
    this.persist();
  }

  setTask(id: string | null): void {
    if (id === this.taskId()) return;
    this.taskId.set(id);
    // Mitten in einer Sitzung die Aufgabe gewechselt: die alte endet auf dem
    // Server als abgebrochen, die neue beginnt mit der Zeit, die noch übrig ist.
    const running = this.state() === 'running';
    if (this.state() === 'running' || this.state() === 'paused') {
      this.closeServer(false);
      if (running && id) this.openServer(id, this.left());
    }
    this.persist();
  }

  start(): void {
    this.unlockAudio();
    const resuming = this.state() === 'paused';
    const seconds = resuming ? (this.pausedLeft() ?? this.minutes() * 60) : this.minutes() * 60;
    this.endsAt.set(Date.now() + seconds * 1000);
    this.pausedLeft.set(null);
    this.state.set('running');
    this.now.set(Date.now());
    this.startTicking();
    this.persist();

    const serverId = this.serverId();
    if (resuming && serverId) void this.sessions.resume(serverId);
    else if (this.taskId()) this.openServer(this.taskId()!, seconds);
  }

  pause(): void {
    if (this.state() !== 'running') return;
    this.pausedLeft.set(this.left());
    this.endsAt.set(null);
    this.state.set('paused');
    this.stopTicking();
    this.persist();
    const serverId = this.serverId();
    if (serverId) void this.sessions.pause(serverId);
  }

  /** Abbrechen: zurück auf die eingestellte Dauer, ohne Zählung. */
  stop(): void {
    this.endsAt.set(null);
    this.pausedLeft.set(null);
    this.state.set('idle');
    this.stopTicking();
    this.closeServer(false);
    this.persist();
  }

  // ---- Server (Flow-Sync) ----

  private openServer(todoId: string, seconds: number): void {
    void this.sessions.start(todoId, seconds).then((id) => {
      // Inzwischen beendet oder gewechselt? Dann gleich wieder schliessen.
      if (id && (this.state() === 'idle' || this.state() === 'done' || this.taskId() !== todoId)) {
        void this.sessions.stop(id, false);
        return;
      }
      if (id && this.state() === 'paused') void this.sessions.pause(id);
      this.serverId.set(id);
      this.persist();
    });
  }

  private closeServer(completed: boolean): void {
    const id = this.serverId();
    if (!id) return;
    this.serverId.set(null);
    void this.sessions.stop(id, completed);
  }

  // ---- Klang ----

  /**
   * Rauschen als Hintergrund: braun (tief, wie ein Rauschen hinter einer
   * Wand), Regen (gefiltert, heller) oder weiss. Aus Zufallszahlen erzeugt —
   * zwei Sekunden Puffer, endlos wiederholt.
   */
  setAmbience(kind: Ambience): void {
    this.ambience.set(kind);
    if (this.noise) {
      const { source, gain } = this.noise;
      const ctx = this.audio;
      if (ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => source.stop(), 400);
      this.noise = null;
    }
    if (kind === 'off') return;

    const ctx = this.unlockAudio();
    if (!ctx) return;
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'white') {
        data[i] = white * 0.35;
      } else {
        // Brown: aufsummiertes Weiss, gedämpft — die tiefen Anteile bleiben.
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * (kind === 'brown' ? 3.2 : 2.2);
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let node: AudioNode = source;
    if (kind === 'rain') {
      // Regen: dem braunen Grund ein helles, gefiltertes Prasseln beimischen.
      const hiss = ctx.createBufferSource();
      const hissBuffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const hissData = hissBuffer.getChannelData(0);
      for (let i = 0; i < hissData.length; i++) hissData[i] = (Math.random() * 2 - 1) * 0.12;
      hiss.buffer = hissBuffer;
      hiss.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2500;
      band.Q.value = 0.6;
      hiss.connect(band).connect(gain);
      hiss.start();
      source.addEventListener('ended', () => hiss.stop());
    }
    node.connect(gain).connect(ctx.destination);
    source.start();
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.4);
    this.noise = { source, gain };
  }

  /** Ein Gong aus zwei Tönen — sanft genug, um nicht zu erschrecken. */
  private chime(): void {
    const ctx = this.audio;
    if (!ctx) return;
    const at = ctx.currentTime + 0.05;
    for (const [freq, delay] of [
      [660, 0],
      [880, 0.22],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at + delay);
      gain.gain.linearRampToValueAtTime(0.25, at + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + delay + 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at + delay);
      osc.stop(at + delay + 1.7);
    }
  }

  /** Browser spielen Klang erst nach einer Geste — beim ersten Tipp anlegen. */
  private unlockAudio(): AudioContext | null {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      return this.audio;
    } catch {
      return null;
    }
  }

  // ---- intern ----

  private complete(withSound: boolean): void {
    this.endsAt.set(null);
    this.pausedLeft.set(null);
    this.state.set('done');
    this.stopTicking();
    const tracked = this.serverId() !== null;
    this.closeServer(true);
    if (!tracked) {
      this.finishedLocal.update((n) => n + 1);
      save(COUNT_KEY, this.finishedLocal());
    }
    this.persist();
    if (withSound) this.chime();
    if ('vibrate' in navigator) navigator.vibrate?.([120, 80, 120]);
    for (const listener of this.finishListeners) listener(this.taskId());
    if (withSound) this.announce();
  }

  /**
   * Die Meldung am Ende — in jeder Ansicht, nicht nur im Timer. War eine
   * Aufgabe gewählt, lässt sie sich gleich abhaken.
   */
  private announce(): void {
    const task = this.todos.todoById(this.taskId());
    if (task && !task.completed) {
      const name = stripPriorityPrefix(task.title).split('\n')[0].trim();
      this.toast.show(`Focus done: ${name.length > 32 ? name.slice(0, 32) + '…' : name}`, {
        actionLabel: 'Mark done',
        action: () => this.todos.toggleTodo(task.id),
        durationMs: 8000,
      });
    } else {
      this.toast.show(`Focus done: ${this.minutes()} minutes`, { type: 'success' });
    }
  }

  private startTicking(): void {
    this.stopTicking();
    this.tick = window.setInterval(() => {
      this.now.set(Date.now());
      if (this.state() === 'running' && (this.endsAt() ?? 0) <= Date.now()) this.complete(true);
    }, 250);
  }

  private stopTicking(): void {
    if (this.tick !== null) window.clearInterval(this.tick);
    this.tick = null;
  }

  private persist(): void {
    save(KEY, {
      minutes: this.minutes(),
      state: this.state(),
      endsAt: this.endsAt(),
      left: this.pausedLeft(),
      taskId: this.taskId(),
      serverId: this.serverId(),
    } satisfies Saved);
  }
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 25;
  return Math.min(DIAL_MAX, Math.max(DIAL_MIN, Math.round(minutes)));
}
