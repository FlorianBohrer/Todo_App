import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ClerkService } from 'ngx-clerk';
import { from, of, switchMap, take } from 'rxjs';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const clerk = inject(ClerkService);

  return clerk.session$.pipe(
    take(1),
    switchMap((session) => (session ? from(session.getToken()) : of(null))),
    switchMap((token) => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    }),
  );
};
