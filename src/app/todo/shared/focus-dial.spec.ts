import { angleAt, angleFor, arcPath, clock, minutesAt } from './focus-dial';

describe('focus dial', () => {
  it('measures clockwise from the top', () => {
    expect(angleAt(100, 100, 100, 0)).toBeCloseTo(0);
    expect(angleAt(100, 100, 200, 100)).toBeCloseTo(90);
    expect(angleAt(100, 100, 100, 200)).toBeCloseTo(180);
    expect(angleAt(100, 100, 0, 100)).toBeCloseTo(270);
  });

  it('snaps to five minutes and stays between 5 and 60', () => {
    expect(minutesAt(90, 25)).toBe(15);
    expect(minutesAt(100, 25)).toBe(15);
    expect(minutesAt(182, 25)).toBe(30);
    expect(minutesAt(5, 10)).toBe(5);
  });

  it('decides at the top by where the hand came from', () => {
    expect(minutesAt(358, 55)).toBe(60);
    expect(minutesAt(2, 5)).toBe(5);
  });

  it('draws an arc, and a full circle at 60', () => {
    expect(angleFor(15)).toBe(90);
    expect(arcPath(50, 50, 40, 0)).toBe('');
    expect(arcPath(50, 50, 40, 90)).toBe('M 50 10 A 40 40 0 0 1 90.00 50.00');
    expect(arcPath(50, 50, 40, 360)).toContain('A 40 40 0 1 1 50 90');
  });

  it('shows minutes and seconds', () => {
    expect(clock(1500)).toBe('25:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(0.2)).toBe('0:01');
    expect(clock(-3)).toBe('0:00');
  });
});
