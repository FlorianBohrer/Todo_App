import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { UntitledSection, contentKey } from './untitled-sections';

interface SuggestTitleResponse {
  title: string | null;
}

/** Warum die Funktion aus ist — siehe AiStatusReason im Backend. */
export type AiStatusReason = 'ok' | 'no-key' | 'storage' | 'unreachable';

interface AiStatusResponse {
  available: boolean;
  remaining: number;
  limit: number;
  reason: AiStatusReason;
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

  /**
   * Wie viele Vorschläge heute noch übrig sind; null = unbekannt.
   *
   * Vorschläge kosten Geld, deshalb hat jeder Nutzer ein Tageskontingent.
   * Ist es aufgebraucht, muss man das sehen — sonst sieht ein erreichtes
   * Limit aus wie ein kaputter Knopf.
   */
  readonly remaining = signal<number | null>(null);
  readonly exhausted = computed(() => this.remaining() === 0);

  /** null = noch nicht nachgefragt. Danach: kann der Server das überhaupt? */
  private readonly serverReady = signal<boolean | null>(null);
  readonly available = computed(() => this.serverReady() !== false);

  /**
   * Der Grund, falls die Funktion aus ist. null = noch nicht gefragt.
   *
   * Ohne ihn sieht jeder Ausfall gleich aus — die Funktion erscheint einfach
   * nicht. Beim Einrichten kostet das Stunden, weil sich „kein Schlüssel",
   * „Tabelle fehlt" und „laeuft, aber der Absatz ist zu kurz" nicht
   * unterscheiden lassen.
   */
  readonly reason = signal<AiStatusReason | null>(null);

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
      .get<AiStatusResponse>(`${this.baseUrl}/ai/status`)
      .subscribe({
        next: (status) => {
          this.serverReady.set(status.available);
          this.remaining.set(status.remaining);
          // Ältere Backends kennen das Feld nicht — dann bleibt es bei „ok".
          this.reason.set(status.reason ?? 'ok');
        },
        // Kennt der Server die Route nicht, ist die Antwort dieselbe: kann er nicht.
        error: () => {
          this.serverReady.set(false);
          this.reason.set('unreachable');
        },
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
        // Am Limit hat jeder weitere Durchlauf nur noch abgelehnte Anfragen
        // zur Folge — also gar nicht erst schicken.
        if (this.exhausted()) break;

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

  /**
   * Eine Ueberschrift fuer einen Absatz holen — der Weg fuers automatische
   * Setzen beim Verlassen des Blocks.
   *
   * Merkt sich das Ergebnis am Textinhalt: wer denselben Absatz erneut
   * anfasst, ohne etwas zu aendern, loest keine zweite Anfrage aus. Am
   * erschoepften Tageskontingent wird gar nicht erst gefragt.
   */
  async fetchTitle(text: string): Promise<string | null> {
    if (this.exhausted() || !this.available()) return null;

    const key = contentKey(text);
    const cached = this.byContent.get(key);
    if (cached !== undefined) return cached;

    this.busy.set(true);
    try {
      const title = await this.ask(text);
      // Auch ein „nichts gefunden" wird gemerkt, sonst fragt jeder weitere
      // Fokuswechsel auf demselben Text erneut.
      this.byContent.set(key, title);
      return title;
    } finally {
      this.busy.set(false);
    }
  }

  /** Textinhalt -> Ergebnis. Lebt so lange wie die Sitzung. */
  private readonly byContent = new Map<string, string | null>();

  private async ask(text: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<SuggestTitleResponse>(`${this.baseUrl}/suggest-title`, { text }),
      );
      this.serverReady.set(true);
      this.remaining.update((left) => (left === null ? null : Math.max(0, left - 1)));
      return response.title;
    } catch (error) {
      const status = (error as { status?: number }).status;

      // 503 heisst: auf diesem Server ist kein Schlüssel hinterlegt. Dann die
      // Funktion ausblenden, statt bei jedem Klick still zu scheitern.
      if (status === 503 || status === 404) this.serverReady.set(false);
      // 429: Tageskontingent aufgebraucht. Kein Fehler, sondern eine Auskunft.
      else if (status === 429) this.remaining.set(0);
      else console.error('Titelvorschlag fehlgeschlagen', error);
      return null;
    }
  }
}
