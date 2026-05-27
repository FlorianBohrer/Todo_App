import { Component, inject, HostListener } from '@angular/core';
import { LabelService } from '../../services/label.service';

@Component({
  selector: 'app-categories-overlay',
  templateUrl: './categories-overlay.html',
})
export class CategoriesOverlay {
  private readonly labelService = inject(LabelService);

  protected readonly labels        = this.labelService.labels;
  protected readonly isOpen        = this.labelService.isOverlayOpen;
  protected readonly activeLabelId = this.labelService.activeLabelId;

  close() {
    this.labelService.closeOverlay();
  }

  select(id: string | null) {
    this.labelService.selectLabel(id);
  }

  bgClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'bg-violet-600/15',
      emerald: 'bg-emerald-600/15',
      rose:    'bg-rose-600/15',
    };
    return map[color] ?? 'bg-highlight11';
  }

  textClass(color: string): string {
    const map: Record<string, string> = {
      violet:  'text-violet-300',
      emerald: 'text-emerald-300',
      rose:    'text-rose-300',
    };
    return map[color] ?? 'text-zinc-300';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.close();
    }
  }
}