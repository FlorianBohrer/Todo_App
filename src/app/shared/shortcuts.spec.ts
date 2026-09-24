import {
  Binding,
  DEFAULT_BINDINGS,
  bindingFromEvent,
  findConflict,
  formatBinding,
  matches,
  mergeBindings,
  sameBinding,
} from './shortcuts';

function key(k: string, mods: Partial<Omit<Binding, 'key'>> = {}): KeyboardEvent {
  return {
    key: k,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  } as KeyboardEvent;
}

const B = (k: string, mods: Partial<Omit<Binding, 'key'>> = {}): Binding => ({
  key: k,
  meta: mods.meta ?? false,
  ctrl: mods.ctrl ?? false,
  shift: mods.shift ?? false,
  alt: mods.alt ?? false,
});

describe('matches', () => {
  it('matches a plain key', () => {
    expect(matches(B('f'), key('f'))).toBe(true);
  });

  it('ignores the case of the pressed key', () => {
    expect(matches(B('f'), key('F'))).toBe(true);
  });

  it('checks every modifier, not only the required ones', () => {
    // Ohne diese Strenge loeste ⌘⇧B auch bei ⇧B aus, und ein grosses B zu
    // schreiben wuerde Text fett machen.
    expect(matches(B('b', { meta: true, shift: true }), key('b', { shift: true }))).toBe(false);
    expect(matches(B('b'), key('b', { meta: true }))).toBe(false);
    expect(matches(B('b'), key('b', { alt: true }))).toBe(false);
  });

  it('matches when every modifier lines up', () => {
    expect(
      matches(B('b', { meta: true, shift: true }), key('B', { meta: true, shift: true })),
    ).toBe(true);
  });
});

describe('bindingFromEvent', () => {
  it('builds a binding from a press', () => {
    expect(bindingFromEvent(key('K', { meta: true }))).toEqual(B('k', { meta: true }));
  });

  it('refuses a modifier on its own', () => {
    // Man haelt sie gedrueckt, waehrend man die eigentliche Taste sucht.
    for (const k of ['Shift', 'Control', 'Meta', 'Alt']) {
      expect(bindingFromEvent(key(k, { shift: true }))).toBeNull();
    }
  });

  it('refuses keys the dialog and the browser need', () => {
    expect(bindingFromEvent(key('Escape'))).toBeNull();
    expect(bindingFromEvent(key('Tab'))).toBeNull();
  });
});

describe('formatBinding', () => {
  it('orders the modifiers the way a keyboard does', () => {
    expect(formatBinding(B('b', { meta: true, shift: true, alt: true, ctrl: true })))
      .toEqual(['⌃', '⌥', '⇧', '⌘', 'B']);
  });

  it('names the keys that have no printable glyph', () => {
    expect(formatBinding(B('arrowleft'))).toEqual(['←']);
    expect(formatBinding(B('enter'))).toEqual(['↵']);
  });
});

describe('findConflict', () => {
  it('names the action that already holds the key', () => {
    expect(findConflict(DEFAULT_BINDINGS, 'view.week', B('f'))).toBe('folders.toggle');
  });

  it('does not report a conflict with itself', () => {
    expect(
      findConflict(DEFAULT_BINDINGS, 'folders.toggle', DEFAULT_BINDINGS['folders.toggle']),
    ).toBeNull();
  });

  it('reports nothing for a free key', () => {
    expect(findConflict(DEFAULT_BINDINGS, 'view.list', B('q', { alt: true }))).toBeNull();
  });
});

describe('mergeBindings', () => {
  it('falls back to the defaults for anything missing', () => {
    const merged = mergeBindings({ 'view.list': B('7') });
    expect(merged['view.list']).toEqual(B('7'));
    // Eine Handlung, die der gespeicherte Stand noch nicht kannte, darf nicht
    // ohne Kuerzel dastehen.
    expect(merged['view.week']).toEqual(DEFAULT_BINDINGS['view.week']);
  });

  it('ignores stored junk instead of breaking every shortcut', () => {
    expect(mergeBindings(null)).toEqual(DEFAULT_BINDINGS);
    expect(mergeBindings('kaputt')).toEqual(DEFAULT_BINDINGS);
    expect(mergeBindings({ 'view.list': { key: 5 } })['view.list']).toEqual(
      DEFAULT_BINDINGS['view.list'],
    );
  });
});

describe('DEFAULT_BINDINGS', () => {
  it('has no duplicate among the defaults', () => {
    const actions = Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[];
    for (const action of actions) {
      expect(findConflict(DEFAULT_BINDINGS, action, DEFAULT_BINDINGS[action])).toBeNull();
    }
  });

  it('keeps the formatting keys out of the browser’s way', () => {
    // ⌘U oeffnet je nach Browser den Quelltext, ⌘I verschickt die Seite.
    // Deshalb tragen alle vier zusaetzlich die Umschalttaste.
    for (const action of ['format.bold', 'format.italic', 'format.underline', 'format.strike'] as const) {
      expect(DEFAULT_BINDINGS[action].shift).toBe(true);
      expect(DEFAULT_BINDINGS[action].meta).toBe(true);
    }
  });
});

describe('sameBinding', () => {
  it('compares every field', () => {
    expect(sameBinding(B('b', { meta: true }), B('b', { meta: true }))).toBe(true);
    expect(sameBinding(B('b', { meta: true }), B('b', { meta: true, shift: true }))).toBe(false);
  });
});
