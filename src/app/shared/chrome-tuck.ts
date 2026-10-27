/**
 * Die App-Leiste weicht beim Scrollen aus.
 *
 * Im offenen Plan standen am Rechner zwei klebende Leisten übereinander: die
 * App-Leiste (Ordner, Ansichten, Suche, Level) und darunter der Kopf des
 * Dokuments. Zusammen rund 120px, auf einem Laptop ein Viertel der Höhe, und
 * beim Lesen braucht man nur die untere.
 *
 * Jetzt fährt die App-Leiste nach oben weg, sobald man ein Stück gescrollt
 * hat, und was darunter klebt (der Dokumentkopf) rückt an die Oberkante
 * (--chrome-offset in styles.scss). Zurück kommt sie
 *  - mit Zeiger: wenn man an den oberen Rand fährt — und bleibt, solange man
 *    darüber ist. Hochscrollen allein holt sie nicht zurück; beim Lesen
 *    scrollt man ständig ein Stück zurück, und eine Leiste, die dabei jedes
 *    Mal herunterklappt, ist unruhiger als eine, die immer da ist.
 *  - ohne Zeiger (Telefon, Tablet): beim Hochscrollen, wie in Safari.
 *  - immer: oben auf der Seite, mit Tastaturfokus darin, und solange ein
 *    Menü aus ihr offen ist.
 */

/** Ab hier darf sie weichen: die Leiste selbst und etwas Luft. */
export const TUCK_AFTER_PX = 72;
/** So weit muss man in eine Richtung scrollen, bevor sie reagiert. */
export const TUCK_DOWN_PX = 24;
export const SHOW_UP_PX = 16;
/** So nah am oberen Rand holt der Zeiger sie zurück. */
export const REVEAL_EDGE_PX = 8;

export interface TuckState {
  scrollY: number;
  /** Strecke in der aktuellen Scrollrichtung: positiv nach unten. */
  travel: number;
  hoverCapable: boolean;
  /** Zeiger am oberen Rand oder auf der Leiste. */
  hovering: boolean;
  /** Tastaturfokus in der Leiste. */
  focused: boolean;
  /** Ein Menü (CDK-Overlay) ist offen. */
  overlayOpen: boolean;
  tucked: boolean;
}

export function shouldTuck(s: TuckState): boolean {
  if (s.scrollY < TUCK_AFTER_PX) return false;
  if (s.focused || s.overlayOpen) return false;
  if (s.hoverCapable) return !s.hovering;
  if (s.travel <= -SHOW_UP_PX) return false;
  if (s.travel >= TUCK_DOWN_PX) return true;
  return s.tucked;
}

/**
 * Hängt die Beobachter an und setzt `chrome-tucked` am <html>. Gibt die
 * Aufräumfunktion zurück.
 */
export function attachChromeTuck(chrome: HTMLElement): () => void {
  const root = document.documentElement;
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  const state: TuckState = {
    scrollY: window.scrollY,
    travel: 0,
    hoverCapable: hoverQuery.matches,
    hovering: false,
    focused: false,
    overlayOpen: false,
    tucked: false,
  };

  let lastY = window.scrollY;
  let frame = 0;

  const evaluate = () => {
    frame = 0;
    state.hoverCapable = hoverQuery.matches;
    state.focused = chrome.querySelector(':focus-visible') !== null;
    state.overlayOpen = document.querySelector('.cdk-overlay-backdrop') !== null;
    const tucked = shouldTuck(state);
    if (tucked === state.tucked) return;
    state.tucked = tucked;
    root.classList.toggle('chrome-tucked', tucked);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(evaluate);
  };

  const onScroll = () => {
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    // Richtungswechsel: die Strecke beginnt von vorn.
    if (dy !== 0 && Math.sign(dy) !== Math.sign(state.travel)) state.travel = 0;
    state.travel += dy;
    state.scrollY = y;
    schedule();
  };

  const onPointer = (event: MouseEvent) => {
    const hovering =
      event.clientY <= REVEAL_EDGE_PX || chrome.contains(event.target as Node);
    if (hovering === state.hovering) return;
    state.hovering = hovering;
    schedule();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('mousemove', onPointer, { passive: true });
  chrome.addEventListener('focusin', schedule);
  chrome.addEventListener('focusout', schedule);
  hoverQuery.addEventListener('change', schedule);
  schedule();

  return () => {
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('mousemove', onPointer);
    chrome.removeEventListener('focusin', schedule);
    chrome.removeEventListener('focusout', schedule);
    hoverQuery.removeEventListener('change', schedule);
    if (frame) cancelAnimationFrame(frame);
    root.classList.remove('chrome-tucked');
  };
}
