import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BusinessService } from '../core/business.service';
import { LogoComponent } from '../shared/logo.component';
import { api } from '../core/api';
import type { AppNotification } from '../core/models';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, LogoComponent],
  template: `
    <header class="topbar">
      <button class="menu-btn" (click)="navOpen.set(!navOpen())" aria-label="Menu">☰</button>
      <a routerLink="/" class="topbar-logo"><app-logo size="light" /></a>

      @if (auth.businesses().length > 1) {
        <select
          class="biz-switch"
          [value]="auth.activeBusinessId()"
          (change)="switchBusiness($event)"
          title="Switch business"
        >
          @for (b of auth.businesses(); track b.id) {
            <option [value]="b.id" [selected]="b.id === auth.activeBusinessId()">{{ b.name }}</option>
          }
        </select>
      } @else if (auth.activeBusinessName()) {
        <span class="biz-name">{{ auth.activeBusinessName() }}</span>
      }

      <span class="spacer"></span>

      <button class="bell" (click)="toggleBell()" aria-label="Notifications">
        🔔
        @if (unreadCount() > 0) {
          <span class="bell-badge">{{ unreadCount() }}</span>
        }
      </button>

      <div class="user-menu">
        <button class="user-btn" (click)="menuOpen.set(!menuOpen())">
          {{ initial() }} ▾
        </button>
        @if (menuOpen()) {
          <div class="menu-pop card" (click)="$event.stopPropagation()">
            <div class="menu-head">
              <b>{{ auth.user()?.first_name || auth.user()?.email }}</b>
              <div class="muted">{{ auth.user()?.email }}</div>
            </div>
            <button class="menu-item" routerLink="/notifications" (click)="menuOpen.set(false)">
              Notifications
            </button>
            <button class="menu-item" routerLink="/plan" (click)="menuOpen.set(false)">
              Plan &amp; pricing
            </button>
            <button class="menu-item danger" (click)="logout()">Sign out</button>
          </div>
        }
      </div>
    </header>

    @if (bellOpen()) {
      <div class="notif-pop card">
        <div class="page-head" style="padding:4px 4px 0">
          <h2>Notifications</h2>
          <a routerLink="/notifications" (click)="bellOpen.set(false)">Settings →</a>
        </div>
        @for (n of notifications().slice(0, 6); track n.id) {
          <div class="notif-row" [class.unread]="!n.read">
            <b>{{ n.title }}</b>
            <div class="muted">{{ n.body }}</div>
          </div>
        } @empty {
          <div class="empty">No notifications</div>
        }
      </div>
    }

    <div class="body-row">
      <nav class="sidenav" [class.open]="navOpen()">
        <a routerLink="/dashboard" (click)="navOpen.set(false)">Dashboard</a>
        <a routerLink="/sales" (click)="navOpen.set(false)">Sales</a>
        <a routerLink="/invoices" (click)="navOpen.set(false)">Invoices</a>
        <a routerLink="/customers" (click)="navOpen.set(false)">Customers</a>
        <a routerLink="/products" (click)="navOpen.set(false)">Products</a>
        <a routerLink="/expenses" (click)="navOpen.set(false)">Expenses</a>
        <a routerLink="/reports" (click)="navOpen.set(false)">Reports</a>
        <a routerLink="/leads" (click)="navOpen.set(false)">Leads</a>
        <a routerLink="/advisor" (click)="navOpen.set(false)">AI business advisor</a>
        <a routerLink="/compliance" (click)="navOpen.set(false)">Compliance</a>
        <a routerLink="/tax" (click)="navOpen.set(false)">Tax</a>
        <a routerLink="/fiscal" (click)="navOpen.set(false)">Fiscal</a>
        <a routerLink="/security" (click)="navOpen.set(false)">Security check</a>
        <a routerLink="/loan" (click)="navOpen.set(false)">Loan readiness</a>
        @if (auth.isLender()) {
          <a routerLink="/lender" (click)="navOpen.set(false)" class="lender-link">Lender portal</a>
        }
        <a routerLink="/plan" (click)="navOpen.set(false)">Pricing</a>
      </nav>
      @if (navOpen()) {
        <div class="backdrop" (click)="navOpen.set(false)"></div>
      }
      <main class="content">
        <router-outlet />
      </main>
      <footer class="app-foot">Pfuma Mbiri</footer>
    </div>
  `,
  styles: [
    `
      .topbar {
        position: sticky;
        top: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        background: #0f766e;
        color: #fff;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
      }
      .topbar-logo {
        text-decoration: none;
        display: inline-flex;
      }
      .brand {
        display: none;
      }
      .spacer {
        flex: 1;
      }
      .menu-btn {
        display: none;
        background: none;
        border: none;
        color: #fff;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 2px 6px;
      }
      .biz-switch {
        width: auto;
        max-width: 190px;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 8px;
        padding: 5px 8px;
      }
      .biz-switch option {
        color: #0f172a;
      }
      .biz-name {
        font-size: 0.86rem;
        opacity: 0.9;
      }
      .bell {
        position: relative;
        background: none;
        border: none;
        font-size: 1.05rem;
        cursor: pointer;
        color: #fff;
      }
      .bell-badge {
        position: absolute;
        top: -4px;
        right: -7px;
        background: #f59e0b;
        color: #0f172a;
        border-radius: 999px;
        font-size: 0.62rem;
        font-weight: 700;
        padding: 1px 5px;
      }
      .user-menu {
        position: relative;
      }
      .user-btn {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: none;
        background: #f59e0b;
        color: #0f172a;
        font-weight: 700;
        cursor: pointer;
      }
      .menu-pop {
        position: absolute;
        right: 0;
        top: 40px;
        min-width: 190px;
        z-index: 60;
      }
      .menu-head {
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 8px;
        margin-bottom: 6px;
      }
      .menu-item {
        display: block;
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 8px 6px;
        font-size: 0.86rem;
        cursor: pointer;
        color: #334155;
        border-radius: 6px;
      }
      .menu-item:hover {
        background: #f1f5f9;
      }
      .menu-item.danger {
        color: #dc2626;
      }
      .notif-pop {
        position: fixed;
        top: 54px;
        right: 12px;
        width: min(340px, calc(100vw - 24px));
        z-index: 55;
        max-height: 65vh;
        overflow: auto;
      }
      .notif-row {
        padding: 8px 4px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 0.84rem;
      }
      .notif-row.unread b {
        color: #0f766e;
      }
      .body-row {
        display: flex;
        min-height: calc(100vh - 52px);
      }
      .sidenav {
        width: 190px;
        flex: none;
        background: #fff;
        border-right: 1px solid #e2e8f0;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sidenav a {
        padding: 7px 10px;
        border-radius: 8px;
        font-size: 0.86rem;
        color: #334155;
      }
      .sidenav a:hover {
        background: #f0fdfa;
        color: #0f766e;
      }
      .sidenav a.active {
        background: #ccfbf1;
        color: #115e59;
        font-weight: 700;
      }
      .lender-link {
        border-top: 1px solid #e2e8f0;
        margin-top: 4px;
        padding-top: 10px !important;
      }
      .content {
        flex: 1;
        min-width: 0;
      }
      .app-foot {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: none;
      }
      @media (max-width: 860px) {
        .menu-btn {
          display: block;
        }
        .body-row {
          position: relative;
        }
        .sidenav {
          position: fixed;
          top: 52px;
          left: 0;
          bottom: 0;
          z-index: 45;
          transform: translateX(-100%);
          transition: transform 0.18s;
          box-shadow: 2px 0 10px rgba(15, 23, 42, 0.15);
        }
        .sidenav.open {
          transform: translateX(0);
        }
        .backdrop {
          display: block;
          position: fixed;
          inset: 52px 0 0 0;
          background: rgba(15, 23, 42, 0.35);
          z-index: 44;
        }
      }
      .app-foot {
        width: 100%;
        text-align: center;
        color: #64748b;
        font-size: 0.75rem;
        padding: 8px 0 10px;
        background: var(--bg);
      }
    `,
  ],
})
export class ShellComponent {
  auth = inject(AuthService);
  private businessService = inject(BusinessService);

