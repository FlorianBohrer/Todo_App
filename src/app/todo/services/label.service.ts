import { Injectable, signal } from '@angular/core';
import { readonly } from '@angular/forms/signals';

export interface Label {
  id: string;
  name: string;
  color: string;  
  icon: string;    
}



@Injectable({ providedIn: 'root' })
export class LabelService {
  readonly labels: Label[] = [
    { id: 'work',     name: 'Work',     color: 'violet',  icon: 'briefcase' },
    { id: 'freetime', name: 'Freetime', color: 'emerald', icon: 'mountain' },
    { id: 'holiday',  name: 'Holiday',  color: 'rose',    icon: 'sun' },
  ];

private readonly colorToBorder: Record<string, string> = {
  violet: 'border-violet-500',
  emerald: 'border-emerald-500',
  rose: 'border-rose-500'
};

borderClassFor(labelId:  string | null): string {
  if (labelId === null) return 'border-zinc-600';
  const label = this.labels.find(l => l.id === labelId);
  return this.colorToBorder[label?.color ?? ''] ?? 'border-zinc-600';
} 

  readonly isOverlayOpen = signal(false);
  readonly activeLabelId = signal<string | null>(null);   // null = alle

  openOverlay()  { this.isOverlayOpen.set(true); }
  closeOverlay() { this.isOverlayOpen.set(false); }

  selectLabel(id: string | null) {
    this.activeLabelId.set(id);
    this.closeOverlay();
  }
}