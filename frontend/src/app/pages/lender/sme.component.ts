import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChartComponent } from '../../shared/chart.component';
import { api } from '../../core/api';
import type { LenderSmeDetail } from '../../core/models';

@Component({
  selector: 'app-lender-sme',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ChartComponent],
  template: `
    <div class="page">
      <div class="demo-banner">DEMO — sample data</div>
      <div class="page-head">
        <div>
          <h1>{{ d()?.name || 'SME #' + (d()?.id ?? '') }}</h1>
          <p class="sub">
            {{ d()?.sector }} · {{ d()?.location }} ·
            <a routerLink="/lender">← back to portfolio</a>
          </p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @if (d(); as d) {
        <div class="grid cols-4">
          <div class="card" style="text-align:center">
            <p class="stat-label">Health score</p>
            <p class="score-ring" [class]="scoreClass(d.health_score)">{{ d.health_score }}</p>
          </div>
          <div class="card" style="text-align:center">
            <p class="stat-label">Risk band</p>
            <p class="score-ring">{{ d.risk_band }}</p>
          </div>
          <div class="card" style="text-align:center">
            <p class="stat-label">Credit score</p>
            <p class="score-ring" [class]="scoreClass(d.credit_score)">{{ d.credit_score ?? '—' }}</p>
          </div>
          <div class="card" style="text-align:center">
            <p class="stat-label">Consent status</p>
            <p class="stat-value">{{ d.consent_status || '—' }}</p>
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:14px">
          <div class="card">
            <h2>Verified sales (fiscal receipts)</h2>
            @if (d.verified_sales?.labels?.length) {
              <app-chart
                kind="line"
                [labels]="d.verified_sales!.labels"
                [data]="d.verified_sales!.values"
                series="Sales"
              />
            } @else {
              <div class="empty">No verified sales data</div>
            }
          </div>
          <div class="card">
            <h2>Compliance history</h2>
            @if (d.compliance_history?.labels?.length) {
              <app-chart
                kind="bar"
                [labels]="d.compliance_history!.labels"
                [data]="d.compliance_history!.values"
                [colors]="['#F59E0B']"
                series="Score"
              />
            } @else {
              <div class="empty">No compliance history</div>
            }
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h2>Top 5 credit score reasons</h2>
          @for (r of d.credit_reasons ?? []; track $index) {
            <p><span class="badge teal">{{ $index + 1 }}</span> {{ r }}</p>
          } @empty {
            <p class="muted">No reasons provided</p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .demo-banner {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 8px 12px;
        font-weight: 700;
        font-size: 0.85rem;
        margin-bottom: 12px;
        text-align: center;
      }
    `,
  ],
})
export class LenderSmeComponent {
  d = signal<LenderSmeDetail | null>(null);
  error = signal('');

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.load(Number(id));
    });
  }

  async load(id: number): Promise<void> {
    try {
      this.d.set(await api.get<LenderSmeDetail>(`/lender/smes/${id}/`));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load SME profile');
    }
  }

  scoreClass(score?: number): string {
    const s = score ?? 0;
    if (s >= 80) return 'score-good';
    if (s >= 50) return 'score-mid';
    return 'score-bad';
  }
}