  navOpen = signal(false);
  menuOpen = signal(false);
  bellOpen = signal(false);
  notifications = signal<AppNotification[]>([]);
  unreadCount = signal(0);

  initial = computed(() => {
    const u = this.auth.user();
    const base = u?.first_name || u?.email || '?';
    return base.charAt(0).toUpperCase();
  });

  ngOnInit(): void {
    if (!this.auth.user()) {
      this.auth.loadMe();
    }
    this.loadNotifications();
    document.addEventListener('click', () => {
      this.menuOpen.set(false);
    });
  }

  async loadNotifications(): Promise<void> {
    // Lender demo users have no business membership — skip business-scoped calls.
    const u = this.auth.user();
    if (u && u.is_lender && !u.businesses?.length) return;
    try {
      const list = await api.get<AppNotification[]>('/notifications/');
      this.notifications.set(Array.isArray(list) ? list : (list as any).results ?? []);
      this.unreadCount.set(this.notifications().filter((n) => !n.read).length);
    } catch {
      /* notifications are non-critical */
    }
  }

  toggleBell(): void {
    this.bellOpen.set(!this.bellOpen());
    if (this.bellOpen()) {
      this.loadNotifications();
    }
  }

  async switchBusiness(ev: Event): Promise<void> {
    const id = Number((ev.target as HTMLSelectElement).value);
    await this.businessService.switch(id);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
