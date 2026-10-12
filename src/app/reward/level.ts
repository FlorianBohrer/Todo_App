/**
 * Level, Titel, und die zwei Dinge, die eine Belohnung unvorhersehbar machen.
 *
 * Dieselbe Datei liegt in der Todo-App (src/app/reward/level.ts) und in Flow
 * (src/reward/level.ts). Wer hier etwas ändert, ändert es dort mit — sonst
 * hieße Level 8 in der einen App anders als in der anderen.
 *
 * Bewusst NICHT dabei: eine Tagesserie. Die Begründung steht in rhythm.ts der
 * Todo-App und gilt hier genauso — eine app-weite Serie belohnt das Öffnen,
 * nicht die Arbeit, und bestraft Krankheit und Urlaub. Die Spannung kommt
 * stattdessen aus Combos (jetzt) und goldenen Aufgaben (irgendwann).
 */

/**
 * XP für den Schritt von `level` auf `level + 1`: 50, 75, 100, …
 *
 * Linear wachsend, nicht exponentiell. Die ersten Level kommen schnell — das
 * erste Level-Up soll am ersten Tag passieren —, und später wird jeder Schritt
 * länger, aber nie so lang, dass er unerreichbar wirkt.
 */
export function xpForStep(level: number): number {
  return 50 + 25 * (level - 1);
}

/** Gesamt-XP, ab der `level` erreicht ist. Level 1 beginnt bei 0. */
export function xpAtLevel(level: number): number {
  const steps = Math.max(0, level - 1);
  return 50 * steps + (25 * steps * (steps - 1)) / 2;
}

/**
 * Ab welchem Level welcher Titel gilt. Ein neuer Titel ist ein zweites
 * Level-Up — deshalb am Anfang dicht, später seltener und dafür schwerer.
 */
const TITLES: ReadonlyArray<readonly [number, string]> = [
  [1, 'Starter'],
  [2, 'Getting going'],
  [3, 'Warming up'],
  [5, 'Steady'],
  [8, 'Focused'],
  [12, 'Sharp'],
  [16, 'Relentless'],
  [20, 'Deep worker'],
  [25, 'In flow'],
  [30, 'Unstoppable'],
  [40, 'Master'],
  [50, 'Legend'],
];

export function titleFor(level: number): string {
  let title = '';
  for (const [from, name] of TITLES) {
    if (level >= from) title = name;
  }
  return title;
}

/** Das nächste Level mit neuem Titel, oder null, wenn alle erreicht sind. */
export function nextTitle(level: number): { level: number; title: string } | null {
  const next = TITLES.find(([from]) => from > level);
  return next ? { level: next[0], title: next[1] } : null;
}

export interface LevelInfo {
  level: number;
  title: string;
  /** Gesamt-XP. */
  xp: number;
  /** XP seit Beginn dieses Levels. */
  intoLevel: number;
  /** XP von diesem Level bis zum nächsten. */
  stepSize: number;
  /** 0 … 1 */
  progress: number;
}

export function levelFor(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));

  let level = 1;
  while (total >= xpAtLevel(level + 1)) level++;

  const intoLevel = total - xpAtLevel(level);
  const stepSize = xpForStep(level);

  return {
    level,
    title: titleFor(level),
    xp: total,
    intoLevel,
    stepSize,
    progress: intoLevel / stepSize,
  };
}

export interface LevelUp {
  /** Das neue Level. */
  to: LevelInfo;
  /** Wie viele Level auf einmal — bei einer goldenen 90-Minuten-Session können es zwei sein. */
  gained: number;
  /** Mit diesem Level kam ein neuer Titel. */
  newTitle: boolean;
}

/** Ob zwischen zwei XP-Ständen ein Level liegt — und wenn ja, welches. */
export function levelUpBetween(before: number, after: number): LevelUp | null {
  const from = levelFor(before);
  const to = levelFor(after);
  if (to.level <= from.level) return null;
  return { to, gained: to.level - from.level, newTitle: to.title !== from.title };
}

// ---- Goldene Aufgaben ----

/**
 * Eine von acht zählt doppelt.
 *
 * Ein fester Betrag pro Haken ist nach einer Woche Routine, und Routine
 * belohnt nicht mehr. Was trägt, ist die Belohnung, die man nicht vorhersieht.
 *
 * Aber kein echter Zufall: ob etwas golden ist, folgt aus seiner id. Damit
 * bleibt der XP-Stand aus den Daten ableitbar — neu laden, anderes Gerät,
 * abhaken und zurücknehmen: dieselbe Aufgabe ist immer gleich golden, und man
 * kann nicht würfeln, bis es passt. Sehen kann man es vorher trotzdem nicht.
 */
export const GOLDEN_ODDS = 8;

export function isGolden(key: string): boolean {
  return fnv1a(key) % GOLDEN_ODDS === 0;
}

/** FNV-1a, 32 Bit. Klein, schnell, gut genug gestreut für eine Münze. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ---- Combo ----

/**
 * Wer in kurzer Folge abhakt, steigt die Tonleiter hinauf.
 *
 * Nur Klang und Anzeige, keine XP: sonst hinge der Stand an der Uhrzeit des
 * Klickens statt an den Daten, und wer bedächtig arbeitet, bekäme weniger.
 */
export const COMBO_WINDOW_MS = 90_000;

export interface Combo {
  count: number;
  at: number;
}

export function nextCombo(previous: Combo | null, now: number): Combo {
  return previous !== null && now - previous.at <= COMBO_WINDOW_MS
    ? { count: previous.count + 1, at: now }
    : { count: 1, at: now };
}
