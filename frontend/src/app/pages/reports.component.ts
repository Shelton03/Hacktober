import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartComponent } from '../shared/chart.component';
import { api } from '../core/api';
import type { VatSummary, QpdRow } from '../core/models';

interface ReportResponse {
  [k: string]: any;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Reports</h1>
          <p class="sub">Profit &amp; loss, sales, expenses and cash flow — chart.js visuals</p>
        </div>
      </div>

      <div class="toolbar">
        <div>
          <label class="field">From</label>
          <input type="date" [(ngModel)]="from" name="from" />
        </div>
        <div>
          <label class="field">To</label>
          <input type="date" [(ngModel)]="to" name="to" />
        </div>
        <button class="btn" (click)="load()">Apply</button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <!-- P&L -->
      <div class="card" style="margin-bottom:14px">
        <h2>Profit &amp; Loss</h2>
        <div class="table-wrap">
          <table class="list">
            <tbody>
              <tr><td>Total sales</td><td class="num">{{ pnl().sales }}</td></tr>
              <tr><td>Cost of sales</td><td class="num">{{ pnl().cogs }}</td></tr>
              <tr><td>Gross profit</td><td class="num"><b>{{ pnl().gross }}</b></td></tr>
              <tr><td>Expenses</td><td class="num">{{ pnl().expenses }}</td></tr>
              <tr><td>Net profit</td><td class="num"><b>{{ pnl().net }}</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h2>Sales by product</h2>
          @if (byProduct().labels.length) {
            <app-chart kind="bar" [labels]="byProduct().labels" [data]="byProduct().data"
              [colors]="['#0F766E']" series="Sales" />
          } @else {
            <div class="empty">No data for this range</div>
          }
        </div>
        <div class="card">
          <h2>Sales by customer</h2>
          @if (byCustomer().labels.length) {
            <app-chart kind="bar" [labels]="byCustomer().labels" [data]="byCustomer().data"
              [colors]="['#F59E0B']" series="Sales" />
          } @else {
            <div class="empty">No data for this range</div>
          }
        </div>
        <div class="card">
          <h2>Expenses by category</h2>
          @if (byCategory().labels.length) {
            <app-chart kind="doughnut" [labels]="byCategory().labels" [data]="byCategory().data"
              [colors]="catColors" series="Expenses" />
          } @else {
            <div class="empty">No data for this range</div>
          }
        </div>
        <div class="card">
          <h2>Cash flow</h2>
          @if (cashFlow().labels.length) {
            <app-chart kind="line" [labels]="cashFlow().labels" [data]="cashFlow().data"
              series="Net cash" />
          } @else {
            <div class="empty">No data for this range</div>
          }
        </div>
      </div>

      <p class="muted" style="margin-top:12px">
        Reports use the ledger totals for the selected range. Downloadable tax summaries live under
        <a routerLink="/tax">Tax</a>.
      </p>
    </div>
  `,
})
export class ReportsComponent {
  from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  to = new Date().toISOString().slice(0, 10);
  error = signal('');

  pnl = signal({ sales: '0', cogs: '0', gross: '0', expenses: '0', net: '0' });
  byProduct = signal<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  byCustomer = signal<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  byCategory = signal<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  cashFlow = signal<{ labels: string[]; data: number[] }>({ labels: [], data: [] });

  catColors = ['#0F766E', '#F59E0B', '#334155', '#14B8A6', '#D97706', '#64748B'];

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    const query = { from: this.from, to: this.to };
    try {
      const [pnl, bp, bc, ec, cf] = await Promise.all([
        api.get<any>('/reports/pnl/', query).catch(() => null),
        api.get<any>('/reports/sales-by-product/', query).catch(() => null),
        api.get<any>('/reports/sales-by-customer/', query).catch(() => null),
        api.get<any>('/reports/expenses-by-category/', query).catch(() => null),
        api.get<any>('/reports/cashflow/', query).catch(() => null),
      ]);
      if (pnl) {
        this.pnl.set({
          sales: pnl.sales ?? pnl.total_sales ?? '0',
          cogs: pnl.cogs ?? '0',
          gross: pnl.gross_profit ?? pnl.gross ?? '0',
          expenses: pnl.expenses ?? pnl.total_expenses ?? '0',
          net: pnl.net_profit ?? pnl.net ?? '0',
        });
      }
      this.byProduct.set(this.toChart(bp));
      this.byCustomer.set(this.toChart(bc));
      this.byCategory.set(this.toChart(ec));
      this.cashFlow.set(this.toChart(cf));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load reports');
    }
  }

  /** Accepts [{label/name, value/total/amount}] or {labels:[], values:[]}. */
  private toChart(res: any): { labels: string[]; data: number[] } {
    if (!res) return { labels: [], data: [] };
    if (Array.isArray(res)) {
      return {
        labels: res.map((r: any) => r.label ?? r.name ?? r.category ?? String(r.product ?? '')),
        data: res.map((r: any) =>
          Number(r.value ?? r.total ?? r.amount ?? Object.values(r).find(v => typeof v === 'number') ?? 0)
        ),
      };
    }
    if (Array.isArray(res.labels)) {
      return { labels: res.labels, data: (res.values ?? res.data ?? []).map(Number) };
    }
    return { labels: [], data: [] };
  }
}
