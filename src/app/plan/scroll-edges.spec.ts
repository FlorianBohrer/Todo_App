import { scrollEdges } from './scroll-edges.directive';

describe('scrollEdges', () => {
  it('says nothing when everything fits', () => {
    expect(scrollEdges(0, 600, 600)).toEqual({ left: false, right: false });
  });

  it('points right while there is more to the right', () => {
    expect(scrollEdges(0, 1200, 600)).toEqual({ left: false, right: true });
  });

  it('points left once you have scrolled away from the start', () => {
    expect(scrollEdges(300, 1200, 600)).toEqual({ left: true, right: true });
  });

  it('points only left at the very end', () => {
    expect(scrollEdges(600, 1200, 600)).toEqual({ left: true, right: false });
  });

  it('does not flicker on a fraction of a pixel', () => {
    // Bei 110 % Zoom bleibt am Ende nicht 0 uebrig, sondern ein Rest unter
    // einem Pixel. Ohne die Toleranz stuende der Verlauf dauerhaft da.
    expect(scrollEdges(0.4, 1200.6, 1200)).toEqual({ left: false, right: false });
  });
});
