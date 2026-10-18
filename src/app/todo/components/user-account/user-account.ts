import {ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ClerkService } from 'ngx-clerk';
import { map } from 'rxjs';

@Component({
  selector: 'app-user-account',
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-account.html',
})
export class UserAccount {
  private readonly clerk = inject(ClerkService);

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
}
