import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { BusinessService } from '../core/business.service';
import { ThemeService } from '../core/theme.service';
import { api, asList } from '../core/api';
import type { AppNotification } from '../core/models';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';
import { AgoPipe, InitialsPipe, LabelPipe } from '../shared/format';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/advisor', label: 'AI advisor', icon: 'sparkles' },
      { path: '/reports', label: 'Reports', icon: 'chart' },
    ],
  },
  {
    title: 'Sell',
    items: [
      { path: '/sales', label: 'Sales', icon: 'cart' },
      { path: '/invoices', label: 'Invoices', icon: 'invoice' },
      { path: '/customers', label: 'Customers', icon: 'users' },
      { path: '/leads', label: 'Leads', icon: 'target' },
    ],
  },
  {
    title: 'Operate',
    items: [
      { path: '/products', label: 'Products', icon: 'package' },
      { path: '/expenses', label: 'Expenses', icon: 'wallet' },
    ],
  },
  {
    title: 'ZIMRA & tax',
    items: [
      { path: '/fiscal', label: 'Fiscal device', icon: 'printer' },
      { path: '/tax', label: 'Tax', icon: 'landmark' },
      { path: '/compliance', label: 'Compliance', icon: 'check-circle' },
    ],
  },
  {
    title: 'Grow',
    items: [
      { path: '/loan', label: 'Loan readiness', icon: 'banknote' },
      { path: '/security', label: 'Security', icon: 'shield' },
    ],
  },
];

const TABS: NavItem[] = [
  { path: '/dashboard', label: 'Home', icon: 'dashboard' },
  { path: '/sales', label: 'Sell', icon: 'cart' },
  { path: '/invoices', label: 'Invoices', icon: 'invoice' },
  { path: '/advisor', label: 'Advisor', icon: 'sparkles' },
];

