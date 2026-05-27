import { Directive, ElementRef, HostListener, AfterViewInit, inject } from '@angular/core';

@Directive({
    selector: 'textarea[appAutosize]',
    standalone: true,
})

export class Autosize implements AfterViewInit {
    private el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

    ngAfterViewInit() { this.resize(); }

    @HostListener('input') resize() {
        const ta = this.el.nativeElement;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }
}