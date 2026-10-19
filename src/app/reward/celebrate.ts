/**
 * Die Feier: ein Funke am Haken, eine kleine Zahl, Klang, ein Zucken in der Hand.
 *
 * Ohne Framework und ohne Abhängigkeit. Ursprünglich wortgleich mit
 * src/reward/celebrate.ts in Flow; die Feier hier ist seitdem leiser: ein
 * Funke statt Konfetti, kein Feuerwerk, eine schlichte Zahl. Klang und
 * Haptik sind unverändert.
 *
 * Warum leiser: Konfetti über den halben Bildschirm und ein Feuerwerk beim
 * Level-Up waren beim ersten Mal schön und ab dem zehnten Haken am Tag Lärm.
 * Die Belohnung soll man spüren, nicht abwarten — sie dauert jetzt so lange
 * wie der Haken selbst. Drei Regeln gelten weiter ohne Ausnahme:
 *
 * - Wer reduzierte Bewegung eingestellt hat, bekommt nichts, was sich bewegt.
 *   Die Belohnung kommt dann als Klang, als ruhig eingeblendete Zahl und über
 *   die Ansage für Screenreader.
 * - Nichts davon fängt einen Klick ab; alles liegt ohne Zeigerereignisse über
 *   der Seite und existiert nur, solange es zu sehen ist.
 * - Was niemand sieht, wird nicht abgespielt. Endet etwas im Hintergrund-Tab,
 *   wartet die Feier, bis man zurück ist.
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
export function whenVisible(run: () => void): void {
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
// Funke
// ---------------------------------------------------------------------------

export interface SparkOptions {
  /** Farbe von Ring und Punkten. */
  color: string;
  /** Golden: ein paar Punkte mehr und etwas weiter, sonst gleich. */
  golden?: boolean;
}

/** Ein absolut gesetztes Element ohne Zeigerereignisse, mittig auf `origin`. */
function overlayElement(origin: Point): HTMLSpanElement {
  const element = document.createElement('span');
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'fixed',
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    width: '0',
    height: '0',
    zIndex: '2147483000',
    pointerEvents: 'none',
  });
  return element;
}

/**
 * Der Haken bekommt einen Funken: ein feiner Ring, der sich öffnet, und ein
 * paar Punkte, die nach außen gehen und verlöschen. 0,45 Sekunden, dann ist
 * nichts mehr da.
 *
 * Bewusst an der Stelle des Hakens und klein: der Blick ist ohnehin dort,
 * und eine Belohnung, die den Bildschirm verlässt, nimmt ihn mit.
 */
export function spark(origin: Point, options: SparkOptions): void {
  if (prefersReducedMotion()) return;

  whenVisible(() => {
    const root = overlayElement(origin);
    // Ohne Web Animations API (Testumgebung, sehr alte Browser) bliebe alles
    // stehen. Dann lieber gar nichts — Klang und Ansage kommen trotzdem.
    if (typeof root.animate !== 'function') return;
    document.body.appendChild(root);

    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const duration = options.golden ? 560 : 450;

    const ring = document.createElement('span');
    Object.assign(ring.style, {
      position: 'absolute',
      left: '-14px',
      top: '-14px',
      width: '28px',
      height: '28px',
      borderRadius: '999px',
      border: `1.5px solid ${options.color}`,
    });
    root.appendChild(ring);
    const animations = [
      ring.animate(
        [
          { opacity: 0.7, transform: 'scale(0.6)' },
          { opacity: 0, transform: `scale(${options.golden ? 2.1 : 1.7})` },
        ],
        { duration, easing, fill: 'forwards' },
      ),
    ];

    const count = options.golden ? 10 : 6;
    const reach = options.golden ? 30 : 22;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        position: 'absolute',
        left: '-2px',
        top: '-2px',
        width: '4px',
        height: '4px',
        borderRadius: '999px',
        background: options.color,
      });
      root.appendChild(dot);
      const x = Math.cos(angle) * reach;
      const y = Math.sin(angle) * reach;
      animations.push(
        dot.animate(
          [
            { opacity: 0, transform: `translate(${x * 0.45}px, ${y * 0.45}px) scale(1)` },
            { opacity: 1, offset: 0.25 },
            { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.4)` },
          ],
          { duration, easing, fill: 'forwards' },
        ),
      );
    }

    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => root.remove());
  });
}

export type FloatVariant = 'xp' | 'gold';

const FLOAT_COLORS: Record<FloatVariant, string> = {
  xp: '#E7ECF3',
  gold: '#FCD34D',
};

/**
 * Die Zahl über dem Haken: „+30 XP", bei einer Combo „+30 XP · ×3".
 *
 * Eine Zeile, kein Leuchten, keine zweite Zahl darunter. Sie steigt ein
 * kleines Stück und blendet aus — lesbar, aber nicht zum Hinsehen gemacht.
 * Über die Web Animations API statt über eine Klasse, damit die Datei kein
 * Stylesheet braucht.
 */
export function floatText(origin: Point, text: string, variant: FloatVariant = 'xp'): void {
  whenVisible(() => {
    const reduced = prefersReducedMotion();
    const label = document.createElement('span');
    label.textContent = text;
    label.setAttribute('aria-hidden', 'true');
    Object.assign(label.style, {
      position: 'fixed',
      left: `${origin.x}px`,
      top: `${origin.y}px`,
      zIndex: '2147483001',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      font: '600 12px/1 "Figtree Variable", system-ui, sans-serif',
      letterSpacing: '0.01em',
      fontVariantNumeric: 'tabular-nums',
      color: FLOAT_COLORS[variant],
      // Eine ruhige Fläche darunter: die Zahl steht über Text und muss dort
      // lesbar bleiben. Keine Schatten, kein Schein.
      padding: '0.4em 0.65em',
      borderRadius: '999px',
      background: 'rgb(17 22 31 / 0.86)',
      border: `1px solid ${variant === 'gold' ? 'rgb(252 211 77 / 0.35)' : 'rgb(255 255 255 / 0.10)'}`,
      transform: 'translate(-50%, -150%)',
    });
    if (typeof label.animate !== 'function') return;
    document.body.appendChild(label);

    const keyframes: Keyframe[] = reduced
      ? [
          { opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.75 },
          { opacity: 0 },
        ]
      : [
          { opacity: 0, transform: 'translate(-50%, -110%)' },
          { opacity: 1, transform: 'translate(-50%, -170%)', offset: 0.25 },
          { opacity: 1, transform: 'translate(-50%, -190%)', offset: 0.7 },
          { opacity: 0, transform: 'translate(-50%, -210%)' },
        ];

    const animation = label.animate(keyframes, {
      duration: reduced ? 1200 : 1000,
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

/** Gold für Goldenes — unabhängig von der Ansicht. */
export const GOLD_COLOR = '#FCD34D';
