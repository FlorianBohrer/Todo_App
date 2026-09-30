import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * Sagt, ob an einem Rollbereich seitlich noch etwas steht.
 *
 * Gesetzt werden zwei Klassen am UMGEBENDEN Element: `has-more-left` und
 * `has-more-right`. Dort, nicht am Rollbereich selbst, weil ein Verlauf am
 * Rand sonst mitrollen wuerde — er soll aber stehen bleiben, waehrend der
 * Inhalt darunter durchlaeuft.
 *
 * Warum ueberhaupt: ohne den Hinweis sieht eine zu breite Tabelle
 * abgeschnitten aus. Rollen kann man, nur sieht man es nicht — macOS blendet
 * Rollbalken aus, bis jemand rollt. Ein Rand, der sich weich aufloest, sagt
 * dasselbe wie ein Rollbalken, ohne dass die Plattform mitspielen muss.
 *
 * Ohne Signale, absichtlich: das hier laeuft bei jedem Rollschritt und soll
 * keine Erkennung von Aenderungen ausloesen. Zwei Klassen am DOM sind
 * genau so viel Wirkung, wie gebraucht wird.
 */
/**
 * Liegt links oder rechts noch etwas ausserhalb des Sichtbaren?
 *
 * Eigens herausgezogen, weil an genau einer Zahl etwas haengt: der Toleranz.
 * Rollpositionen sind nicht ganzzahlig — bei einer Zoomstufe von 110 % steht
 * am Ende nicht 0 sondern 0.4 uebrig. Ohne das eine Pixel Spiel flackerte
 * der Verlauf am Rand zwischen an und aus.
 */
export function scrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): { left: boolean; right: boolean } {
  return {
    left: scrollLeft > 1,
    right: scrollWidth - clientWidth - scrollLeft > 1,
  };
}

@Directive({ selector: '[appScrollEdges]' })
export class ScrollEdges implements OnDestroy {
  private readonly scroller = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private watch?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      this.scroller.addEventListener('scroll', this.update, { passive: true });

      // Auch ohne Rollen aendert sich die Lage: das Fenster wird schmaler,
      // eine Spalte wird gezogen, eine Zeile kommt dazu.
      this.watch = new ResizeObserver(this.update);
      this.watch.observe(this.scroller);
      if (this.scroller.firstElementChild) this.watch.observe(this.scroller.firstElementChild);

      this.update();
    });
  }

  ngOnDestroy(): void {
    this.scroller.removeEventListener('scroll', this.update);
    this.watch?.disconnect();
  }

  private readonly update = () => {
    const frame = this.scroller.parentElement;
    if (!frame) return;

    const { left, right } = scrollEdges(
      this.scroller.scrollLeft,
      this.scroller.scrollWidth,
      this.scroller.clientWidth,
    );
    frame.classList.toggle('has-more-left', left);
    frame.classList.toggle('has-more-right', right);
  };
}
