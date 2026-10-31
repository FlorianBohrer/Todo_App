import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

/** Derselbe Schlüssel steht im Skript in index.html, das vor dem ersten Bild läuft. */
export const THEME_KEY = 'theme';

/** Die Farbe der Browserleiste auf dem Telefon: der Seitengrund (--color-bg2). */
const BAR_COLOR: Record<Theme, string> = { dark: '#16171F', light: '#F3F2F8' };

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(choice: ThemeChoice, systemLight: boolean): Theme {
  return choice === 'system' ? (systemLight ? 'light' : 'dark') : choice;
}

/**
 * Hell oder dunkel. Dunkel ist der Standard — wer nichts wählt, sieht die App
 * wie bisher. „System" folgt der Einstellung des Geräts, auch während die
 * Seite offen ist.
 *
 * Das Theme steht als data-theme am <html>; die Farben dazu in styles.scss
 * („Hell"). index.html setzt es schon vor Angular, damit beim Laden kein
 * dunkles Bild aufblitzt, bevor das helle kommt.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(readThemeChoice());

  private readonly systemLight = signal(false);
  readonly theme = computed(() => resolveTheme(this.choice(), this.systemLight()));

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-color-scheme: light)');
      this.systemLight.set(query.matches);
      query.addEventListener('change', (event) => this.systemLight.set(event.matches));
    }

    effect(() => {
      const theme = this.theme();
      document.documentElement.dataset['theme'] = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
    });
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      /* Ohne Speicher gilt die Wahl bis zum Neuladen. */
    }
  }
}
