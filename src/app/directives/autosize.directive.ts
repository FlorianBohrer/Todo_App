import {
  Directive,
  ElementRef,
  HostListener,
  AfterViewInit,
  Injector,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  afterNextRender,
  inject,
  input,
  output,
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
 * Zeile. Deshalb laufen die Messungen gesammelt — erst alle Schreibzugriffe,
 * dann alle Lesezugriffe, dann alle Höhen. Das ist ein Layout statt n.
 *
 * Gemessen wurde bisher nur beim Erscheinen und beim Tippen. Wurde das
 * Fenster breiter, blieb eine leere zweite Zeile stehen; wurde es schmaler,
 * war das Ende abgeschnitten. Und die erste Messung lief oft noch mit der
 * Ersatzschrift, die anders umbricht als die eigentliche. Jetzt misst die
 * Textarea neu, wenn sich ihre Breite ändert, wenn die Schrift geladen ist
 * und wenn ein neuer Text hineingebunden wird.
 */
@Directive({
  selector: 'textarea[appAutosize]',
  standalone: true,
})
export class Autosize implements AfterViewInit, OnChanges, OnDestroy {
  private el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private injector = inject(Injector);

  /** Optional der Text, der hineingebunden wird: ändert er sich, wird neu gemessen. */
  readonly appAutosize = input<string>('');

  /**
   * Ob der Text über die Höchsthöhe aus dem CSS (max-height) hinausgeht —
   * also ob etwas abgeschnitten ist. Meldet nur Wechsel.
   */
  readonly autosizeOverflow = output<boolean>();

  private overflowing = false;
  private width = -1;
  private observer?: ResizeObserver;

  private static live = new Set<Autosize>();
  private static pending: Autosize[] = [];
  private static scheduled = false;
  private static fontsWatched = false;

  ngAfterViewInit() {
    Autosize.live.add(this);
    Autosize.queue(this);

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0].contentRect.width);
        // Nur die Breite zählt: die Höhe ändern wir selbst.
        if (width === 0 || width === this.width) return;
        Autosize.queue(this);
      });
      this.observer.observe(this.el.nativeElement);
    }

    Autosize.watchFonts();
  }

  ngOnChanges(changes: SimpleChanges) {
    const change = changes['appAutosize'];
    if (!change || change.firstChange) return;
    // Erst wenn der neue Wert im Feld steht.
    afterNextRender(() => Autosize.queue(this), { injector: this.injector });
  }

  ngOnDestroy() {
    Autosize.live.delete(this);
    this.observer?.disconnect();
  }

  private static queue(item: Autosize) {
    if (!Autosize.pending.includes(item)) Autosize.pending.push(item);
    if (Autosize.scheduled) return;
    Autosize.scheduled = true;
    queueMicrotask(() => Autosize.flush());
  }

  /** Einmal pro Seite: sobald die Schrift da ist, alle neu messen. */
  private static watchFonts() {
    if (Autosize.fontsWatched || typeof document === 'undefined' || !document.fonts) return;
    Autosize.fontsWatched = true;
    document.fonts.ready.then(() => {
      for (const item of Autosize.live) Autosize.queue(item);
    });
  }

  private static flush() {
    const items = Autosize.pending;
    Autosize.pending = [];
    Autosize.scheduled = false;

    // Drei Durchläufe statt drei Schritte pro Element: die Lesephase löst
    // genau ein Layout aus, weil vorher nichts mehr geschrieben wird.
    for (const item of items) item.el.nativeElement.style.height = 'auto';
    const sizes = items.map((item) => item.read());
    items.forEach((item, i) => item.apply(sizes[i]));
  }

  private read() {
    const ta = this.el.nativeElement;
    return {
      height: ta.scrollHeight,
      width: Math.round(ta.clientWidth),
      max: parseFloat(getComputedStyle(ta).maxHeight),
    };
  }

  private apply(size: { height: number; width: number; max: number }) {
    this.el.nativeElement.style.height = `${size.height}px`;
    this.width = size.width;
    // Ausgeblendet (display: none) misst alles 0: dann ist nichts abgeschnitten.
    const over = size.height > 0 && Number.isFinite(size.max) && size.height > size.max + 1;
    if (over !== this.overflowing) {
      this.overflowing = over;
      this.autosizeOverflow.emit(over);
    }
  }

  /** Beim Tippen: ein Element, ein Layout — hier lohnt kein Sammeln. */
  @HostListener('input') resize() {
    const ta = this.el.nativeElement;
    ta.style.height = 'auto';
    this.apply(this.read());
  }
}
