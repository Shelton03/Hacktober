import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastsComponent } from './shared/toast.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastsComponent],
  template: `<router-outlet /><app-toasts />`,
})
export class App {
  // instantiate early so the theme follows OS changes from the first screen
  private theme = inject(ThemeService);
}
