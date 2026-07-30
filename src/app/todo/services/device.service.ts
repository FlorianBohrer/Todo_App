import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/enviroment';
import { ToastService } from '../../shared/toast.service';

export interface PairedDevice {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

/**
 * Kopplung nativer Clients (macOS-Menüleisten-Timer). Die App im Browser hat
 * eine Clerk-Sitzung, das Gerät nicht — deshalb erzeugt der Browser hier einen
 * kurzlebigen Code, den das Gerät einmalig gegen ein eigenes Token tauscht.
 */
@Injectable({ providedIn: 'root' })
export class DeviceService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  private readonly baseUrl = `${environment.apiUrl}/device`;

  readonly devices = signal<PairedDevice[]>([]);

  /** Aktueller Kopplungscode samt Ablauf, oder null wenn keiner offen ist. */
  readonly pairingCode = signal<{ code: string; expiresAt: Date } | null>(null);
  readonly busy = signal(false);

  async loadDevices(): Promise<void> {
    try {
      const devices = await firstValueFrom(
        this.http.get<PairedDevice[]>(this.baseUrl),
      );
      this.devices.set(devices);
    } catch {
      this.toast.show('Geräte konnten nicht geladen werden.', {
        type: 'error',
      });
    }
  }

  async createPairingCode(): Promise<void> {
    this.busy.set(true);

    try {
      const response = await firstValueFrom(
        this.http.post<PairingCodeResponse>(`${this.baseUrl}/pairing-code`, {}),
      );

      this.pairingCode.set({
        code: response.code,
        expiresAt: new Date(response.expiresAt),
      });
    } catch {
      this.toast.show('Kopplungscode konnte nicht erzeugt werden.', {
        type: 'error',
      });
    } finally {
      this.busy.set(false);
    }
  }

  clearPairingCode(): void {
    this.pairingCode.set(null);
  }

  /**
   * Widerruft ein Gerät. Das Token ist danach sofort wertlos, die App dort
   * landet beim nächsten Request wieder im Kopplungsbildschirm.
   */
  async revoke(device: PairedDevice): Promise<void> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${device.id}`));

      this.devices.update((list) => list.filter((d) => d.id !== device.id));
      this.toast.show(`"${device.name}" wurde entkoppelt.`, { type: 'success' });
    } catch {
      this.toast.show('Gerät konnte nicht entkoppelt werden.', {
        type: 'error',
      });
    }
  }
}
