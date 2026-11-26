import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, Trash2 } from 'lucide-angular';
import { ConfirmService } from './confirm.service';

/**
 * Die Rückfrage vor dem Löschen, über allem.
 *
 * Sie wächst aus dem Knopf, der gefragt hat, und schrumpft beim Schliessen
 * dorthin zurück — man sieht, wozu sie gehört. Der Fokus steht auf
 * „Cancel": wer aus Versehen Enter drückt, verliert nichts. Esc und ein
 * Klick daneben brechen ab.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  private readonly confirm = inject(ConfirmService);
  private readonly injector = inject(Injector);

  protected readonly TrashIcon = Trash2;
  protected readonly request = this.confirm.current;

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancel');
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private opener: HTMLElement | null = null;

  private readonly focusOnOpen = effect(() => {
    const open = this.request();
    if (!open) return;
    untracked(() => {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
      afterNextRender(() => this.cancelButton()?.nativeElement.focus({ preventScroll: true }), {
        injector: this.injector,
      });
    });
  });

  protected answer(answer: boolean | 'alt'): void {
    const opener = this.opener;
    this.opener = null;
    this.confirm.answer(answer);
    // Abgebrochen: zurück, wo man war. Gelöscht gibt es den Knopf nicht mehr.
    if (answer === false && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  /**
   * Tasten bleiben im Dialog: die Kürzel der App (Ansicht wechseln, Ordner
   * öffnen) gälten sonst für das, was dahinter liegt. Tab läuft zwischen
   * den Knöpfen im Kreis.
   */
  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.answer(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...(this.card()?.nativeElement.querySelectorAll('button') ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].focus();
  }
}
