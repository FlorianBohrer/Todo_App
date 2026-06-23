import { Injectable, signal } from '@angular/core';

export interface Label {
  id: string;
  name: string;
  color: string;  
  icon: string;    
}



@Injectable({ providedIn: 'root' })
export class LabelService {
  readonly labels  = signal<Label[]>([
    { id: 'work',     name: 'Work',     color: 'rose',  icon: 'briefcase' },
    { id: 'freetime', name: 'Freetime', color: 'emerald', icon: 'mountain' },
    { id: 'holiday',  name: 'Holiday',  color: 'orange',    icon: 'sun' },
    { id: 'other',    name: 'Other',    color: 'violet', icon: 'question-mark-circle' },
  ]);

private readonly colorToBorder: Record<string, string> = {
  violet: 'border-violet-500',
  emerald: 'border-emerald-500',
  rose: 'border-rose-500',
  orange: 'border-orange-500',

  amber:   'border-amber-500',
  teal:    'border-teal-500',
  sky:     'border-sky-500',
  fuchsia: 'border-fuchsia-500'
};

borderClassFor(labelId:  string | null): string {
  if (labelId === null) return 'border-zinc-600';
  const label = this.labels().find(l => l.id === labelId);
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

  addLabel(name: string, color: string){
    const trimmed = name.trim();
    if(!trimmed) return;
    this.labels.update(list=>[
      ...list,
      { id:crypto.randomUUID(), name: trimmed, color, icon: 'tag'},
    ]);
  }

  removeLabel(id: string) {
  this.labels.update(list => list.filter(l => l.id !== id));
  if (this.activeLabelId() === id) {
    this.activeLabelId.set(null);   
  }
}
}