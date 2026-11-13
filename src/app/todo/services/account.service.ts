import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/enviroment';

/** Was man eintippen muss, bevor der Löschknopf scharf wird. */
export const DELETE_CONFIRMATION = 'DELETE';

/**
 * Ist die Bestätigung getippt?
 *
 * Gross- und Kleinschreibung zählen nicht, Leerzeichen am Rand auch nicht:
 * die Hürde soll ein Versehen aufhalten, nicht jemanden, der es ernst meint
 * und auf dem Telefon die Umschalttaste nicht erwischt.
 */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION;
}

/**
 * Was nach einem gescheiterten Löschen dasteht: Status und was er hier
 * bedeutet, nie der rohe Text des Servers.
 */
export function deleteAccountErrorMessage(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : -1;

  switch (status) {
    case 0:
      return 'The server could not be reached. Nothing was deleted.';
    case 404:
      // Ein Server, der die Route noch nicht kennt.
      return 'Deleting accounts is not available yet. Nothing was deleted. (404)';
    case 429:
      return 'Too many attempts. Try again in a few minutes. (429)';
    case 502:
      // Der eine Fall, in dem schon etwas passiert ist.
      return 'Your data is deleted, but the sign-in account is still there. Try again to remove it. (502)';
    default:
      return status > 0
        ? `The account could not be deleted. (${status})`
        : 'The account could not be deleted.';
  }
}

/**
 * Das eigene Konto samt allen Daten löschen.
 *
 * Der Weg führt durch das Backend und nicht direkt zu Clerk: dort verschwände
 * nur die Anmeldung, und Todos, Pläne und Fokuszeiten blieben in der
 * Datenbank liegen, ohne dass noch jemand an sie herankäme.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);

  /** Wirft den Fehler weiter; die Ansicht übersetzt ihn. */
  async deleteAccount(): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${environment.apiUrl}/account`),
    );
  }
}
