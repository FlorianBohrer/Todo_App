import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { LucideAngularModule, ChevronLeft, ChevronRight, CalendarX } from 'lucide-angular';
import {
  longDateLabel,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shiftMonthKeepDay,
} from '../../shared/calendar';
import { scheduleOptions } from '../../shared/schedule';
import { fromISODate, shiftISODate, startOfWeekISO, todayISO } from '../../shared/week';

const WEEKDAYS = [
  { short: 'M', long: 'Monday' },
  { short: 'T', long: 'Tuesday' },
  { short: 'W', long: 'Wednesday' },
  { short: 'T', long: 'Thursday' },
  { short: 'F', long: 'Friday' },
  { short: 'S', long: 'Saturday' },
  { short: 'S', long: 'Sunday' },
];

/**
 * Ein Datum wählen: oben die vier Angebote, die man fast immer meint, darunter
 * ein Monatsblatt für alles andere.
 *
 * Bisher gab es nur die Angebote. Ein Termin in drei Wochen ging nirgends,
 * in der Woche nur per Ziehen, und auch das nur bis zum Sonntag.
 *
 * Tastatur wie in jedem Kalender: Pfeile tagweise und wochenweise, Pos1/Ende
 * an Wochenanfang und -ende, Bild auf/ab einen Monat, Enter wählt. Nur der
 * Tag unter dem Fokus ist per Tab erreichbar, sonst wären es 42 Tabstopps.
 */
@Component({
  selector: 'app-date-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.scss',
})
export class DatePicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Der gesetzte Termin, 'YYYY-MM-DD'; null, wenn es keinen gibt. */
  readonly value = input<string | null>(null);
  /** Die vier Schnellwahlen oben. Aus, wo sie schon daneben stehen. */
  readonly presets = input(true);
  /** „Remove date" anbieten, sobald ein Termin gesetzt ist. */
  readonly clearable = input(true);
  /**
   * Beim Öffnen den Fokus auf den Tag legen. Für Menüs, die man auch per
   * Tastatur öffnet: sonst stünde man nach Enter vor einem Blatt und müsste
   * erst hineintabben. Nach einem Klick zeigt der Browser dabei keinen Ring.
   */
  readonly autofocus = input(false);

  readonly picked = output<string | null>();

  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly ClearIcon = CalendarX;
  protected readonly weekdays = WEEKDAYS;

  /** Einmal beim Öffnen: ein Blatt, das über Mitternacht offen bleibt, ist selten. */
  protected readonly today = todayISO();
  protected readonly options = scheduleOptions(this.today);

  /** Der Tag, auf dem der Tastaturfokus liegt (und der als einziger tabbar ist). */
  protected readonly focusIso = linkedSignal(() => this.value() ?? this.today);
  /** Der angezeigte Monat: der des Termins, sonst der laufende. */
  protected readonly view = linkedSignal(() => monthOf(this.value() ?? this.today));

  protected readonly weeks = computed(() => monthGrid(this.view(), this.today));
  protected readonly title = computed(() => monthLabel(this.view()));

  constructor() {
    afterNextRender(() => {
      if (!this.autofocus()) return;
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-iso="${this.focusIso()}"]`)
        ?.focus({ preventScroll: true });
    });
  }

  /** „Sat 14" neben „Weekend": man sieht, welcher Tag gemeint ist, bevor man tippt. */
  protected hint(iso: string): string {
    const d = fromISODate(iso);
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`;
  }

  protected longLabel(iso: string): string {
    return longDateLabel(iso);
  }

  protected pick(iso: string | null): void {
    this.picked.emit(iso);
  }

  /** Blättern nimmt den Fokus-Tag mit, damit Tab im neuen Monat einen Tag findet. */
  protected page(by: number): void {
    this.view.update((ref) => shiftMonth(ref, by));
    this.focusIso.update((iso) => shiftMonthKeepDay(iso, by));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const current = this.focusIso();
    let next: string | null = null;
    switch (event.key) {
      // Enter wählt den Tag, auf dem der Fokus logisch steht. Tippt man
      // schnell (→ ↓ Enter), ist der DOM-Fokus womöglich noch nicht
      // nachgezogen, und der Klick träfe den alten Tag.
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        this.pick(current);
        return;
      case 'ArrowLeft':
        next = shiftISODate(current, -1);
        break;
      case 'ArrowRight':
        next = shiftISODate(current, 1);
        break;
      case 'ArrowUp':
        next = shiftISODate(current, -7);
        break;
      case 'ArrowDown':
        next = shiftISODate(current, 7);
        break;
      case 'Home':
        next = startOfWeekISO(current);
        break;
      case 'End':
        next = shiftISODate(startOfWeekISO(current), 6);
        break;
      case 'PageUp':
        next = shiftMonthKeepDay(current, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = shiftMonthKeepDay(current, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    // Nicht weiterreichen: die Woche blättert sonst mit denselben Pfeilen.
    event.preventDefault();
    event.stopPropagation();
    this.focusIso.set(next);
    this.view.set(monthOf(next));
    const focus = () =>
      this.host.nativeElement.querySelector<HTMLElement>(`[data-iso="${next}"]`)?.focus();
    // Steht der Tag schon im Blatt, sofort; im Nachbarmonat erst nach dem Zeichnen.
    if (this.host.nativeElement.querySelector(`[data-iso="${next}"]`)) focus();
    else afterNextRender(focus, { injector: this.injector });
  }
}
