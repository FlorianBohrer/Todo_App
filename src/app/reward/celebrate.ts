/**
 * Die Feier: Konfetti, fliegende Zahlen, Klang, ein Zucken in der Hand.
 *
 * Ohne Framework und ohne Abhängigkeit — dieselbe Datei liegt in der
 * Todo-App (src/app/reward/celebrate.ts) und in Flow (src/reward/celebrate.ts).
 *
 * Laut, und das mit Absicht: Erledigen soll sich nach etwas anfühlen. Drei
 * Regeln gelten trotzdem ohne Ausnahme:
 *
 * - Wer reduzierte Bewegung eingestellt hat, bekommt kein Konfetti und nichts,
 *   was fliegt. Die Belohnung kommt dann als Klang, als ruhig eingeblendete
 *   Zahl und über die Ansage für Screenreader.
 * - Nichts davon fängt einen Klick ab. Die Leinwand liegt über allem und lässt
 *   jeden Zeiger durch; sie existiert nur, solange etwas fliegt.
 * - Was niemand sieht, wird nicht abgespielt. Endet etwas im Hintergrund-Tab,
 *   wartet die Feier, bis man zurück ist — dann ist sie die Begrüßung.
 */

export interface Point {
  x: number;
  y: number;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** Mitte eines Elements in Fensterkoordinaten. */
export function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Jetzt, oder sobald der Tab wieder zu sehen ist. */
function whenVisible(run: () => void): void {
  if (document.visibilityState === 'visible') {
    run();
    return;
  }
  const onChange = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', onChange);
    run();
  };
  document.addEventListener('visibilitychange', onChange);
}

// ---------------------------------------------------------------------------
// Konfetti
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  /** Flattern: Konfetti dreht sich auch um die eigene Längsachse. */
  flutter: number;
  age: number;
  life: number;
  shape: 'strip' | 'dot' | 'star';
}

/** px/ms² — schwer genug, dass es fällt, leicht genug, dass es schwebt. */
const GRAVITY = 0.0011;
/** Luftwiderstand pro Millisekunde. */
const DRAG = 0.0022;
/** Mehr zeichnet kein Telefon flüssig; darüber werden die ältesten ersetzt. */
const MAX_PARTICLES = 700;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let frame = 0;
let lastTime = 0;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;

  const element = document.createElement('canvas');
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '2147483000',
  });
  document.body.appendChild(element);

  canvas = element;
  ctx = element.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  return ctx;
}

