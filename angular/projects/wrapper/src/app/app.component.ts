import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
  <lib-timeclock-vis></lib-timeclock-vis>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'wrapper';
}
