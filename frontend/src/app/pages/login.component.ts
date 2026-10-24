import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-wrap">
      <div class="login-col">
      <form class="card login-card" (ngSubmit)="submit()">
        <div class="brand-mark">PM</div>
        <h1>Pfuma Mbiri</h1>
        <p class="sub">Pfuma Mbiri — Shona for “Wealth &amp; Glory” (pfuma = wealth, mbiri = glory)</p>
        <p class="sub">Sign in to your business workspace</p>

        <label class="field" for="id">Email or phone</label>
        <input
          id="id"
          name="id"
          type="text"
          autocomplete="username"
          [(ngModel)]="emailOrPhone"
          placeholder="owner@shop.co.zw"
          required
        />

        <label class="field" for="pw" style="margin-top:10px">Password</label>
        <input
          id="pw"
          name="pw"
          type="password"
          autocomplete="current-password"
          [(ngModel)]="password"
          required
        />

        @if (error()) {
          <div class="alert error">{{ error() }}</div>
        }

        <button class="btn" style="width:100%;margin-top:14px" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
        <p class="muted" style="text-align:center;margin-top:12px">
          No account yet? <a routerLink="/plan">See plans &amp; pricing</a>
        </p>
      </form>

      <div class="card demo-card">
        <h3>Try the demo</h3>
        <div class="demo-grid">
          @for (d of demoLogins; track d.email) {
            <button
              type="button"
              class="demo-btn"
              (click)="demoLogin(d.email)"
              [disabled]="busy()"
            >
              {{ d.label }}
            </button>
          }
        </div>
        <p class="demo-note">Demo logins — sample data, password demo1234</p>
      </div>
      <footer class="cover-foot">Pfuma Mbiri · Shona for Wealth &amp; Glory</footer>
      </div>
    </div>
  `,
  styles: [
    `
      .login-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: linear-gradient(160deg, #f0fdfa 0%, #f8fafc 55%, #fffbeb 100%);
      }
      .login-col {
        width: 100%;
        max-width: 400px;
      }
      .login-card {
        padding: 26px 24px;
      }
      .brand-mark {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: #0f766e;
        color: #fff;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
      }
      .sub {
        color: #64748b;
        margin: 0 0 16px;
        font-size: 0.88rem;
      }
      .demo-card {
        margin-top: 14px;
        padding: 16px;
      }
      .demo-card h3 {
        margin: 0 0 10px;
        font-size: 0.9rem;
      }
      .demo-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      @media (max-width: 480px) {
        .demo-grid {
          grid-template-columns: 1fr;
        }
      }
      .demo-btn {
        border: 1px solid #0f766e;
        color: #0f766e;
        background: #fff;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .demo-btn:hover {
        background: #ccfbf1;
      }
      .demo-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .demo-note {
        margin: 10px 0 0;
        font-size: 0.72rem;
        color: #64748b;
        text-align: center;
      }
      .cover-foot {
        margin-top: 14px;
        text-align: center;
        color: #64748b;
        font-size: 0.78rem;
      }
    `,
  ],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  emailOrPhone = signal('');
  password = signal('');
  busy = signal(false);
  error = signal('');

  demoLogins = [
    { label: 'Owner — Tendai Tuckshop', email: 'owner.tuckshop@demo.com' },
    { label: 'Owner — Bulawayo Hardware', email: 'owner.hardware@demo.com' },
    { label: 'Owner — Mutare Salon', email: 'owner.salon@demo.com' },
    { label: 'Accountant', email: 'accountant@demo.com' },
    { label: 'Staff', email: 'staff@demo.com' },
    { label: 'Lender demo view', email: 'lender@demo.com' },
  ];

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
      this.error.set(e?.body?.detail || e?.message || 'Login failed — check your credentials.');
    } finally {
      this.busy.set(false);
    }
  }

  ngOnInit(): void {
    // Already signed in? Skip the form.
    if (this.auth.user()) {
      this.router.navigateByUrl('/dashboard');
    }
  }
}
