import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { api } from '../../core/api';
import type { LenderSmeDetail } from '../../core/models';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ScoreRingComponent } from '../../shared/score-ring.component';
import { LabelPipe, MoneyPipe } from '../../shared/format';

@Component({
  selector: 'app-lender-sme',
  standalone: true,
  imports: [RouterLink, ChartComponent, IconComponent, ScoreRingComponent, LabelPipe, MoneyPipe],
  template: `
    <div class="page">
      <a class="btn plain small" routerLink="/lender" style="margin-bottom:12px"><app-icon name="arrow-left" [size]="14" /> Portfolio</a>

      @if (error()) {
        <div class="alert error"><app-icon name="alert-circle" /> {{ error() }}</div>
      }

      @if (d(); as d) {
        <div class="page-head">
          <div>
            <p class="eyebrow mono">{{ d.ref_id }}</p>
            <h1>{{ d.name }}</h1>
            <p class="sub">{{ d.sector | label }} · {{ d.location }}</p>
          </div>
          <span class="badge dot" [class]="d.consent_status === 'granted' ? 'green' : 'slate'">Consent {{ d.consent_status }}</span>
        </div>

        <div class="grid cols-4">
          <div class="card ring-card">
            <app-score-ring [score]="d.health_score" [size]="110" label="health" />
          </div>
          <div class="card ring-card">
            <app-score-ring [score]="d.credit_score" [max]="850" [size]="110" label="credit" />
          </div>
          <div class="card stat">
            <p class="stat-label">Risk band</p>
            <p class="band" [class]="'band risk-' + d.risk_band">{{ d.risk_band }}</p>
          </div>
          <div class="card stat">
            <p class="stat-label">Verified revenue (latest)</p>
            <p class="stat-value">{{ latest() | money: 'USD' : 0 }}</p>
            <p class="stat-sub" [class.pos]="growth() >= 0" [class.neg]="growth() < 0">
              {{ growth() >= 0 ? '▲' : '▼' }} {{ abs(growth()) }}% over 12 months
            </p>
          </div>
        </div>

        <div class="split" style="margin-top:16px">
          <div class="card">
            <div class="card-head"><div><h2>FDMS-verified sales</h2><p class="sub">Monthly totals from fiscal receipts</p></div></div>
            <app-chart kind="line" [labels]="months()" [data]="d.verified_sales_trend" seriesLabel="Verified sales" [height]="260" />
          </div>
          <div class="card">
            <h2 style="margin-bottom:12px">Score drivers</h2>
            @for (r of d.credit_reasons; track $index) {
              <div class="reason">
                <span class="r-ico" [class.neg]="isNegative(r)"><app-icon [name]="isNegative(r) ? 'trending-down' : 'trending-up'" [size]="14" /></span>
                <span>{{ r }}</span>
              </div>
            } @empty {
              <p class="muted">No reasons provided</p>
            }
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-head"><div><h2>Compliance history</h2><p class="sub">Monthly compliance score</p></div></div>
          <app-chart kind="bar" [labels]="complianceLabels()" [series]="[{ label: 'Score', data: complianceValues(), color: 'chart-2' }]" [money]="false" [height]="200" />
        </div>
      } @else if (!error()) {
        <div class="skeleton" style="height:420px;border-radius:12px"></div>
      }
    </div>
  `,
  styles: [
    `
      .ring-card {
        display: grid;
        place-items: center;
      }
      .band {
        font-size: 2.2rem;
        font-weight: 800;
        width: 64px;
        height: 64px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        margin: 10px 0 0;
      }
      .reason {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
        font-size: 0.86rem;
      }
      .reason:last-child {
        border-bottom: none;
      }
      .r-ico {
        width: 26px;
        height: 26px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: var(--success-soft);
        color: var(--success-ink);
        flex: none;
      }
      .r-ico.neg {
        background: var(--danger-soft);
        color: var(--danger-ink);
      }
    `,
  ],
})
export class LenderSmeComponent {
  /** route param via withComponentInputBinding */
  id = input<string>();

  d = signal<LenderSmeDetail | null>(null);
  error = signal('');

  latest = computed(() => {
    const t = this.d()?.verified_sales_trend ?? [];
    return t.length ? t[t.length - 1] : 0;
  });
  growth = computed(() => {
    const t = this.d()?.verified_sales_trend ?? [];
    return t.length > 1 && t[0] ? Math.round(((t[t.length - 1] - t[0]) / t[0]) * 100) : 0;
  });
  /** trend has no dates, so label the last N months ending this month */
  months = computed(() => {
    const n = this.d()?.verified_sales_trend.length ?? 0;
    const now = new Date();
    return Array.from({ length: n }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1).toLocaleDateString('en-GB', { month: 'short' })
    );
  });
  private history = computed(() => [...(this.d()?.compliance_history ?? [])].sort((a, b) => a.month.localeCompare(b.month)));
  complianceLabels = computed(() =>
    this.history().map((h) => new Date(h.month + '-01T00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }))
  );
  complianceValues = computed(() => this.history().map((h) => h.score));

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.load(Number(id));
    });
  }

  async load(id: number): Promise<void> {
    this.error.set('');
    this.d.set(null);
    try {
      this.d.set(await api.get<LenderSmeDetail>(`/lender/smes/${id}/`));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load SME profile');
    }
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  isNegative(reason: string): boolean {
    return /dip|diverge|lack|outstanding|late|missing|decline|drop|irregular/i.test(reason);
  }
}
