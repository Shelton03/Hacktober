import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LogoComponent } from '../shared/logo.component';
import { IconComponent } from '../shared/icon.component';

const DEMOS = [
  { email: 'owner.tuckshop@demo.com', label: 'Tendai Tuckshop', role: 'Owner · Harare · VAT registered', icon: 'store' },
  { email: 'owner.hardware@demo.com', label: 'Bulawayo Hardware', role: 'Owner · VAT registered', icon: 'package' },
  { email: 'owner.salon@demo.com', label: 'Mutare Hair Salon', role: 'Owner · not VAT registered', icon: 'star' },
  { email: 'accountant@demo.com', label: 'Accountant', role: 'All three businesses', icon: 'chart' },
  { email: 'staff@demo.com', label: 'Staff member', role: 'Tuckshop · limited access', icon: 'user' },
  { email: 'lender@demo.com', label: 'Lender portal', role: 'Sample portfolio · demo only', icon: 'briefcase' },
];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent, IconComponent],
  template: `
    <div class="wrap">
      <aside class="brand">
        <app-logo variant="light" [size]="34" />
        <div class="pitch">
          <h2>The business OS for Zimbabwean SMEs</h2>
          <ul>
            <li><app-icon name="receipt" [size]="18" /> ZIMRA FDMS fiscal receipts on every sale</li>
            <li><app-icon name="landmark" [size]="18" /> VAT &amp; QPD estimates that stay current</li>
            <li><app-icon name="sparkles" [size]="18" /> AI advisor &amp; security coach</li>
            <li><app-icon name="banknote" [size]="18" /> Loan-ready, verified books</li>
          </ul>
        </div>
        <p class="meaning"><i>Pfuma Mbiri</i> is Shona for “wealth &amp; glory”</p>
      </aside>

      <main class="side">
        <nav class="top">
          <a routerLink="/" class="btn plain small"><app-icon name="arrow-left" [size]="14" /> Home</a>
          <a routerLink="/plan" class="btn plain small">Pricing</a>
        </nav>

        <div class="form-col">
          <span class="mobile-logo"><app-logo [size]="34" /></span>
          <h1>Welcome back</h1>
          <p class="sub">Sign in to your business workspace.</p>

          <form (ngSubmit)="submit()">
            <label class="field" for="id">Email or phone</label>
            <div class="input-icon">
              <app-icon name="mail" [size]="16" />
              <input id="id" name="id" type="text" autocomplete="username" [(ngModel)]="emailOrPhone" placeholder="owner@shop.co.zw or +263…" required />
            </div>

            <label class="field" for="pw" style="margin-top:14px">Password</label>
            <div class="input-icon pw">
              <app-icon name="lock" [size]="16" />
              <input id="pw" name="pw" [type]="showPw() ? 'text' : 'password'" autocomplete="current-password" [(ngModel)]="password" required />
              <button type="button" class="icon-btn small eye" (click)="showPw.set(!showPw())" [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'">
                <app-icon name="eye" [size]="16" />
              </button>
            </div>

            @if (error()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ error() }}</div>
            }

            <button class="btn large block" style="margin-top:18px" [disabled]="busy()">
              {{ busy() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <div class="divider"><span>or explore a demo account</span></div>

          <div class="demos">
            @for (d of demos; track d.email) {
              <button type="button" class="demo" (click)="demoLogin(d.email)" [disabled]="busy()">
                <span class="d-ico"><app-icon [name]="d.icon" [size]="16" /></span>
                <span class="d-text"><b>{{ d.label }}</b><small>{{ d.role }}</small></span>
                <app-icon name="arrow-right" [size]="14" />
              </button>
            }
          </div>
          <p class="muted" style="text-align:center;margin-top:14px">
            Demo accounts use sample data · password <code>demo1234</code>
          </p>
          <p class="muted" style="text-align:center">
            New to Pfuma Mbiri? <a routerLink="/plan">See plans &amp; pricing</a>
          </p>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(340px, 0.9fr) 1.1fr;
        background: var(--bg);
      }
      .brand {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 40px 48px;
        color: #e5e5e5;
        background: #0a0a0a;
      }
      .pitch h2 {
        font-size: 1.9rem;
        line-height: 1.2;
        letter-spacing: -0.03em;
        font-weight: 800;
        color: #fff;
        max-width: 380px;
      }
      .pitch ul {
        list-style: none;
        padding: 0;
        margin: 28px 0 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .pitch li {
        display: flex;
        gap: 12px;
        align-items: center;
        font-size: 0.95rem;
      }
      .pitch app-icon {
        color: #5eead4;
      }
      .meaning {
        font-size: 0.82rem;
        color: #8a8a8a;
      }
      .side {
        display: flex;
        flex-direction: column;
        padding: 20px 24px 40px;
      }
      .top {
        display: flex;
        justify-content: space-between;
      }
      .form-col {
        width: 100%;
        max-width: 420px;
        margin: auto;
        padding-top: 24px;
      }
      .mobile-logo {
        display: none;
        margin-bottom: 20px;
      }
      .sub {
        color: var(--text-2);
        margin: 6px 0 24px;
      }
      .pw input {
        padding-right: 42px;
      }
      .eye {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 28px 0 16px;
        color: var(--text-3);
        font-size: 0.78rem;
      }
      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
      }
      .demos {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .demo {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.12s, box-shadow 0.12s;
      }
      .demo:hover:not(:disabled) {
        border-color: var(--primary);
        box-shadow: var(--shadow);
      }
      .demo:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .demo > app-icon {
        color: var(--text-3);
      }
      .d-ico {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: var(--primary-soft);
        color: var(--primary-ink);
        flex: none;
      }
      .d-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .d-text b {
        font-size: 0.82rem;
      }
      .d-text small {
        font-size: 0.7rem;
        color: var(--text-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      code {
        background: var(--surface-hover);
        padding: 1px 6px;
        border-radius: 5px;
      }
      @media (max-width: 900px) {
        .wrap {
          grid-template-columns: 1fr;
        }
        .brand {
          display: none;
        }
        .mobile-logo {
          display: block;
        }
      }
      @media (max-width: 460px) {
        .demos {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly demos = DEMOS;

  emailOrPhone = signal('');
  password = signal('');
  showPw = signal(false);
  busy = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    // already signed in → go to the right portal (SME or lender), not always /dashboard
    const user = this.auth.user() ?? (await this.auth.loadMe());
    if (user) this.router.navigateByUrl(this.auth.home());
  }

  async demoLogin(email: string): Promise<void> {
    this.emailOrPhone.set(email);
    this.password.set('demo1234');
    await this.submit();
  }

  async submit(): Promise<void> {
    if (!this.emailOrPhone() || !this.password() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.emailOrPhone(), this.password());
    } catch (e: any) {
      this.error.set(e?.status === 400 || e?.status === 401 || e?.status === 403
        ? 'That email/phone and password don’t match.'
        : e?.message || 'Sign-in failed. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
