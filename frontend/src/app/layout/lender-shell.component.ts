import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';
import { InitialsPipe } from '../shared/format';

/**
 * Lender portal: a SEPARATE product from the SME portal:
 * - own visual identity (.lender-theme: navy console, amber primary)
 * - top navigation, no SME sidebar; guarded by lenderGuard
 * - one persistent "DEMO: sample data" banner for every page
 */
@Component({
  selector: 'lender-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, IconComponent, InitialsPipe],
  template: `
    <div class="lender-theme root">
      <div class="demo">
        <app-icon name="flag" [size]="14" />
        <b>DEMO</b> · Sample data only. No real scoring, no real personal data, not a credit decision.
      </div>
      <header class="lbar">
        <div class="inner">
          <app-logo variant="light" link="/lender" [size]="28" tag="Lender" />
          <nav>
            <a routerLink="/lender" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
              <app-icon name="pie" [size]="16" /> Portfolio
            </a>
            <a routerLink="/lender/applications" routerLinkActive="active">
              <app-icon name="invoice" [size]="16" /> Applications
            </a>
            <a routerLink="/lender/alerts" routerLinkActive="active">
              <app-icon name="alert" [size]="16" /> Fraud alerts
            </a>
          </nav>
          <div class="user">
            <a class="btn plain small" routerLink="/">Website</a>
            @if (auth.businesses().length) {
              <a class="btn ghost small" routerLink="/dashboard">SME portal</a>
            }
            <span class="ava" [title]="auth.user()?.email ?? ''">{{ auth.user()?.first_name || auth.user()?.email | initials }}</span>
            <button class="icon-btn" (click)="auth.logout()" title="Sign out" aria-label="Sign out">
              <app-icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <main>
        <router-outlet />
      </main>
      <footer>Pfuma Mbiri Lender · Demo with sample data · Not a real credit decision</footer>
    </div>
  `,
  styles: [
    `
      .root {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--bg);
      }
      .demo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 7px 16px;
        font-size: 0.78rem;
        background: #ffffff;
        color: #000000;
        font-weight: 500;
        text-align: center;
      }
      .lbar {
        position: sticky;
        top: 0;
        z-index: 40;
        background: color-mix(in srgb, #000000 85%, transparent);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--border);
      }
      .inner {
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 32px;
        height: 62px;
        display: flex;
        align-items: center;
        gap: 28px;
      }
      nav {
        display: flex;
        gap: 4px;
        height: 100%;
      }
      nav a {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-2);
        border-bottom: 2px solid transparent;
      }
      nav a:hover {
        color: var(--text);
      }
      nav a.active {
        color: var(--text);
        border-bottom-color: var(--primary);
      }
      nav a.active app-icon {
        color: var(--primary);
      }
      .user {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ava {
        width: 32px;
        height: 32px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        font-weight: 700;
        font-size: 0.75rem;
        background: #f5f5f5;
        color: #000000;
      }
      main {
        flex: 1;
      }
      footer {
        text-align: center;
        color: var(--text-3);
        font-size: 0.75rem;
        padding: 24px;
      }
      @media (max-width: 760px) {
        .inner {
          padding: 0 14px;
          gap: 10px;
          height: auto;
          flex-wrap: wrap;
          padding-top: 10px;
        }
        nav {
          order: 3;
          width: 100%;
          height: 44px;
          overflow-x: auto;
        }
        nav a {
          white-space: nowrap;
        }
      }
    `,
  ],
})
export class LenderShellComponent {
  auth = inject(AuthService);
}
