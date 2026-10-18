import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CDK_DRAG_CONFIG, CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';

import { DRAG_START_DELAY, HOLD_TO_DRAG_MS, HoldToDrag } from './hold-to-drag';

@Component({
  imports: [CdkDropList, CdkDrag, CdkDragHandle, HoldToDrag],
  template: `
    <div cdkDropList>
      <div id="row" cdkDrag><span id="row-text">Zeile</span></div>
      <div id="card" cdkDrag>
        <button id="grip" cdkDragHandle>⋮</button>
        <span id="card-text">Karte</span>
      </div>
    </div>
  `,
})
class Host {}

/**
 * jsdom kennt keinen Touch-Konstruktor. Das Ereignis traegt deshalb alle drei
 * Listen von Hand — das CDK haengt mit am selben Element und liest
 * targetTouches und changedTouches, die Direktive touches.
 */
function touch(target: Element, type: string, x = 10, y = 10): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { identifier: 0, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, target };
  const lifted = type === 'touchend' || type === 'touchcancel';
  Object.defineProperty(event, 'touches', { value: lifted ? [] : [point] });
  Object.defineProperty(event, 'targetTouches', { value: lifted ? [] : [point] });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  target.dispatchEvent(event);
}

describe('HoldToDrag', () => {
  let el: (id: string) => HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    // Wie in app.config: ohne diese Einstellung begaenne das CDK den Zug
    // sofort, und genau das war der Fehler.
    TestBed.configureTestingModule({
      providers: [{ provide: CDK_DRAG_CONFIG, useValue: { dragStartDelay: DRAG_START_DELAY } }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = (id) => fixture.nativeElement.querySelector('#' + id);
  });

  afterEach(() => vi.useRealTimers());

  const classes = (id: string) => ['hold-arming', 'hold-armed'].filter((c) => el(id).classList.contains(c));

  it('uses the same hold time for the CDK and for the feedback, two seconds on touch only', () => {
    expect(HOLD_TO_DRAG_MS).toBe(2000);
    expect(DRAG_START_DELAY).toEqual({ touch: HOLD_TO_DRAG_MS, mouse: 0 });
  });

  it('arms while held and reports ready only after the full hold time', () => {
    touch(el('row-text'), 'touchstart');
    expect(classes('row')).toEqual(['hold-arming']);

    vi.advanceTimersByTime(HOLD_TO_DRAG_MS - 1);
    expect(classes('row')).toEqual(['hold-arming']);

    vi.advanceTimersByTime(1);
    expect(classes('row')).toEqual(['hold-arming', 'hold-armed']);
  });

  it('gives up as soon as the finger moves — that is a scroll', () => {
    touch(el('row-text'), 'touchstart', 10, 10);
    touch(el('row-text'), 'touchmove', 10, 30);

    expect(classes('row')).toEqual([]);
    vi.advanceTimersByTime(HOLD_TO_DRAG_MS);
    expect(classes('row')).toEqual([]);
  });

  it('lets a swipe scroll: the CDK does not pick the row up before the hold time', () => {
    const row = el('row');
    touch(el('row-text'), 'touchstart', 10, 10);
    vi.advanceTimersByTime(HOLD_TO_DRAG_MS - 200);
    touch(el('row-text'), 'touchmove', 10, 60);

    expect(row.isConnected).toBe(true);
    expect(row.classList.contains('cdk-drag-dragging')).toBe(false);
    expect(document.querySelector('.cdk-drag-preview')).toBeNull();
  });

  it('tolerates the small wobble of a resting finger', () => {
    touch(el('row-text'), 'touchstart', 10, 10);
    touch(el('row-text'), 'touchmove', 13, 12);
    vi.advanceTimersByTime(HOLD_TO_DRAG_MS);

    expect(classes('row')).toEqual(['hold-arming', 'hold-armed']);
  });

  it('clears everything when the finger lifts', () => {
    touch(el('row-text'), 'touchstart');
    vi.advanceTimersByTime(500);
    touch(el('row-text'), 'touchend');

    expect(classes('row')).toEqual([]);
    vi.advanceTimersByTime(HOLD_TO_DRAG_MS);
    expect(classes('row')).toEqual([]);
  });

  it('with a grip, only a press on the grip counts', () => {
    touch(el('card-text'), 'touchstart');
    expect(classes('card')).toEqual([]);

    touch(el('grip'), 'touchstart');
    expect(classes('card')).toEqual(['hold-arming']);
  });

  it('stops Android from opening a context menu during the hold, and only then', () => {
    const menu = () => {
      const event = new Event('contextmenu', { bubbles: true, cancelable: true });
      el('row-text').dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(menu()).toBe(false);
    touch(el('row-text'), 'touchstart');
    expect(menu()).toBe(true);
  });
});
