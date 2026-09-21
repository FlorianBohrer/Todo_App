import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { UntitledSection, contentKey } from './untitled-sections';

interface SuggestTitleResponse {
  title: string | null;
}

/** Ein Vorschlag samt dem Textstand, für den er gilt. */
interface Suggestion {
  key: string;
  title: string;
}

/**
 * Titelvorschläge für Absätze ohne Überschrift.
 *
 * Der Aufruf läuft über das eigene Backend, nicht direkt gegen Anthropic: ein
 * API-Schlüssel im Browser ist öffentlich, egal wie man ihn dort versteckt.
 *
 * Nichts davon passiert von selbst. Vorschläge kosten Geld und Wartezeit, und
 * ein Editor, der ungefragt an den Text geht, ist ein Ärgernis — es braucht
 * einen Klick.
 */
@Injectable({ providedIn: 'root' })
export class PlanTitleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/plan`;

  /** blockId → Vorschlag. Wird verworfen, sobald sich der Absatz ändert. */
  private readonly suggestions = signal<ReadonlyMap<string, Suggestion>>(new Map());

  /** Läuft gerade eine Anfrage? Treibt den Ladezustand im Panel. */
  readonly busy = signal(false);

  /** null = noch nicht nachgefragt. Danach: kann der Server das überhaupt? */
  private readonly serverReady = signal<boolean | null>(null);
  readonly available = computed(() => this.serverReady() !== false);

  private asked = false;

  /**
   * Einmal nachfragen, ob der Server Vorschläge liefern kann.
   *
   * Ohne das stünde der Abschnitt in der Outline, bis jemand klickt und ins
   * Leere greift — auf einem Server ohne hinterlegten Schlüssel also dauerhaft.
   * Die Anfrage läuft erst, wenn ein Plan überhaupt unbetitelte Absätze hat;
   * wer nie plant, löst sie nie aus.
   */
  checkAvailability(): void {
    if (this.asked) return;
    this.asked = true;

    this.http
      .get<{ available: boolean }>(`${this.baseUrl}/ai/status`)
      .subscribe({
        next: (status) => this.serverReady.set(status.available),
        // Kennt der Server die Route nicht, ist die Antwort dieselbe: kann er nicht.
        error: () => this.serverReady.set(false),
      });
  }

  /** Der Vorschlag zu einem Block — nur, wenn er zum aktuellen Text passt. */
  titleFor(section: UntitledSection): string | null {
    const found = this.suggestions().get(section.id);
    if (!found) return null;
    return found.key === contentKey(section.text) ? found.title : null;
  }

  /** Gibt es für diesen Abschnitt schon etwas? Spart den erneuten Aufruf. */
  private isFresh(section: UntitledSection): boolean {
    return this.titleFor(section) !== null;
  }

  /**
   * Holt Vorschläge für alle übergebenen Abschnitte, die noch keinen haben.
   * Nacheinander statt parallel: ein Plan kann viele Absätze haben, und ein
   * Schwall gleichzeitiger Anfragen bringt niemandem etwas.
   */
  async suggestFor(sections: UntitledSection[]): Promise<void> {
    const open = sections.filter((s) => !this.isFresh(s));
    if (open.length === 0) return;

    this.busy.set(true);
    try {
      for (const section of open) {
        const title = await this.ask(section.text);
        if (title === null) continue;

        const key = contentKey(section.text);
        this.suggestions.update((current) => {
          const next = new Map(current);
          next.set(section.id, { key, title });
          return next;
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Einen Vorschlag vergessen — nach dem Übernehmen oder Verwerfen. */
  forget(blockId: string): void {
    this.suggestions.update((current) => {
      if (!current.has(blockId)) return current;
      const next = new Map(current);
      next.delete(blockId);
      return next;
    });
  }

  private async ask(text: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<SuggestTitleResponse>(`${this.baseUrl}/suggest-title`, { text }),
      );
      this.serverReady.set(true);
      return response.title;
    } catch (error) {
      // 503 heisst: auf diesem Server ist kein Schlüssel hinterlegt. Dann die
      // Funktion ausblenden, statt bei jedem Klick still zu scheitern.
      const status = (error as { status?: number }).status;
      if (status === 503 || status === 404) this.serverReady.set(false);
      else console.error('Titelvorschlag fehlgeschlagen', error);
      return null;
    }
  }
}
