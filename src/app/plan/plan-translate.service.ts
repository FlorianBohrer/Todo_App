import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { PlanTitleService } from './plan-title.service';
import { loadMermaid } from './components/mermaid-diagram';
import { batchTexts, keepValidDiagrams, TranslateItem, TranslateTarget } from './plan-translate';

interface TranslateResponse {
  translations: string[] | null;
  /** Gesetzt, wenn das Modell nichts Brauchbares geliefert hat. */
  error?: string;
}

/** So viele Pakete gleichzeitig — ein langer Plan soll nicht ewig dauern, aber auch nicht fluten. */
const PARALLEL = 3;

/** Ein Fehlschlag, dessen Meldung so in einer Toast-Zeile stehen kann. */
export class TranslateError extends Error {}

/** Was eine HTTP-Antwort dem Nutzer sagt — Status und Art, nie die Anfrage. */
function readable(error: unknown): string {
  const status = (error as { status?: number }).status;
  switch (status) {
    case 0:
      return 'Could not reach the server';
    case 404:
    case 503:
      return 'Translation is not set up on this server';
    case 413:
      return 'This plan is too long to translate';
    case 429:
      return 'Daily AI limit reached: try again tomorrow';
    default:
      return status ? `Translation failed (HTTP ${status})` : 'Translation failed';
  }
}

/**
 * Übersetzt die Texte eines Plans über das eigene Backend.
 *
 * Wie bei den Titelvorschlägen läuft nichts direkt gegen Anthropic: der
 * Schlüssel bleibt auf dem Server. Große Pläne gehen in mehreren Paketen
 * (batchTexts), die Ergebnisse kommen nach Position wieder zusammen — es
 * gilt alles oder nichts: ein halb übersetzter Plan wäre schwerer zu lesen
 * als einer in der falschen Sprache.
 */
@Injectable({ providedIn: 'root' })
export class PlanTranslateService {
  private readonly http = inject(HttpClient);
  private readonly titles = inject(PlanTitleService);
  private readonly url = `${environment.apiUrl}/plan/translate`;

  /** Fortschritt bei großen Plänen: fertige und alle Pakete. null = es läuft nichts. */
  readonly progress = signal<{ done: number; total: number } | null>(null);

  /** Wie viele Anfragen das kostet — jedes Paket ist eine Einheit im Tageskontingent. */
  requestsFor(items: readonly TranslateItem[]): number {
    return batchTexts(items).length;
  }

  async translate(items: readonly TranslateItem[], target: TranslateTarget): Promise<string[]> {
    const batches = batchTexts(items);
    const left = this.titles.remaining();
    if (left !== null && left < batches.length) {
      throw new TranslateError(
        left === 0
          ? 'Daily AI limit reached: try again tomorrow'
          : `This plan needs ${batches.length} AI requests, ${left} left today`,
      );
    }

    const result: string[] = new Array(items.length);
    let next = 0;
    // Ist ein Paket gescheitert, wird das Ganze verworfen — die übrigen
    // also gar nicht erst abschicken, jedes kostet eine Einheit.
    let failed = false;
    this.progress.set({ done: 0, total: batches.length });

    const worker = async () => {
      while (!failed && next < batches.length) {
        const batch = batches[next++];
        try {
          const translations = await this.send(batch.map((i) => items[i]), target);
          batch.forEach((index, j) => (result[index] = translations[j]));
        } catch (error) {
          failed = true;
          throw error;
        }
        this.progress.update((p) => p && { ...p, done: p.done + 1 });
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
    } finally {
      this.progress.set(null);
    }

    return keepValidDiagrams(items, result, async (code) => {
      const mermaid = await loadMermaid();
      return (await mermaid.parse(code, { suppressErrors: true })) !== false;
    });
  }

  private async send(items: TranslateItem[], target: TranslateTarget): Promise<string[]> {
    let response: TranslateResponse;
    try {
      response = await firstValueFrom(this.http.post<TranslateResponse>(this.url, { target, items }));
    } catch (error) {
      if ((error as { status?: number }).status === 429) this.titles.remaining.set(0);
      throw new TranslateError(readable(error));
    }

    // Gebucht ist die Einheit auch dann, wenn das Modell nichts geliefert hat.
    this.titles.remaining.update((left) => (left === null ? null : Math.max(0, left - 1)));
    if (!response.translations || response.translations.length !== items.length) {
      throw new TranslateError(response.error ?? 'The translation came back incomplete');
    }
    return response.translations;
  }
}
