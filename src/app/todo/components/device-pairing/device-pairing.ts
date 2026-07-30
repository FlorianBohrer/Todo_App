import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';

import { DeviceService, PairedDevice } from '../../services/device.service';

/**
 * Kopplung des macOS-Timers. Steckt hinter einem Button, weil man das genau
 * einmal pro Gerät braucht — der Normalfall ist, dass hier nichts zu sehen ist.
 */
@Component({
  selector: 'app-device-pairing',
  templateUrl: './device-pairing.html',
})
export class DevicePairing {
  private readonly devices = inject(DeviceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly pairingCode = this.devices.pairingCode;
  protected readonly deviceList = this.devices.devices;
  protected readonly busy = this.devices.busy;

  /** Tickt einmal pro Sekunde, damit die Restzeit des Codes mitläuft. */
  private readonly now = signal(Date.now());

  protected readonly secondsLeft = computed(() => {
    const code = this.pairingCode();
    if (!code) return 0;

    return Math.max(
      0,
      Math.ceil((code.expiresAt.getTime() - this.now()) / 1000),
    );
  });

  protected readonly expired = computed(
    () => this.pairingCode() !== null && this.secondsLeft() === 0,
  );

  constructor() {
    const interval = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  protected async toggle(): Promise<void> {
    const next = !this.open();
    this.open.set(next);

    if (next) {
      await this.devices.loadDevices();
    } else {
      this.devices.clearPairingCode();
    }
  }

  protected createCode(): Promise<void> {
    return this.devices.createPairingCode();
  }

  protected async revoke(device: PairedDevice): Promise<void> {
    await this.devices.revoke(device);
  }

  /** "vor 3 Minuten" ist hier Overkill — Datum reicht. */
  protected formatDate(value: string | null): string {
    if (!value) return 'noch nie benutzt';

    return new Date(value).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  protected formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  }
}
