import { Injectable, signal } from '@angular/core';

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

  readonly isOverlayOpen = signal(false);
  readonly activeLabelId = signal<string | null>(null);   // null = alle

  openOverlay()  { this.isOverlayOpen.set(true); }
  closeOverlay() { this.isOverlayOpen.set(false); }

  selectLabel(id: string | null) {
    this.activeLabelId.set(id);
    this.closeOverlay();
  }
}