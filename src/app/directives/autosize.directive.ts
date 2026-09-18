import {
  Directive,
  ElementRef,
  HostListener,
  AfterViewInit,
  inject,
} from '@angular/core';

/**
 * Textarea wächst mit dem Inhalt.
 *
 * Die Messung ist unvermeidlich teuer: erst `height = auto` schreiben, dann
 * `scrollHeight` lesen — das Lesen zwingt den Browser, das Layout sofort neu
 * zu rechnen. Beim Tippen ist das ein Element und damit belanglos.
 *
 * Beim ersten Rendern der Liste nicht: dort hängt an JEDER Zeile eine solche
 * Textarea, und schreiben-lesen-schreiben nacheinander heißt ein Layout pro
 * Zeile. Deshalb laufen die Startmessungen gesammelt — erst alle Schreibzugriffe,
 * dann alle Lesezugriffe, dann alle Höhen. Das ist ein Layout statt n.
 */
@Directive({
  selector: 'textarea[appAutosize]',
  standalone: true,
})
export class Autosize implements AfterViewInit {
  private el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  private static pending: Autosize[] = [];
  private static scheduled = false;

  ngAfterViewInit() {
    Autosize.pending.push(this);
    if (Autosize.scheduled) return;

    Autosize.scheduled = true;
    queueMicrotask(() => Autosize.flush());
  }

  private static flush() {
    const items = Autosize.pending;
    Autosize.pending = [];
    Autosize.scheduled = false;

    // Drei Durchläufe statt drei Schritte pro Element: die Lesephase löst
    // genau ein Layout aus, weil vorher nichts mehr geschrieben wird.
    for (const item of items) item.el.nativeElement.style.height = 'auto';
    const heights = items.map((item) => item.el.nativeElement.scrollHeight);
    items.forEach((item, i) => {
      item.el.nativeElement.style.height = `${heights[i]}px`;
    });
  }

  /** Beim Tippen: ein Element, ein Layout — hier lohnt kein Sammeln. */
  @HostListener('input') resize() {
    const ta = this.el.nativeElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
}
