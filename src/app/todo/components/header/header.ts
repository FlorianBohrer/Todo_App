import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.html',
})
export class Header {
  @Input() title = 'Tasks';
  @Input() accentClass = 'text-white';
}
