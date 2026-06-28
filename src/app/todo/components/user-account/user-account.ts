import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ClerkService } from 'ngx-clerk';
import { map } from 'rxjs';

@Component({
  selector: 'app-user-account',
  imports: [AsyncPipe],
  templateUrl: './user-account.html',
})
export class UserAccount {
  private readonly clerk = inject(ClerkService);

  readonly account$ = this.clerk.user$.pipe(
    map((user) => {
      if (!user) return null;
      return {
        avatarUrl: user.imageUrl,
        username: user.username ?? user.fullName ?? user.firstName ?? 'Unbenannt',
        email: user.primaryEmailAddress?.emailAddress ?? '—',
        userId: user.id,
      };
    }),
  );
}