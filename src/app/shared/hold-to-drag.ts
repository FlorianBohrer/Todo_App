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
 * Zwei Sekunden passieren nicht aus Versehen. Mit der Maus bleibt es fuer
 * Folder, Plaene und Bloecke, wie es war: dort gibt es kein Scrollen mit
 * derselben Geste. Todos halten auch mit der Maus zwei Sekunden
 * (TODO_DRAG_START_DELAY): ein Klick in die Zeile, ein kurzes Festhalten beim
 * Lesen soll nichts verschieben.
 *
 * Die Zahl gilt app-weit (CDK_DRAG_CONFIG in app.config). Die Rueckmeldung
 * liest die Wartezeit am cdkDrag selbst ab, damit Rand und CDK nie
 * auseinanderlaufen — auch dort, wo eine Ansicht kuerzer wartet
 * (BOARD_DRAG_START_DELAY in der Woche).
 */
export const HOLD_TO_DRAG_MS = 2000;

export const DRAG_START_DELAY = { touch: HOLD_TO_DRAG_MS, mouse: 0 };

/** Todos in der Liste: zwei Sekunden halten, mit dem Finger wie mit der Maus. */
export const TODO_DRAG_START_DELAY = { touch: HOLD_TO_DRAG_MS, mouse: HOLD_TO_DRAG_MS };

/**
 * Die Woche ist ein Brett: Karten zwischen Tagen zu ziehen ist dort die
 * Hauptsache, nicht ein Versehen, vor dem man sich schützen müsste.
 *
 * Mit der Maus sofort — das CDK fängt erst nach 5px Bewegung an, ein Klick
 * bleibt ein Klick und öffnet den Kalender der Karte. Mit dem Finger ein
 * langes Drücken, so lang wie das System selbst eines versteht (iOS und
 * Android liegen um 0,5 s): wer sofort wischt, scrollt, wer kurz hält, zieht.
 */
export const BOARD_DRAG_START_DELAY = { touch: 450, mouse: 0 };

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
 * Mit der Maus dasselbe, wo das Objekt auch mit der Maus warten muss
 * (cdkDragStartDelay mit mouse > 0): sonst wuerde der Rand bei jedem Klick
 * aufleuchten, obwohl das CDK sofort zieht.
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

    /**
     * Der Rand fuellt sich in genau der Zeit, die das CDK wartet: ein Fuenftel
     * Vorlauf (ein Wischen soll nichts aufblitzen lassen), der Rest Fuellen.
     * Bei zwei Sekunden sind das die 0,4 + 1,6 s, mit denen styles.scss
     * rechnet, wenn nichts gesetzt ist.
     */
    const arm = (x: number, y: number, ms: number) => {
      this.reset();
      this.active = true;
      this.startX = x;
      this.startY = y;
      host.style.setProperty('--hold-lead', `${Math.round(ms * 0.2)}ms`);
      host.style.setProperty('--hold-fill', `${Math.round(ms * 0.8)}ms`);
      host.classList.add('hold-arming');
      this.timer = setTimeout(() => {
        if (!this.active) return;
        host.classList.add('hold-armed');
        holdArmed();
      }, ms);
    };

    /** Was das CDK fuer diese Eingabeart wartet. */
    const delayFor = (kind: 'touch' | 'mouse') => {
      const delay = drag.dragStartDelay;
      return typeof delay === 'number' ? delay : (delay?.[kind] ?? 0);
    };

    /** Wandert der Zeiger vor dem Ende des Haltens, war es kein Halten. */
    const track = (x: number, y: number) => {
      if (!this.active || host.classList.contains('hold-armed')) return;
      const moved = Math.abs(x - this.startX) + Math.abs(y - this.startY);
      if (moved > MOVE_TOLERANCE) this.reset();
    };

    const onStart = (event: TouchEvent) => {
      const ms = delayFor('touch');
      if (event.touches.length !== 1 || ms <= 0 || !this.ownsTouch(event.target)) {
        this.reset();
        return;
      }
      arm(event.touches[0].clientX, event.touches[0].clientY, ms);
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) track(touch.clientX, touch.clientY);
    };

    const onEnd = () => this.reset();

    // Maus: nur, wo auch die Maus warten muss.
    const onMouseMove = (event: MouseEvent) => track(event.clientX, event.clientY);
    const onMouseUp = () => {
      this.reset();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (event: MouseEvent) => {
      // Ein Touch-Geraet meldet nach dem Tippen auch ein mousedown; das
      // Halten laeuft dann schon ueber die Touch-Ereignisse.
      const ms = delayFor('mouse');
      if (event.button !== 0 || this.active || ms <= 0 || !this.ownsTouch(event.target)) return;
      arm(event.clientX, event.clientY, ms);
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mouseup', onMouseUp);
    };

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
      host.addEventListener('mousedown', onMouseDown);
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
      host.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
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
