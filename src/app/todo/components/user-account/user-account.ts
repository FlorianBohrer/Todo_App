import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ClerkService } from 'ngx-clerk';
import { firstValueFrom, map } from 'rxjs';

import {
  AccountService,
  DELETE_CONFIRMATION,
  deleteAccountErrorMessage,
  isDeleteConfirmed,
} from '../../services/account.service';

@Component({
  selector: 'app-user-account',
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-account.html',
  host: {
    '(document:keydown.escape)': 'dismiss()',
    '(document:pointerdown)': 'dismissOutside($event)',
  },
})
export class UserAccount {
  private readonly clerk = inject(ClerkService);
  private readonly accounts = inject(AccountService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Das Profilbild kam nicht an — blockiert, offline, oder Clerk liefert
   * keins. Dann steht der Anfangsbuchstabe da statt des kaputten Bildes, aus
   * dessen Rand sonst der Alternativtext („Signed in as …“) herausragt.
   */
  readonly avatarFailed = signal(false);

  readonly account$ = this.clerk.user$.pipe(
    map((user) => {
      if (!user) return null;
      const username = user.username ?? user.fullName ?? user.firstName ?? 'Unbenannt';
      return {
        avatarUrl: user.imageUrl,
        username,
        initial: username.trim().charAt(0).toUpperCase() || '?',
        email: user.primaryEmailAddress?.emailAddress ?? 'no email',
        userId: user.id,
      };
    }),
  );

  // ---- Konto löschen ----
  //
  // Sitzt hinter dem Profilbild und dort hinter einem zweiten Schritt. Es ist
  // die eine Handlung der App, die sich nicht zurücknehmen lässt; sie soll
  // auffindbar sein, aber nie im Weg stehen und nie mit einem einzelnen
  // Antippen ausgelöst werden.

  protected readonly confirmationWord = DELETE_CONFIRMATION;

  protected readonly open = signal(false);
  /** Der zweite Schritt: Erklärung und das Feld für die Bestätigung. */
  protected readonly confirming = signal(false);
  protected readonly typed = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');

  protected readonly confirmed = computed(() => isDeleteConfirmed(this.typed()));

  protected toggle(): void {
    if (this.open()) this.dismiss();
    else this.open.set(true);
  }

  /**
   * Schliessen setzt alles zurück. Wer das Fenster zumacht und später wieder
   * öffnet, soll nicht vor einem schon ausgefüllten Löschdialog stehen.
   */
  protected dismiss(): void {
    if (!this.open() || this.busy()) return;

    this.open.set(false);
    this.cancel();
  }

  protected dismissOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.dismiss();
  }

  protected cancel(): void {
    this.confirming.set(false);
    this.typed.set('');
    this.problem.set('');
  }

  protected async deleteAccount(): Promise<void> {
    if (!this.confirmed() || this.busy()) return;

    this.busy.set(true);
    this.problem.set('');

    try {
      await this.accounts.deleteAccount();
    } catch (error) {
      this.problem.set(deleteAccountErrorMessage(error));
      this.busy.set(false);
      return;
    }

    // Das Konto gibt es nicht mehr. Die Sitzung im Browser weiß das noch
    // nicht; abmelden räumt sie weg. Scheitert das, weil Clerk die Sitzung
    // schon nicht mehr kennt, ist das genau der Zustand, der erreicht werden
    // sollte.
    try {
      const clerk = await firstValueFrom(this.clerk.clerk$);
      await clerk.signOut();
    } catch {
      /* schon abgemeldet */
    }

    // Frisch laden statt weiterzumachen: im Speicher der Seite liegen noch
    // die Todos des Kontos, das es nicht mehr gibt.
    location.assign('/');
  }
}
