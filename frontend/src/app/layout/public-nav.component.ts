import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';

/** Header + footer for the public pages (landing, pricing). */
@Component({
  selector: 'app-public-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LogoComponent, IconComponent],
  template: `
    <header class="pnav">
      <div class="inner">
        <app-logo />
        <nav>
          <a routerLink="/" fragment="features">Features</a>
          <a routerLink="/" fragment="how">How it works</a>
          <a routerLink="/plan" routerLinkActive="active">Pricing</a>
        </nav>
        <div class="right">
          <button class="icon-btn" (click)="theme.cycle()" [attr.aria-label]="'Theme: ' + theme.pref()">
            <app-icon [name]="theme.pref() === 'system' ? 'monitor' : theme.pref() === 'dark' ? 'moon' : 'sun'" />
          </button>
          @if (auth.user()) {
            <a class="btn" [routerLink]="auth.home()">Open app <app-icon name="arrow-right" [size]="15" /></a>
          } @else {
            <a class="btn plain signin" routerLink="/login">Sign in</a>
            <a class="btn" routerLink="/login">Try the demo</a>
          }
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .pnav {
        position: sticky;
        top: 0;
        z-index: 30;
        background: color-mix(in srgb, var(--bg) 80%, transparent);
        backdrop-filter: saturate(1.4) blur(12px);
        border-bottom: 1px solid var(--border);
      }
      .inner {
        max-width: 1160px;
        margin: 0 auto;
        padding: 0 24px;
        height: 64px;
        display: flex;
        align-items: center;
        gap: 32px;
      }
      nav {
        display: flex;
        gap: 24px;
      }
      nav a {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-2);
      }
      nav a:hover,
      nav a.active {
        color: var(--text);
      }
      .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      @media (max-width: 760px) {
        nav,
        .signin {
          display: none;
        }
        .inner {
          padding: 0 16px;
        }
      }
    `,
  ],
})
export class PublicNavComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
}

@Component({
  selector: 'app-public-footer',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  template: `
    <footer>
      <div class="inner">
        <div>
          <app-logo [size]="28" />
          <p class="muted" style="margin-top:10px;max-width:280px">
            <i>Pfuma Mbiri</i> is Shona for “wealth &amp; glory”. The business OS for Zimbabwean SMEs.
          </p>
        </div>
        <div class="cols">
          <div>
            <b>Product</b>
            <a routerLink="/" fragment="features">Features</a>
            <a routerLink="/plan">Pricing</a>
            <a routerLink="/login">Sign in</a>
          </div>
          <div>
            <b>Compliance</b>
            <span>ZIMRA FDMS fiscalisation</span>
            <span>VAT &amp; QPD estimates</span>
            <span>Cyber &amp; Data Protection</span>
          </div>
        </div>
      </div>
      <p class="legal">© {{ year }} Pfuma Mbiri · Made in Zimbabwe · Tax figures are estimates; confirm with ZIMRA.</p>
    </footer>
  `,
  styles: [
    `
      footer {
        border-top: 1px solid var(--border);
        background: var(--surface);
      }
      .inner {
        max-width: 1160px;
        margin: 0 auto;
        padding: 40px 24px 24px;
        display: flex;
        justify-content: space-between;
        gap: 32px;
        flex-wrap: wrap;
      }
      .cols {
        display: flex;
        gap: 56px;
      }
      .cols div {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.86rem;
      }
      .cols b {
        font-size: 0.8rem;
        margin-bottom: 4px;
      }
      .cols a,
      .cols span {
        color: var(--text-2);
      }
      .legal {
        max-width: 1160px;
        margin: 0 auto;
        padding: 16px 24px 28px;
        font-size: 0.76rem;
        color: var(--text-3);
        border-top: 1px solid var(--border);
      }
    `,
  ],
})
export class PublicFooterComponent {
  readonly year = new Date().getFullYear();
}
