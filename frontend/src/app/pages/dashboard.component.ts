import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { api } from '../core/api';
import { AuthService } from '../core/auth.service';
import type { Dashboard } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ChartComponent } from '../shared/chart.component';
import { ScoreRingComponent } from '../shared/score-ring.component';
import { MoneyPipe, severityClass, severityIcon } from '../shared/format';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent, ChartComponent, ScoreRingComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">{{ now | date: 'EEEE, d MMMM' }}</p>
          <h1>{{ greeting() }}{{ auth.user()?.first_name ? ', ' + auth.user()?.first_name : '' }}</h1>
          <p class="sub">Here's how {{ auth.activeBusinessName() || 'your business' }} is doing.</p>
        </div>
        <div class="page-actions">
          <a class="btn ghost" routerLink="/expenses"><app-icon name="wallet" [size]="16" /> Add expense</a>
          <a class="btn ghost" routerLink="/leads"><app-icon name="target" [size]="16" /> Add lead</a>
          <a class="btn" routerLink="/sales"><app-icon name="plus" [size]="16" /> New sale</a>
        </div>
      </div>

      @if (error()) {
        <div class="alert error"><app-icon name="alert-circle" /> {{ error() }}</div>
      }

      @if (loading()) {
        <div class="grid cols-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="card"><div class="skeleton" style="height:16px;width:50%"></div><div class="skeleton" style="height:30px;margin-top:16px;width:70%"></div></div>
          }
        </div>
        <div class="skeleton" style="height:320px;margin-top:16px;border-radius:12px"></div>
      } @else if (d(); as d) {
        <div class="grid cols-4">
          <div class="card stat">
            <div class="stat-top"><p class="stat-label">Today's sales</p><span class="stat-icon"><app-icon name="cart" [size]="17" /></span></div>
            <p class="stat-value">{{ d.today_sales | money }}</p>
            <p class="stat-sub">{{ weekTotal() | money }} over the last 7 days</p>
          </div>
          <div class="card stat">
            <div class="stat-top"><p class="stat-label">Profit this month</p>
              <span class="stat-icon" [class.green]="+d.month_profit >= 0" [class.red]="+d.month_profit < 0">
                <app-icon [name]="+d.month_profit >= 0 ? 'trending-up' : 'trending-down'" [size]="17" />
              </span>
            </div>
            <p class="stat-value" [class.neg]="+d.month_profit < 0">{{ d.month_profit | money }}</p>
            <p class="stat-sub">Revenue less cost of sales &amp; expenses</p>
          </div>
          <div class="card stat">
            <div class="stat-top"><p class="stat-label">Cash position</p><span class="stat-icon blue"><app-icon name="wallet" [size]="17" /></span></div>
            <p class="stat-value" [class.neg]="+d.cash_position < 0">{{ d.cash_position | money }}</p>
            <p class="stat-sub">Cash in less expenses, month to date</p>
          </div>
          <a class="card stat interactive" routerLink="/invoices">
            <div class="stat-top"><p class="stat-label">Receivables</p><span class="stat-icon amber"><app-icon name="invoice" [size]="17" /></span></div>
            <p class="stat-value">{{ d.receivables | money }}</p>
            <p class="stat-sub">Unpaid invoices · view →</p>
          </a>
        </div>

        <div class="split" style="margin-top:16px">
          <div class="card">
            <div class="card-head">
              <div>
                <h2>Sales, last 14 days</h2>
                <p class="sub">Quick sales and invoices, VAT inclusive</p>
              </div>
              <a class="btn plain small" routerLink="/reports">Reports <app-icon name="arrow-right" [size]="14" /></a>
            </div>
            @if (d.sales_trend?.labels?.length) {
              <app-chart kind="bar" [labels]="d.sales_trend!.labels" [data]="d.sales_trend!.values" seriesLabel="Sales" [dateLabels]="true" [height]="250" />
            } @else {
              <div class="empty">No sales in the last two weeks</div>
            }
          </div>

          <div class="stack">
            <a class="card interactive health" routerLink="/compliance">
              <app-score-ring [score]="d.compliance_score" [size]="96" />
              <div>
                <p class="stat-label">Compliance score</p>
                <h3 style="margin-top:4px">{{ complianceText(d.compliance_score) }}</h3>
                <p class="muted">See issues and fixes →</p>
              </div>
            </a>
            <div class="grid" style="grid-template-columns:1fr 1fr">
              <a class="card stat interactive" routerLink="/tax">
                <div class="stat-top"><p class="stat-label">Next tax due</p><span class="stat-icon"><app-icon name="landmark" [size]="17" /></span></div>
                @if (d.next_tax; as nt) {
                  <p class="stat-value sm">{{ nt.amount | money }}</p>
                  <p class="stat-sub">{{ nt.type }} · {{ nt.due_date | date: 'd MMM' }}</p>
                } @else {
                  <p class="stat-value sm">Nothing due</p>
                  <p class="stat-sub">No payment scheduled</p>
                }
              </a>
              <a class="card stat interactive" routerLink="/leads">
                <div class="stat-top"><p class="stat-label">Open leads</p><span class="stat-icon amber"><app-icon name="target" [size]="17" /></span></div>
                <p class="stat-value sm">{{ d.open_leads }}</p>
                <p class="stat-sub">In your pipeline</p>
              </a>
            </div>
          </div>
        </div>

        <div class="section-title">
          <h2><app-icon name="sparkles" [size]="17" /> Advisor insights</h2>
          <a class="btn plain small" routerLink="/advisor">All insights <app-icon name="arrow-right" [size]="14" /></a>
        </div>
        <div class="grid cols-3">
          @for (i of d.top_insights; track i.id) {
            <div class="card insight sev" [class]="'card insight sev sev-' + i.severity">
              <div class="row" style="margin-bottom:8px">
                <span class="badge dot" [class]="'badge dot ' + sevClass(i.severity)">{{ i.severity }}</span>
              </div>
              <h3>{{ i.title }}</h3>
              <p class="text-2" style="font-size:0.86rem">{{ i.explanation }}</p>
              @if (i.recommended_action) {
                <p class="action"><app-icon name="arrow-right" [size]="14" /> {{ i.recommended_action }}</p>
              }
            </div>
          } @empty {
            <div class="card"><div class="empty">No insights yet. Keep recording sales and expenses.</div></div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      a.card {
        color: inherit;
        display: block;
      }
      .stat-value.sm {
        font-size: 1.25rem;
      }
      a.card.health {
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .section-title h2 {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .action {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--primary-ink);
        margin-top: 10px;
      }
      .action app-icon {
        margin-top: 3px;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  d = signal<Dashboard | null>(null);
  loading = signal(true);
  error = signal('');
  readonly now = new Date();

  weekTotal = computed(() => (this.d()?.sales_trend?.values ?? []).slice(-7).reduce((a, b) => a + b, 0));

  greeting(): string {
    const h = this.now.getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.d.set(await api.get<Dashboard>('/dashboard/'));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  complianceText(s: number | null): string {
    if (s === null || s === undefined) return 'Not scored yet';
    if (s >= 80) return 'Looking healthy';
    if (s >= 50) return 'A few things to fix';
    return 'Needs attention';
  }

  sevClass = severityClass;
  sevIcon = severityIcon;
}