function resize(): void {
  if (!canvas || !ctx) return;
  // Höchstens doppelte Auflösung: dreifache kostet auf großen Telefonen mehr
  // Bilder pro Sekunde, als sie an Schärfe bringt.
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function teardown(): void {
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

function drawStar(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    context.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  context.closePath();
  context.fill();
}

function step(time: number): void {
  const context = ctx;
  if (!context) {
    frame = 0;
    return;
  }

  // Gedeckelt: nach einem verdeckten Tab läge sonst eine Minute zwischen zwei
  // Bildern, und alles wäre in einem Schritt durch den Boden gefallen.
  const dt = Math.min(32, lastTime === 0 ? 16 : time - lastTime);
  lastTime = time;

  const width = window.innerWidth;
  const height = window.innerHeight;
  context.clearRect(0, 0, width, height);

  const damping = Math.pow(1 - DRAG, dt);
  const alive: Particle[] = [];

  for (const p of particles) {
    p.age += dt;
    if (p.age >= p.life || p.y > height + 60) continue;

    p.vx *= damping;
    p.vy = p.vy * damping + GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    p.flutter += dt * 0.012;

    // Das letzte Drittel des Lebens blendet aus, statt abrupt zu verschwinden.
    const fadeStart = p.life * 0.65;
    const alpha = p.age < fadeStart ? 1 : 1 - (p.age - fadeStart) / (p.life - fadeStart);

    context.save();
    context.globalAlpha = Math.max(0, alpha);
    context.fillStyle = p.color;
    context.translate(p.x, p.y);
    context.rotate(p.rotation);

    if (p.shape === 'strip') {
      context.scale(1, Math.cos(p.flutter));
      context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.shape === 'dot') {
      context.beginPath();
      context.arc(0, 0, p.size / 3, 0, Math.PI * 2);
      context.fill();
    } else {
      drawStar(context, p.size / 2);
    }

    context.restore();
    alive.push(p);
  }

  particles = alive;

  if (particles.length > 0) {
    frame = requestAnimationFrame(step);
  } else {
    frame = 0;
    lastTime = 0;
    teardown();
  }
}

export interface BurstOptions {
  colors: readonly string[];
  /** Wie viele Teile. */
  count?: number;
  /** Anfangsgeschwindigkeit in px/ms. */
  power?: number;
  /** Richtung in Bogenmaß; −π/2 ist senkrecht nach oben. */
  angle?: number;
  /** Streuung um die Richtung, in Bogenmaß. 2π ist ein Kreis. */
  spread?: number;
  /** Anteil Sterne, 0 … 1. */
  stars?: number;
}

/** Ein Ausbruch von einem Punkt aus. */
export function burst(origin: Point, options: BurstOptions): void {
  if (prefersReducedMotion() || options.colors.length === 0) return;

  whenVisible(() => {
    if (!ensureCanvas()) return;

    const count = options.count ?? 40;
    const power = options.power ?? 0.55;
    const angle = options.angle ?? -Math.PI / 2;
    const spread = options.spread ?? Math.PI * 0.9;
    const stars = options.stars ?? 0.12;

    for (let i = 0; i < count; i++) {
      const direction = angle + (Math.random() - 0.5) * spread;
      const speed = power * (0.35 + Math.random() * 0.85);
      const roll = Math.random();

      particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        size: 6 + Math.random() * 6,
        color: options.colors[Math.floor(Math.random() * options.colors.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02,
        flutter: Math.random() * Math.PI * 2,
        age: 0,
        life: 1300 + Math.random() * 1100,
        shape: roll < stars ? 'star' : roll < 0.45 ? 'dot' : 'strip',
      });
    }

    if (particles.length > MAX_PARTICLES) {
      particles = particles.slice(particles.length - MAX_PARTICLES);
    }

    if (frame === 0) frame = requestAnimationFrame(step);
  });
}

/**
 * Das große Feuerwerk — für ein Level-Up.
 *
 * Zwei Kanonen aus den unteren Ecken, dann Ausbrüche über dem Bildschirm,
 * gestaffelt, damit es sich wie ein Ereignis anfühlt und nicht wie ein Bild.
 */
export function fireworks(colors: readonly string[]): void {
  if (prefersReducedMotion()) return;

  whenVisible(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const power = Math.min(1.5, 0.9 + height / 1800);

    burst({ x: 0, y: height }, { colors, count: 110, power, angle: -Math.PI / 3, spread: 0.7, stars: 0.2 });
    burst({ x: width, y: height }, { colors, count: 110, power, angle: (-2 * Math.PI) / 3, spread: 0.7, stars: 0.2 });

    [260, 520, 820, 1100].forEach((delay, index) => {
      window.setTimeout(() => {
        burst(
          { x: width * (0.2 + Math.random() * 0.6), y: height * (0.18 + Math.random() * 0.25) },
          { colors, count: 70, power: 0.45, spread: Math.PI * 2, stars: 0.3 },
        );
      }, delay + index * 30);
    });
  });
}

export type FloatVariant = 'xp' | 'gold' | 'combo';

const FLOAT_COLORS: Record<FloatVariant, string> = {
  xp: '#FDE68A',
  gold: '#FCD34D',
  combo: '#ECF0F6',
};

/**
 * Eine Zahl, die vom Haken aufsteigt: „+30 XP".
 *
 * Über die Web Animations API statt über eine Klasse — so braucht die Datei
 * kein Stylesheet und funktioniert in beiden Apps gleich.
 */
export function floatText(origin: Point, text: string, variant: FloatVariant = 'xp', offsetY = 0): void {
  whenVisible(() => {
    const reduced = prefersReducedMotion();
    const label = document.createElement('span');
    label.textContent = text;
    label.setAttribute('aria-hidden', 'true');
    Object.assign(label.style, {
      position: 'fixed',
      left: `${origin.x}px`,
      top: `${origin.y + offsetY}px`,
      zIndex: '2147483001',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      font: `800 ${variant === 'combo' ? 13 : 17}px/1 ui-rounded, "Figtree Variable", system-ui, sans-serif`,
      letterSpacing: '-0.01em',
      color: FLOAT_COLORS[variant],
      textShadow: '0 0 14px rgb(253 230 138 / 0.5)',
      // Eine dunkle Pille darunter: die Zahl fliegt über Text hinweg und muss
      // dort trotzdem lesbar bleiben.
      padding: '0.3em 0.6em',
      borderRadius: '999px',
      background: 'rgb(11 15 22 / 0.72)',
      boxShadow: '0 0 0 1px rgb(253 230 138 / 0.18), 0 6px 18px -6px rgb(0 0 0 / 0.6)',
      transform: 'translate(-50%, -50%)',
    });
    // Ohne Web Animations API (ältere Browser, Testumgebung) bliebe die Zahl
    // stehen. Dann lieber gar nicht — die Ansage kommt trotzdem.
    if (typeof label.animate !== 'function') return;
    document.body.appendChild(label);

    const keyframes: Keyframe[] = reduced
      ? [
          { opacity: 0, transform: 'translate(-50%, -120%)' },
          { opacity: 1, transform: 'translate(-50%, -120%)', offset: 0.15 },
          { opacity: 1, transform: 'translate(-50%, -120%)', offset: 0.75 },
          { opacity: 0, transform: 'translate(-50%, -120%)' },
        ]
      : [
          { opacity: 0, transform: 'translate(-50%, -40%) scale(0.6)' },
          { opacity: 1, transform: 'translate(-50%, -140%) scale(1.25)', offset: 0.18 },
          { opacity: 1, transform: 'translate(-50%, -230%) scale(1)', offset: 0.6 },
          { opacity: 0, transform: 'translate(-50%, -330%) scale(0.95)' },
        ];

    const animation = label.animate(keyframes, {
      duration: reduced ? 1400 : 1150,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    });
    animation.onfinish = () => label.remove();
    animation.oncancel = () => label.remove();
  });
}

// ---------------------------------------------------------------------------
// Klang
// ---------------------------------------------------------------------------

let audio: AudioContext | null = null;

/**
 * Den Klang freischalten. Browser erlauben Ton erst nach einer Nutzerhandlung;
 * deshalb wird das bei jedem Klick aufgerufen, der später etwas hören will.
 */
export function unlockAudio(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
  return audio;
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
}

function tone(context: AudioContext, frequency: number, at: number, duration: number, options: ToneOptions = {}): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const peak = options.gain ?? 0.15;
  const attack = options.attack ?? 0.008;

  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.value = frequency;

  // Weich ein, weich aus: ein harter Anfang knackt im Lautsprecher.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}

const C5 = 523.25;

/** Ein Halbtonschritt über `base`. */
function semitones(base: number, steps: number): number {
  return base * Math.pow(2, steps / 12);
}

/**
 * Der Haken: ein kurzes Zupfen mit Glanz darüber.
 *
 * Jede Stufe der Combo klingt einen Ganzton höher — nach acht ist man eine
 * Oktave weiter. Das ist der Teil, den man hört, bevor man ihn sieht.
 */
export function popSound(comboStep = 1): void {
  const context = unlockAudio();
  if (!context) return;

  const steps = Math.min(Math.max(comboStep, 1) - 1, 12) * 2;
  const base = semitones(C5, steps);
  const at = context.currentTime + 0.01;

  tone(context, base, at, 0.22, { type: 'triangle', gain: 0.2 });
  tone(context, base * 2, at + 0.035, 0.28, { gain: 0.07 });
  tone(context, base * 3, at + 0.07, 0.2, { gain: 0.035 });
}

/** Golden: ein Arpeggio, das funkelt. */
export function goldSound(): void {
  const context = unlockAudio();
  if (!context) return;

  const at = context.currentTime + 0.01;
  [0, 4, 7, 12, 16, 19, 24].forEach((step, index) => {
    tone(context, semitones(C5 * 2, step), at + index * 0.055, 0.5, { gain: 0.09 });
  });
  tone(context, C5, at, 0.6, { type: 'triangle', gain: 0.12 });
}

/** Level-Up: ein Lauf hinauf, dann der volle Akkord. */
export function levelUpSound(): void {
  const context = unlockAudio();
  if (!context) return;

  const at = context.currentTime + 0.02;
  [0, 4, 7, 12].forEach((step, index) => {
    tone(context, semitones(C5, step), at + index * 0.09, 0.32, { type: 'triangle', gain: 0.16 });
  });

  const chord = at + 0.4;
  [0, 4, 7, 12, 16].forEach((step) => {
    tone(context, semitones(C5, step), chord, 1.6, { gain: 0.07, attack: 0.03 });
    // Leicht verstimmte Zweitstimme: macht aus dem Piepen einen Chor.
    tone(context, semitones(C5, step) * 1.004, chord, 1.6, { type: 'triangle', gain: 0.035, attack: 0.03 });
  });
  tone(context, C5 / 2, chord, 1.4, { type: 'triangle', gain: 0.1, attack: 0.02 });
}

// ---------------------------------------------------------------------------
// Haptik
// ---------------------------------------------------------------------------

/**
 * Ein Muster in der Hand. Nur Android kennt es; Safari und iOS schweigen, und
 * wer reduzierte Bewegung will, wird auch nicht angestoßen.
 */
export function buzz(pattern: number | number[]): void {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Kein Grund, eine Feier daran scheitern zu lassen. */
  }
}

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

/** Gold für Goldenes — in beiden Apps gleich, unabhängig von der Ansicht. */
export const GOLD_COLORS: readonly string[] = ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#FFF7D6'];
