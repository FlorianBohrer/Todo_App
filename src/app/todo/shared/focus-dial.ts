/**
 * Das Drehrad des Fokus-Timers: Winkel ↔ Minuten.
 *
 * Wie eine Uhr: oben 0 beziehungsweise 60, rechts 15, unten 30, links 45.
 * Gedreht wird im Uhrzeigersinn, eingerastet in Fünferschritten. Hier steht
 * nur die Rechnung, damit sie ohne Bildschirm prüfbar ist.
 */

export const DIAL_STEP = 5;
export const DIAL_MIN = 5;
export const DIAL_MAX = 60;

/** Winkel eines Punkts um die Mitte, im Uhrzeigersinn ab oben, 0 bis 360. */
export function angleAt(cx: number, cy: number, x: number, y: number): number {
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Minuten zu einem Winkel. Am oberen Punkt entscheidet, woher man kommt:
 * wer von 55 weiter dreht, landet bei 60 und nicht bei 5.
 */
export function minutesAt(angle: number, previous: number): number {
  const snapped = Math.round(angle / 6 / DIAL_STEP) * DIAL_STEP;
  if (snapped === 0 || snapped === 60) return previous > 30 ? DIAL_MAX : DIAL_MIN;
  return Math.min(DIAL_MAX, Math.max(DIAL_MIN, snapped));
}

/** Der Winkel, an dem der Griff für eine Minutenzahl steht. */
export function angleFor(minutes: number): number {
  return (Math.min(DIAL_MAX, Math.max(0, minutes)) / 60) * 360;
}

/** Ein Punkt auf dem Kreis, Winkel im Uhrzeigersinn ab oben. */
export function pointAt(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/**
 * SVG-Pfad eines Bogens von oben bis `angle`. Bei 360 ein voller Kreis aus
 * zwei Hälften — ein einzelner Bogen von A nach A zeichnet gar nichts.
 */
export function arcPath(cx: number, cy: number, r: number, angle: number): string {
  if (angle <= 0) return '';
  if (angle >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  }
  const end = pointAt(cx, cy, r, angle);
  const large = angle > 180 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/** 65 → „1:05", 1500 → „25:00". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
