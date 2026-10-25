import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { api } from '../core/api';
import { ChartComponent, ChartSeries } from '../shared/chart.component';
import { IconComponent } from '../shared/icon.component';
import { MoneyPipe, daysAgo, localDate, today } from '../shared/format';
import { ToastService } from '../shared/toast.service';

interface Pnl {
  sales: string;
  cogs: string;
  gross_profit: string;
  expenses: string;
  net_profit: string;
  gross_margin: number | null;
}
interface Mix {
  labels: string[];
  data: number[];
}
type Preset = '7d' | '30d' | '90d' | 'month' | 'custom';

const EMPTY_MIX: Mix = { labels: [], data: [] };

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule, RouterLink, ChartComponent, IconComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Reports</h1>
          <p class="sub">Profit &amp; loss, sales mix and cash flow from your ledger.</p>
        </div>
        <div class="toolbar" style="margin:0">
          <div class="seg">
            @for (p of presets; track p.key) {
              <button [class.active]="preset() === p.key" (click)="usePreset(p.key)">{{ p.label }}</button>
            }
          </div>
          <input type="date" [(ngModel)]="from" (ngModelChange)="preset.set('custom'); load()" style="width:auto" aria-label="From" />
          <span class="muted">→</span>
          <input type="date" [(ngModel)]="to" (ngModelChange)="preset.set('custom'); load()" style="width:auto" aria-label="To" />
        </div>
      </div>

      <div class="grid cols-4">
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Net sales</p><span class="stat-icon"><app-icon name="cart" [size]="17" /></span></div>
          <p class="stat-value">{{ pnl()?.sales | money }}</p>
          <p class="stat-sub">Excluding VAT</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Gross profit</p><span class="stat-icon green"><app-icon name="trending-up" [size]="17" /></span></div>
          <p class="stat-value">{{ pnl()?.gross_profit | money }}</p>
          <p class="stat-sub">{{ pnl()?.gross_margin ?? '–' }}% gross margin</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Expenses</p><span class="stat-icon amber"><app-icon name="wallet" [size]="17" /></span></div>
          <p class="stat-value">{{ pnl()?.expenses | money }}</p>
          <p class="stat-sub">Operating costs</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Net profit</p>
            <span class="stat-icon" [class.red]="netNeg()" [class.green]="!netNeg()"><app-icon [name]="netNeg() ? 'trending-down' : 'trending-up'" [size]="17" /></span>
          </div>
          <p class="stat-value" [class.neg]="netNeg()">{{ pnl()?.net_profit | money }}</p>
          <p class="stat-sub">After cost of sales &amp; expenses</p>
        </div>
      </div>

      <div class="split" style="margin-top:16px">
        <div class="card">
          <div class="card-head">
            <div><h2>Cash flow</h2><p class="sub">Money received vs. money spent, per day</p></div>
          </div>
          @if (cashLabels().length) {
            <app-chart kind="bar" [labels]="cashLabels()" [series]="cashSeries()" [dateLabels]="true" [height]="280" />
          } @else {
            <div class="empty">No cash movements in this range</div>
          }
        </div>
        <div class="card">
          <h2 style="margin-bottom:12px">Profit &amp; loss</h2>
          @if (pnl(); as p) {
            <div class="kv"><span>Net sales</span><span>{{ p.sales | money }}</span></div>
            <div class="kv"><span>Cost of sales</span><span>−{{ p.cogs | money }}</span></div>
            <div class="kv total"><span>Gross profit</span><span>{{ p.gross_profit | money }}</span></div>
            <div class="kv"><span>Expenses</span><span>−{{ p.expenses | money }}</span></div>
            <div class="kv total"><span>Net profit</span><span [class.neg]="netNeg()">{{ p.net_profit | money }}</span></div>
          } @else {
            <div class="skeleton" style="height:180px"></div>
          }
          <p class="muted" style="margin-top:14px">
            Cost of sales uses each product's current cost price. VAT returns and QPD estimates are under
            <a routerLink="/tax">Tax</a>.
          </p>
        </div>
      </div>

      <div class="grid cols-3" style="margin-top:16px">
        <div class="card">
          <h2 style="margin-bottom:12px">Top products</h2>
          @if (byProduct().labels.length) {
            <app-chart kind="bar" [horizontal]="true" [labels]="byProduct().labels" [data]="byProduct().data" seriesLabel="Sales" />
          } @else {
            <div class="empty">No product sales</div>
          }
        </div>
        <div class="card">
          <h2 style="margin-bottom:12px">Top customers</h2>
          @if (byCustomer().labels.length) {
            <app-chart kind="bar" [horizontal]="true" [labels]="byCustomer().labels" [series]="[{ label: 'Sales', data: byCustomer().data, color: 'chart-2' }]" />
          } @else {
            <div class="empty">No customer sales</div>
          }
        </div>
        <div class="card">
          <h2 style="margin-bottom:12px">Expenses by category</h2>
          @if (byCategory().labels.length) {
            <app-chart kind="doughnut" [labels]="byCategory().labels" [data]="byCategory().data" seriesLabel="Expenses" />
          } @else {
            <div class="empty">No expenses</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  private toast = inject(ToastService);
  readonly presets: { key: Preset; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'month', label: 'This month' },
  ];

  preset = signal<Preset>('30d');
  from = daysAgo(29);
  to = today();

  pnl = signal<Pnl | null>(null);
  byProduct = signal<Mix>(EMPTY_MIX);
  byCustomer = signal<Mix>(EMPTY_MIX);
  byCategory = signal<Mix>(EMPTY_MIX);
  cashLabels = signal<string[]>([]);
  cashSeries = signal<ChartSeries[]>([]);

  netNeg(): boolean {
    return Number(this.pnl()?.net_profit ?? 0) < 0;
  }

  ngOnInit(): void {
    this.load();
  }

  usePreset(p: Preset): void {
    this.preset.set(p);
    this.to = today();
    if (p === 'month') {
      const d = new Date();
      this.from = localDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      this.from = daysAgo({ '7d': 6, '30d': 29, '90d': 89 }[p as '7d'] ?? 29);
    }
    this.load();
  }

  async load(): Promise<void> {
    const query = { from: this.from, to: this.to };
    const get = (kind: string) => api.get<any>(`/reports/${kind}/`, query);
    try {
      const [pnl, bp, bc, ec, cf] = await Promise.all([
        get('pnl'),
        get('sales-by-product'),
        get('sales-by-customer'),
        get('expenses-by-category'),
        get('cashflow'),
      ]);
      this.pnl.set(pnl);
      this.byProduct.set(this.mix(bp));
      this.byCustomer.set(this.mix(bc));
      this.byCategory.set(this.mix(ec));
      const moved = (cf?.cash_in ?? []).some((v: number) => v) || (cf?.cash_out ?? []).some((v: number) => v);
      this.cashLabels.set(moved ? cf.labels : []);
      this.cashSeries.set([
        { label: 'Cash in', data: cf?.cash_in ?? [], color: 'chart-1' },
        { label: 'Cash out', data: cf?.cash_out ?? [], color: 'chart-2' },
      ]);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load reports');
    }
  }

  private mix(rows: { label: string; value: number }[] | null): Mix {
    if (!Array.isArray(rows)) return EMPTY_MIX;
    return { labels: rows.map((r) => r.label), data: rows.map((r) => r.value) };
  }
}
