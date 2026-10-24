import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartComponent } from '../shared/chart.component';
import { api } from '../core/api';
import type { LoanHealth, LoanConsent } from '../core/models';

@Component({
  selector: 'app-loan',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Loan readiness</h1>
          <p class="sub">How ready your books are for a credit application</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="grid cols-2">
        <div class="card" style="text-align:center">
          <p class="stat-label">Health score</p>
          <p class="score-ring" [class]="scoreClass">{{ health()?.score ?? '—' }}</p>
          <p class="stat-sub">Band: {{ health()?.band || '—' }}</p>
        </div>

        <div class="card">
          <h3>Components</h3>
          @if (health(); as h) {
            <app-chart
              kind="bar"
              [labels]="['Data completeness', 'Fiscal consistency', 'Sales stability', 'Compliance']"
              [data]="[
                h.components.data_completeness,
                h.components.fiscalisation_consistency,
                h.components.sales_stability,
                h.components.compliance
              ]"
              [colors]="['#0F766E']"
              series="Score"
            />
          } @else {
            <div class="empty">Loading…</div>
          }
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="page-head">
          <h2>Lender data-sharing consent</h2>
        </div>
        <p class="muted">
          Grant a lender read-only access to a scoped slice of your verified business data.
          Revoke at any time.
        </p>
        @if (consent(); as c) {
          <p>
            <b>{{ c.lender }}</b> · scope: {{ c.data_scope }}
            <span class="badge" [class]="c.revoked_at ? 'slate' : 'green'">
              {{ c.revoked_at ? 'revoked' : 'active' }}
            </span>
          </p>
          <p class="muted">Granted: {{ c.granted_at | date: 'd MMM y' }} · Expires: {{ c.expires_at | date: 'd MMM y' }}</p>
          @if (!c.revoked_at) {
            <button class="btn danger small" (click)="revoke()" [disabled]="busy()">
              Revoke consent
            </button>
          }
        } @else {
          <form class="form-row" (ngSubmit)="grant()">
            <div>
              <label class="field">Lender</label>
              <input [(ngModel)]="consentForm.lender" name="lender" placeholder="Bank / MFI name" />
            </div>
            <div>
              <label class="field">Data scope</label>
              <input
                [(ngModel)]="consentForm.data_scope"
                name="scope"
                placeholder="sales_12m, tax_summary"
              />
            </div>
            <div>
              <label class="field">Expires</label>
              <input type="date" [(ngModel)]="consentForm.expires_at" name="expires" />
            </div>
            <div style="flex:0 0 auto;align-self:end">
              <button class="btn" [disabled]="busy()">Grant consent</button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class LoanComponent {
  health = signal<LoanHealth | null>(null);
  consent = signal<LoanConsent | null>(null);
  error = signal('');
  busy = signal(false);

  consentForm = {
    lender: '',
    data_scope: 'sales_12m, tax_summary',
    expires_at: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),
  };

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [health, consent] = await Promise.all([
        api.get<LoanHealth>('/loan/health/'),
        api.get<LoanConsent[]>('/loan/consent/').catch(() => null),
      ]);
      this.health.set(health);
      if (Array.isArray(consent)) {
        const active = consent.find((c) => !c.revoked_at) ?? consent[0] ?? null;
        this.consent.set(active);
      } else if (consent && !Array.isArray(consent)) {
        this.consent.set(consent as unknown as LoanConsent);
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load loan readiness');
    }
  }

  get scoreClass(): string {
    const s = this.health()?.score ?? 0;
    if (s >= 80) return 'score-good';
    if (s >= 50) return 'score-mid';
    return 'score-bad';
  }

  async grant(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/loan/consent/', { ...this.consentForm });
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Grant failed');
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(): Promise<void> {
    const c = this.consent();
    if (!c) return;
    this.busy.set(true);
    try {
      await api.post(`/loan/consent/${c.id}/revoke/`).catch(async () => {
        await api.patch(`/loan/consent/${c.id}/`, { revoked_at: new Date().toISOString() });
      });
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Revoke failed');
    } finally {
      this.busy.set(false);
    }
  }
}
