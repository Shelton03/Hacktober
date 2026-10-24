import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

/**
 * Lender shell — a SEPARATE experience from the SME portal:
 * - no SME navigation (Dashboard/Sales/etc. don't belong here)
 * - persistent "DEMO — sample data" banner on every page
 * - minimal top bar: brand, portfolio/alerts/applications nav, user menu
 */
@Component({
  selector: 'lender-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="lender-root">
      <div class="demo-banner">DEMO — sample data only. No real scoring, no real personal data.</div>
      <header class="lender-bar">
        <a routerLink="/" class="brand">Pfuma Mbiri <span class="tag">Lender</span></a>
        <nav class="lender-nav">
          <a routerLink="/lender">Portfolio</a>
          <a routerLink="/lender/alerts">Fraud alerts</a>
          <a routerLink="/lender/applications">Applications</a>
        </nav>
        <div class="user">
          <span>{{ initial() }}</span>
          <button (click)="logout()" title="Sign out">Sign out</button>
        </div>
      </header>
      <main class="lender-main">
        <router-outlet />
      </main>
      <footer class="lender-footer">Pfuma Mbiri — DEMO — sample data · not a real credit decision</footer>
    </div>
  `,
  styles: [
    `
      .lender-root { min-height: 100vh; background: #0F172A; color: #E2E8F0; }
      .demo-banner {
        background: #F59E0B; color: #78350F; font-weight: 700; text-align: center;
        padding: 8px 12px; font-size: 13px; letter-spacing: 0.02em;
      }
      .lender-bar {
        display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 12px 20px; background: #1E293B; border-bottom: 1px solid #334155;
      }
      .brand { font-weight: 800; color: #fff; text-decoration: none; font-size: 16px; }
      .brand .tag { color: #F59E0B; font-size: 11px; margin-left: 6px; text-transform: uppercase; }
      .lender-nav { display: flex; gap: 16px; flex-wrap: wrap; }
      .lender-nav a { color: #CBD5E1; text-decoration: none; font-size: 14px; padding: 6px 10px; border-radius: 6px; }
      .lender-nav a:hover { background: #334155; color: #fff; }
      .user { margin-left: auto; display: flex; align-items: center; gap: 10px; }
      .user span {
        width: 32px; height: 32px; border-radius: 50%; background: #0F766E;
        display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;
      }
      .user button {
        background: transparent; border: 1px solid #475569; color: #E2E8F0; border-radius: 6px;
        padding: 6px 12px; cursor: pointer; font-size: 13px;
      }
      .user button:hover { border-color: #F59E0B; color: #F59E0B; }
      .lender-main { padding: 20px; max-width: 1200px; margin: 0 auto; }
      .lender-footer { text-align: center; color: #64748B; font-size: 12px; padding: 24px; }
    `,
  ],
})
export class LenderShellComponent {
  auth = inject(AuthService);

  initial(): string {
    const u = this.auth.user();
    const base = u?.first_name || u?.email || '?';
    return base.charAt(0).toUpperCase();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}

import { inject } from '@angular/core';
