import { TYPING_GAP, TYPING_RUN, continuesRun } from './edit-history';

const run = (key: string | null, at: number, since = at) => ({ key, at, since });

describe('continuesRun', () => {
  it('folds the next keystroke in the same spot into the same step', () => {
    expect(continuesRun(run('text:a', 1000), 'text:a', 1100)).toBe(true);
  });

  it('starts a new step after a pause', () => {
    // Wer absetzt, hat einen Gedanken beendet — genau dort will man zurueck.
    expect(continuesRun(run('text:a', 1000), 'text:a', 1000 + TYPING_GAP)).toBe(false);
  });

  it('starts a new step in a different spot', () => {
    expect(continuesRun(run('text:a', 1000), 'text:b', 1050)).toBe(false);
  });

  it('breaks up a long uninterrupted run', () => {
    // Sonst nimmt ein Rueckgaengig einen ganzen Absatz mit.
    const started = 1000;
    const late = started + TYPING_RUN + 1;
    expect(continuesRun(run('text:a', late - 10, started), 'text:a', late)).toBe(false);
  });

  it('never folds a structural change', () => {
    // Block teilen, loeschen, umwandeln: jedes fuer sich zurueckzunehmen ist
    // der ganze Sinn der Sache.
    expect(continuesRun(run('text:a', 1000), null, 1010)).toBe(false);
    expect(continuesRun(null, 'text:a', 1010)).toBe(false);
  });
});
