import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { QpdRow, VatSummary } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { MoneyPipe, today } from '../shared/format';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-tax',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Tax</h1>
          <p class="sub">VAT position and Quarterly Payment Dates (QPD), estimated from your books.</p>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head">
            <div><h2>VAT return</h2><p class="sub">Output VAT on fiscalised sales less validated input VAT</p></div>
            <input type="month" [(ngModel)]="vatPeriod" (ngModelChange)="loadVat()" style="width:auto" aria-label="VAT period" />
          </div>
          @if (vat(); as v) {
            <div class="vat-hero" [class.refund]="+v.vat_payable < 0">
              <p class="stat-label">{{ +v.vat_payable < 0 ? 'VAT refund position' : 'VAT payable' }}</p>
              <p class="stat-value">{{ abs(v.vat_payable) | money }}</p>
              <p class="stat-sub"><app-icon name="calendar" [size]="13" /> Return due {{ v.due_date | date: 'd MMMM y' }}</p>
            </div>
            <div class="kv"><span>Output VAT · {{ v.fiscalised_sales ?? 0 }} fiscalised sale(s)</span><span>{{ v.output_vat | money }}</span></div>
            <div class="kv"><span>Input VAT · {{ v.validated_purchases ?? 0 }} validated purchase(s)</span><span>−{{ v.input_vat | money }}</span></div>
            <div class="kv total"><span>Net VAT</span><span>{{ v.vat_payable | money }}</span></div>
          } @else {
            <div class="skeleton" style="height:200px"></div>
          }
        </div>

        <div class="card">
          <div class="card-head">
            <div><h2>QPD instalments</h2><p class="sub">Provisional income tax, cumulative 10/25/30/35%</p></div>
            <div class="row">
              <button class="icon-btn small" (click)="shiftYear(-1)" aria-label="Previous year"><app-icon name="chevron-left" [size]="16" /></button>
              <b style="min-width:42px;text-align:center">{{ qpdYear }}</b>
              <button class="icon-btn small" (click)="shiftYear(1)" aria-label="Next year"><app-icon name="chevron-right" [size]="16" /></button>
            </div>
          </div>
          <div class="timeline">
            @for (q of qpd(); track q.qtr) {
              <div class="q" [class.past]="q.due_date < todayStr" [class.next]="q.qtr === nextQtr()">
                <span class="q-dot">Q{{ q.qtr }}</span>
                <div style="flex:1">
                  <div class="row" style="justify-content:space-between">
                    <b>{{ q.due_date | date: 'd MMM y' }}</b>
                    <b class="num">{{ q.payment | money }}</b>
                  </div>
                  <span class="muted">{{ q.percent }}% of estimated annual tax {{ q.estimated_tax | money }}</span>
                  @if (q.qtr === nextQtr()) {
                    <span class="badge amber" style="margin-left:6px">Next</span>
                  }
                </div>
              </div>
            } @empty {
              <div class="empty">No QPD data</div>
            }
          </div>
        </div>
      </div>

      <div class="alert info" style="margin-top:18px">
        <app-icon name="info" />
        <span>{{ vat()?.disclaimer || 'Estimates only. Confirm with ZIMRA or a registered tax practitioner.' }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      .vat-hero {
        padding: 16px;
        border-radius: 12px;
        background: var(--accent-soft);
        margin-bottom: 10px;
      }
      .vat-hero.refund {
        background: var(--success-soft);
      }
      .vat-hero .stat-sub {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-2);
      }
      .timeline {
        display: flex;
        flex-direction: column;
      }
      .q {
        display: flex;
        gap: 14px;
        padding: 12px 0;
        border-bottom: 1px dashed var(--border);
      }
      .q:last-child {
        border-bottom: none;
      }
      .q-dot {
        width: 38px;
        height: 38px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        font-size: 0.75rem;
        font-weight: 800;
        background: var(--surface-hover);
        color: var(--text-2);
        flex: none;
      }
      .q.past {
        opacity: 0.55;
      }
      .q.next .q-dot {
        background: var(--warn);
        color: #1f1300;
      }
    `,
  ],
})
export class TaxComponent implements OnInit {
  private toast = inject(ToastService);
  readonly todayStr = today();
  vatPeriod = today().slice(0, 7);
  qpdYear = new Date().getFullYear();
  vat = signal<VatSummary | null>(null);
  qpd = signal<QpdRow[]>([]);

  nextQtr = computed(() => this.qpd().find((q) => q.due_date >= this.todayStr)?.qtr ?? null);

  ngOnInit(): void {
    this.loadVat();
    this.loadQpd();
  }

  abs(v: string): number {
    return Math.abs(Number(v));
  }

  shiftYear(d: number): void {
    this.qpdYear += d;
    this.loadQpd();
  }

  async loadVat(): Promise<void> {
    try {
      this.vat.set(await api.get<VatSummary>('/tax/vat-summary/', { period: this.vatPeriod }));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load VAT summary');
    }
  }

  async loadQpd(): Promise<void> {
    try {
      this.qpd.set(asList<QpdRow>(await api.get('/tax/qpd/', { year: this.qpdYear })));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load QPD');
    }
  }
}
