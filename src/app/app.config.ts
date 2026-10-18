import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { CDK_DRAG_CONFIG, DragDropConfig } from '@angular/cdk/drag-drop';
import { authInterceptor } from './interceptors/auth.interceptor';
import { DRAG_START_DELAY } from './shared/hold-to-drag';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Auf Touch erst nach Halten verschieben, ueberall — Liste, Woche,
    // Folder, Plaene, Bloecke. Siehe hold-to-drag.ts.
    {
      provide: CDK_DRAG_CONFIG,
      useValue: { dragStartDelay: DRAG_START_DELAY } satisfies DragDropConfig,
    },
  ],
};
