import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ClerkService } from 'ngx-clerk';
import { from, switchMap, take } from 'rxjs';
import { environment } from '../../environments/enviroment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const clerk = inject(ClerkService);

  return clerk.clerk$.pipe(
    take(1),
    switchMap((c) => from(c?.session?.getToken() ?? Promise.resolve(null))),
    switchMap((token) => {
      console.log('[authInterceptor]', req.method, req.url, '| token?', !!token);

      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    }),
  );
};