const NOTIF_ICON: Record<string, string> = {
  overdue_invoice: 'invoice',
  low_stock: 'package',
  lead_followup: 'target',
  tax_due: 'landmark',
  fiscal: 'printer',
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LogoComponent, IconComponent, AgoPipe, InitialsPipe, LabelPipe],
  template: `
    <aside class="side" [class.open]="navOpen()">
      <div class="side-top">
        <app-logo variant="light" link="/dashboard" [size]="30" />
        <button class="icon-btn close" (click)="navOpen.set(false)" aria-label="Close menu">
          <app-icon name="x" />
        </button>
      </div>

      <div class="biz" (click)="$event.stopPropagation()">
        <button class="biz-btn" (click)="bizOpen.set(!bizOpen())" [disabled]="auth.businesses().length < 2">
          <span class="biz-ava">{{ auth.activeBusinessName() | initials }}</span>
          <span class="biz-text">
            <b>{{ auth.activeBusinessName() || 'Your business' }}</b>
            <small>{{ auth.activeRole() | label }}</small>
          </span>
          @if (auth.businesses().length > 1) {
            <app-icon name="chevrons-ud" [size]="16" />
          }
        </button>
        @if (bizOpen()) {
          <div class="pop biz-pop">
            <p class="eyebrow">Switch business</p>
            @for (b of auth.businesses(); track b.id) {
              <button class="pop-item" (click)="switchBusiness(b.id)">
                <span class="biz-ava sm">{{ b.name | initials }}</span>
                <span class="grow">{{ b.name }}</span>
                @if (b.id === auth.activeBusinessId()) {
                  <app-icon name="check" [size]="16" />
                }
              </button>
            }
          </div>
        }
      </div>

      <nav>
        @for (g of nav; track g.title) {
          <p class="group">{{ g.title }}</p>
          @for (i of g.items; track i.path) {
            <a [routerLink]="i.path" routerLinkActive="active" (click)="navOpen.set(false)">
              <app-icon [name]="i.icon" [size]="18" />
              {{ i.label }}
            </a>
          }
        }
        @if (auth.isLender()) {
          <p class="group">Lender</p>
          <a routerLink="/lender" (click)="navOpen.set(false)">
            <app-icon name="briefcase" [size]="18" /> Lender portal
          </a>
        }
      </nav>

      <a class="plan" routerLink="/plan">
        <app-icon name="zap" [size]="16" />
        <span><b>Free plan</b><small>Upgrade for unlimited invoices</small></span>
        <app-icon name="chevron-right" [size]="16" />
      </a>
    </aside>
    @if (navOpen()) {
      <div class="scrim" (click)="navOpen.set(false)"></div>
    }

    <div class="main">
      <header class="top">
        <button class="icon-btn menu" (click)="navOpen.set(true); $event.stopPropagation()" aria-label="Open menu">
          <app-icon name="menu" />
        </button>
        <span class="mobile-logo"><app-logo [size]="26" link="/dashboard" [markOnly]="true" /></span>
        <span class="spacer"></span>

        @if (!onSales()) {
          <a class="btn small quick" routerLink="/sales"><app-icon name="plus" [size]="15" /> New sale</a>
        }
        <button class="icon-btn" (click)="theme.cycle()" [attr.aria-label]="'Theme: ' + theme.pref()" [title]="'Theme: ' + theme.pref()">
          <app-icon [name]="theme.pref() === 'system' ? 'monitor' : theme.pref() === 'dark' ? 'moon' : 'sun'" />
        </button>

        <div class="anchor" (click)="$event.stopPropagation()">
          <button class="icon-btn" (click)="toggleBell()" aria-label="Notifications">
            <app-icon name="bell" />
            @if (unread() > 0) {
              <span class="dot">{{ unread() > 9 ? '9+' : unread() }}</span>
            }
          </button>
          @if (bellOpen()) {
            <div class="pop notif-pop">
              <div class="pop-head">
                <h3>Notifications</h3>
                @if (unread() > 0) {
                  <button class="btn plain small" (click)="markAllRead()">Mark all read</button>
                }
              </div>
              <div class="notif-list">
                @for (n of notifications().slice(0, 8); track n.id) {
                  <button class="notif" [class.unread]="!n.read" (click)="openNotification(n)">
                    <span class="n-ico"><app-icon [name]="notifIcon(n.kind)" [size]="16" /></span>
                    <span class="grow">
                      <b>{{ n.title }}</b>
                      <small>{{ n.body }}</small>
                      <small class="when">{{ n.created_at | ago }}</small>
                    </span>
                  </button>
                } @empty {
                  <div class="empty">You're all caught up</div>
                }
              </div>
              <a class="pop-foot" routerLink="/notifications" (click)="bellOpen.set(false)">
                All notifications &amp; settings
              </a>
            </div>
          }
        </div>

        <div class="anchor" (click)="$event.stopPropagation()">
          <button class="user-btn" (click)="menuOpen.set(!menuOpen())" aria-label="Account">
            {{ auth.user()?.first_name || auth.user()?.email | initials }}
          </button>
          @if (menuOpen()) {
            <div class="pop user-pop">
              <div class="user-head">
                <b>{{ auth.user()?.first_name || 'Signed in' }}</b>
                <small>{{ auth.user()?.email }}</small>
              </div>
              <a class="pop-item" routerLink="/notifications" (click)="menuOpen.set(false)">
                <app-icon name="bell" [size]="16" /> Notifications
              </a>
              <a class="pop-item" routerLink="/plan" (click)="menuOpen.set(false)">
                <app-icon name="zap" [size]="16" /> Plan &amp; pricing
              </a>
              <a class="pop-item" routerLink="/security" (click)="menuOpen.set(false)">
                <app-icon name="shield" [size]="16" /> Security
              </a>
              <a class="pop-item" routerLink="/" (click)="menuOpen.set(false)">
                <app-icon name="external" [size]="16" /> Pfuma Mbiri website
              </a>
              <button class="pop-item danger" (click)="auth.logout()">
                <app-icon name="logout" [size]="16" /> Sign out
              </button>
            </div>
          }
        </div>
      </header>

      <main>
        <router-outlet />
      </main>
    </div>

    <nav class="tabbar">
      @for (t of tabs; track t.path) {
        <a [routerLink]="t.path" routerLinkActive="active">
          <app-icon [name]="t.icon" [size]="20" />
          <span>{{ t.label }}</span>
        </a>
      }
      <button (click)="navOpen.set(true); $event.stopPropagation()">
        <app-icon name="more" [size]="20" />
        <span>More</span>
      </button>
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
      .side {
        position: fixed;
        inset: 0 auto 0 0;
        width: 252px;
        z-index: 60;
        background: var(--sidebar-bg);
        color: var(--sidebar-text);
        display: flex;
        flex-direction: column;
        padding: 16px 12px;
        overflow-y: auto;
      }
      .side-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 8px 14px;
      }
      .close {
        display: none;
        color: var(--sidebar-text);
      }
      .biz {
        position: relative;
        margin-bottom: 8px;
      }
      .biz-btn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: #f5f5f5;
        cursor: pointer;
        text-align: left;
        font: inherit;
      }
      .biz-btn:disabled {
        cursor: default;
      }
      .biz-btn:not(:disabled):hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .biz-ava {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: #ffffff;
        color: #0a0a0a;
        font-weight: 800;
        font-size: 0.72rem;
        display: grid;
        place-items: center;
        flex: none;
      }
      .biz-ava.sm {
        width: 24px;
        height: 24px;
        font-size: 0.62rem;
        border-radius: 6px;
      }
      .biz-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .biz-text b {
        font-size: 0.84rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .biz-text small,
      .plan small {
        font-size: 0.72rem;
        opacity: 0.65;
      }
      .biz-pop {
        left: 0;
        right: 0;
        top: calc(100% + 6px);
      }
      .side nav {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
      }
      .group {
        font-size: 0.66rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(163, 163, 163, 0.6);
        margin: 14px 10px 4px;
      }
      .side nav a {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 7px 10px;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--sidebar-text);
        transition: background 0.12s, color 0.12s;
      }
      .side nav a:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
      }
      .side nav a.active {
        background: var(--sidebar-active);
        color: var(--sidebar-active-text);
        box-shadow: inset 2px 0 0 #2dd4bf;
      }
      .side nav a.active app-icon {
        color: #5eead4;
      }
      .plan {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #fbbf24;
      }
      .plan span {
        flex: 1;
        display: flex;
        flex-direction: column;
        color: #f5f5f5;
        font-size: 0.82rem;
      }
      .main {
        margin-left: 252px;
        min-width: 0;
      }
      .top {
        position: sticky;
        top: 0;
        z-index: 40;
        height: 60px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 24px;
        background: color-mix(in srgb, var(--bg) 82%, transparent);
        backdrop-filter: saturate(1.4) blur(10px);
        border-bottom: 1px solid var(--border);
      }
      .menu,
      .mobile-logo {
        display: none;
      }
      .quick {
        margin-right: 6px;
      }
      .anchor {
        position: relative;
      }
      .dot {
        position: absolute;
        top: 3px;
        right: 2px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 99px;
        background: var(--danger);
        color: #ffffff;
        font-size: 0.62rem;
        font-weight: 800;
        display: grid;
        place-items: center;
        border: 2px solid var(--bg);
      }
      .user-btn {
        width: 36px;
        height: 36px;
        margin-left: 4px;
        border-radius: 99px;
        border: none;
        cursor: pointer;
        font-weight: 700;
        font-size: 0.78rem;
        background: var(--primary);
        color: var(--on-primary);
      }
      .pop {
        position: absolute;
        z-index: 80;
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: var(--shadow-lg);
        padding: 6px;
        animation: pop 0.14s ease-out;
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
      .pop .eyebrow {
        padding: 6px 8px 2px;
      }
      .pop-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        background: none;
        border-radius: 8px;
        font: inherit;
        font-size: 0.86rem;
        color: var(--text);
        cursor: pointer;
        text-align: left;
      }
      .pop-item:hover {
        background: var(--surface-hover);
        color: var(--text);
      }
      .pop-item.danger {
        color: var(--danger);
      }
      .grow {
        flex: 1;
        min-width: 0;
      }
      .user-pop {
        right: 0;
        top: 44px;
        width: 230px;
      }
      .user-head {
        padding: 8px 10px 10px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--border);
        display: flex;
        flex-direction: column;
      }
      .user-head small {
        color: var(--text-3);
        font-size: 0.78rem;
      }
      .notif-pop {
        right: -40px;
        top: 44px;
        width: min(380px, calc(100vw - 24px));
        padding: 0;
        overflow: hidden;
      }
      .pop-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
      }
      .notif-list {
        max-height: 60vh;
        overflow: auto;
      }
      .notif {
        display: flex;
        gap: 12px;
        width: 100%;
        text-align: left;
        padding: 12px 14px;
        border: none;
        border-bottom: 1px solid var(--border);
        background: none;
        font: inherit;
        color: var(--text);
        cursor: pointer;
      }
      .notif:hover {
        background: var(--surface-hover);
      }
      .notif b {
        display: block;
        font-size: 0.86rem;
        font-weight: 600;
      }
      .notif small {
        display: block;
        font-size: 0.8rem;
        color: var(--text-2);
      }
      .notif small.when {
        color: var(--text-3);
        font-size: 0.72rem;
        margin-top: 3px;
      }
      .notif.unread {
        background: color-mix(in srgb, var(--primary-soft) 45%, transparent);
      }
      .n-ico {
        width: 32px;
        height: 32px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        background: var(--surface-hover);
        color: var(--text-2);
        flex: none;
      }
      .notif.unread .n-ico {
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .pop-foot {
        display: block;
        text-align: center;
        padding: 11px;
        font-size: 0.82rem;
        font-weight: 600;
      }
      .tabbar {
        display: none;
      }
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 55;
        background: rgba(0, 0, 0, 0.5);
      }
      @media (max-width: 900px) {
        .side {
          transform: translateX(-100%);
          transition: transform 0.22s ease;
          box-shadow: var(--shadow-lg);
        }
        .side.open {
          transform: none;
        }
        .close,
        .menu,
        .mobile-logo {
          display: inline-flex;
        }
        .main {
          margin-left: 0;
        }
        .top {
          padding: 0 12px;
        }
        .tabbar {
          display: flex;
          position: fixed;
          inset: auto 0 0 0;
          z-index: 50;
          height: calc(64px + env(safe-area-inset-bottom));
          padding-bottom: env(safe-area-inset-bottom);
          background: var(--surface);
          border-top: 1px solid var(--border);
        }
        .tabbar a,
        .tabbar button {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          font: inherit;
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--text-3);
          background: none;
          border: none;
          cursor: pointer;
        }
        .tabbar a.active {
          color: var(--primary);
        }
      }
      @media (max-width: 480px) {
        .quick {
          display: none;
        }
      }
    `,
  ],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private businessService = inject(BusinessService);
  private router = inject(Router);

  readonly nav = NAV;
  readonly tabs = TABS;

  navOpen = signal(false);
  menuOpen = signal(false);
  bellOpen = signal(false);
  bizOpen = signal(false);
  notifications = signal<AppNotification[]>([]);
  unread = computed(() => this.notifications().filter((n) => !n.read).length);
  private url = signal(this.router.url);
  /** the page itself already offers 'New sale' on these routes */
  onSales = computed(() => /^\/(sales|dashboard)/.test(this.url()));

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.closeAll();
    });
  }

  ngOnInit(): void {
    this.loadNotifications();
  }

  @HostListener('document:click')
  closeAll(): void {
    this.menuOpen.set(false);
    this.bellOpen.set(false);
    this.bizOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closeAll();
    this.navOpen.set(false);
  }

  notifIcon(kind: string): string {
    return NOTIF_ICON[kind] ?? 'bell';
  }

  async loadNotifications(): Promise<void> {
    try {
      this.notifications.set(asList<AppNotification>(await api.get('/notifications/')));
    } catch {
      /* notifications are non-critical */
    }
  }

  toggleBell(): void {
    const open = !this.bellOpen();
    this.closeAll();
    this.bellOpen.set(open);
    if (open) this.loadNotifications();
  }

  async openNotification(n: AppNotification): Promise<void> {
    if (!n.read) await this.markRead(n);
    this.bellOpen.set(false);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  async markAllRead(): Promise<void> {
    await Promise.all(this.notifications().filter((n) => !n.read).map((n) => this.markRead(n)));
  }

  private async markRead(n: AppNotification): Promise<void> {
    try {
      await api.post(`/notifications/${n.id}/read/`);
      this.notifications.update((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    } catch {
      /* leave it unread */
    }
  }

  async switchBusiness(id: number): Promise<void> {
    this.bizOpen.set(false);
    if (id !== this.auth.activeBusinessId()) await this.businessService.switch(id);
  }
}
