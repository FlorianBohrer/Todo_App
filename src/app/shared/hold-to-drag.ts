import { DestroyRef, Directive, ElementRef, NgZone, inject } from '@angular/core';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { holdArmed } from '../todo/shared/haptics';

/**
 * Auf dem Telefon wird erst nach zwei Sekunden Halten verschoben.
 *
 * Vorher reichten 300ms in der Liste und gar keine Wartezeit an den Griffen
 * der Folder, Plaene und Bloecke. Wer scrollen wollte, verschob dabei immer
 * wieder etwas: der Finger setzt auf, haelt kurz an — um eine laufende
 * Bewegung zu stoppen, oder einfach beim Lesen — und wischt dann weiter.
 * Genau das sah fuer das CDK aus wie „halten, dann ziehen".
 *
 * Zwei Sekunden passieren nicht aus Versehen. Mit der Maus bleibt alles, wie
 * es war: dort gibt es kein Scrollen mit derselben Geste.
 *
 * Die Zahl gilt app-weit (CDK_DRAG_CONFIG in app.config) und hier fuer die
 * Rueckmeldung — beide muessen dieselbe sein, sonst meldet der Rand
 * „jetzt", waehrend das CDK noch wartet. Der Rand in styles.scss
 * (.hold-arming) rechnet mit 0,4 s Vorlauf + 1,6 s Fuellen = 2 s; wer die
 * Zahl hier aendert, aendert sie dort mit.
 */
export const HOLD_TO_DRAG_MS = 2000;

export const DRAG_START_DELAY = { touch: HOLD_TO_DRAG_MS, mouse: 0 };

/**
 * So weit darf der Finger waehrend des Haltens wandern. Daruebergehend ist es
 * ein Wischen; das CDK bricht dann ebenfalls ab (es rechnet mit 5px).
 */
const MOVE_TOLERANCE = 8;

/**
 * Die Rueckmeldung zum Halten.
 *
 * Zwei Sekunden ohne Antwort fuehlen sich an wie „geht nicht". Deshalb
 * zeichnet sich waehrend des Haltens ein Rand um das Objekt (hold-arming,
 * styles.scss), und wenn es so weit ist, wird er voll und das Telefon gibt
 * einen kurzen Impuls (hold-armed). Erst dann bewegt man den Finger.
 *
 * Haengt an jedem cdkDrag der Komponenten, die sie importieren. Hat das
 * Objekt Griffe, zaehlt nur ein Druck auf den eigenen Griff — wie beim CDK.
 * Alles laeuft ausserhalb der Aenderungserkennung: touchmove feuert bei jedem
 * Scrollbild, und dafuer muss Angular nicht jedes Mal nachsehen.
 */
@Directive({ selector: '[cdkDrag]' })
export class HoldToDrag {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private startX = 0;
  private startY = 0;

  constructor() {
    const host = this.host;
    const zone = inject(NgZone);
    const drag = inject(CdkDrag, { self: true });

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !this.ownsTouch(event.target)) {
        this.reset();
        return;
      }
      this.reset();
      this.active = true;
      this.startX = event.touches[0].clientX;
      this.startY = event.touches[0].clientY;
      host.classList.add('hold-arming');
      this.timer = setTimeout(() => {
        if (!this.active) return;
        host.classList.add('hold-armed');
        holdArmed();
      }, HOLD_TO_DRAG_MS);
    };

    const onMove = (event: TouchEvent) => {
      if (!this.active || host.classList.contains('hold-armed')) return;
      const touch = event.touches[0];
      if (!touch) return;
      const moved = Math.abs(touch.clientX - this.startX) + Math.abs(touch.clientY - this.startY);
      if (moved > MOVE_TOLERANCE) this.reset();
    };

    const onEnd = () => this.reset();

    // Ein langes Druecken oeffnet auf Android sonst das Kontextmenue bzw. die
    // Textauswahl — und bricht damit den Zug ab, bevor er anfaengt.
    const onContextMenu = (event: Event) => {
      if (this.active) event.preventDefault();
    };

    zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', onStart, { passive: true });
      host.addEventListener('touchmove', onMove, { passive: true });
      host.addEventListener('touchend', onEnd, { passive: true });
      host.addEventListener('touchcancel', onEnd, { passive: true });
      host.addEventListener('contextmenu', onContextMenu);
    });

    // Sobald der Zug laeuft, uebernimmt die Vorschau des CDK.
    const started = drag.started.subscribe(() => this.reset());
    const released = drag.released.subscribe(() => this.reset());

    inject(DestroyRef).onDestroy(() => {
      this.reset();
      started.unsubscribe();
      released.unsubscribe();
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      host.removeEventListener('touchcancel', onEnd);
      host.removeEventListener('contextmenu', onContextMenu);
    });
  }

  /**
   * Gilt dieser Druck diesem Objekt?
   *
   * Ohne Griffe: wenn es das innerste verschiebbare Objekt unter dem Finger
   * ist. Mit Griffen: nur auf einem eigenen Griff — ein Folder in einer
   * verschiebbaren Sammlung soll nicht die Sammlung mit aufleuchten lassen.
   */
  private ownsTouch(target: EventTarget | null): boolean {
    const host = this.host;
    if (!(target instanceof Element) || host.classList.contains('cdk-drag-disabled')) return false;

    const ownHandles = Array.from(host.querySelectorAll('.cdk-drag-handle')).filter(
      (handle) => handle.closest('.cdk-drag') === host,
    );
    if (ownHandles.length === 0) return target.closest('.cdk-drag') === host;

    const handle = target.closest('.cdk-drag-handle');
    return handle !== null && handle.closest('.cdk-drag') === host;
  }

  private reset(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.active = false;
    this.host.classList.remove('hold-arming', 'hold-armed');
  }
}
