import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <a routerLink="/" class="logo" [class]="size">
      <span class="mark">PM</span>
      <span class="word">Pfuma <b>Mbiri</b></span>
    </a>
  `,
  styles: [
    `
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
      }
      .mark {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: #0f766e;
        color: #fff;
        font-weight: 800;
        font-size: 0.72rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ccfbf1;
        flex: none;
      }
      .word {
        font-weight: 400;
        color: inherit;
        font-size: 0.98rem;
        white-space: nowrap;
      }
      .word b {
        font-weight: 800;
      }
      .logo.light .word {
        color: #fff;
      }
    `,
  ],
})
export class LogoComponent {
  @Input() size: string = '';
}
