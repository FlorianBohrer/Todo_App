import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject, input, output } from '@angular/core';

/**
 * Meldet, ob ein per CSS gekürzter Text (line-clamp) mehr enthält, als er
 * zeigt. Das Gegenstück zu Autosize für Titel, die nicht im Textfeld stehen,
 * weil sie fett gesetzte Stellen haben: der Knopf zum Aufklappen erscheint
 * dann genauso wie bei jedem anderen langen Titel.
 *
 * Gemessen wird, wenn sich die Grösse ändert (Fensterbreite, Auf- und
 * Zuklappen), wenn ein neuer Text hineinkommt und wenn die Schrift geladen ist.
 */
@Directive({
  selector: '[appClampWatch]',
  standalone: true,
})
export class ClampWatch implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Der angezeigte Text: ändert er sich, wird neu gemessen. */
  readonly appClampWatch = input<string>('');
  /** Ob etwas abgeschnitten ist. Meldet nur Wechsel. */
  readonly clampChange = output<boolean>();

  private over: boolean | null = null;
  private observer?: ResizeObserver;
  private frame = 0;

  constructor() {
    effect(() => {
      this.appClampWatch();
      this.schedule();
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.schedule());
      this.observer.observe(this.el.nativeElement);
    }
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => this.schedule());
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  /** Im nächsten Bild: noch im selben meldete der Beobachter seine eigene Folge. */
  private schedule(): void {
    if (typeof requestAnimationFrame === 'undefined' || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  private measure(): void {
    const el = this.el.nativeElement;
    // Ausgeblendet misst alles 0: dann ist nichts zu sagen.
    if (!el.isConnected || el.clientHeight === 0) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    if (over === this.over) return;
    this.over = over;
    this.clampChange.emit(over);
  }
}
