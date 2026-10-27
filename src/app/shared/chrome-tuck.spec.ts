import { TuckState, shouldTuck } from './chrome-tuck';

const base: TuckState = {
  scrollY: 400,
  travel: 0,
  hoverCapable: true,
  hovering: false,
  focused: false,
  overlayOpen: false,
  tucked: false,
};

describe('shouldTuck', () => {
  it('never tucks at the top of the page', () => {
    expect(shouldTuck({ ...base, scrollY: 10, travel: 200 })).toBe(false);
  });

  it('with a pointer: tucked unless the pointer is at the top', () => {
    expect(shouldTuck(base)).toBe(true);
    expect(shouldTuck({ ...base, hovering: true })).toBe(false);
  });

  it('with a pointer: scrolling up alone does not bring it back', () => {
    expect(shouldTuck({ ...base, tucked: true, travel: -300 })).toBe(true);
  });

  it('without a pointer: hides scrolling down, shows scrolling up', () => {
    const touch = { ...base, hoverCapable: false };
    expect(shouldTuck({ ...touch, travel: 30 })).toBe(true);
    expect(shouldTuck({ ...touch, tucked: true, travel: -20 })).toBe(false);
    // Small jitter keeps the current state.
    expect(shouldTuck({ ...touch, tucked: true, travel: -5 })).toBe(true);
    expect(shouldTuck({ ...touch, tucked: false, travel: 10 })).toBe(false);
  });

  it('stays while keyboard focus is in it or one of its menus is open', () => {
    expect(shouldTuck({ ...base, focused: true })).toBe(false);
    expect(shouldTuck({ ...base, overlayOpen: true })).toBe(false);
  });
});
