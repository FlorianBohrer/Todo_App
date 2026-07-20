import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Zeigt die Toasts unten mittig an — über allem, auch über den Overlays. */
@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.html',
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;
}
