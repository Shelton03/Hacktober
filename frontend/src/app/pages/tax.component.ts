import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { VatSummary, QpdRow } from '../core/models';

@Component({
  selector: 'app-tax',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Tax</h1>
          <p class="sub">VAT summary and quarterly payment dates (QPD)</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="grid cols-2">
        <div class="card">
          <div class="page-head">
            <h2>VAT summary</h2>
            <input
              type="month"
              [(ngModel)]="vatPeriod"
              (ngModelChange)="loadVat()"
              style="width:auto"
            />
          </div>
          @if (vat(); as v) {
            <table class="list">
              <tbody>
                <tr><td>Output VAT</td><td class="num">{{ v.output_vat }}</td></tr>
                <tr><td>Input VAT (validated)</td><td class="num">{{ v.input_vat }}</td></tr>
                <tr><td><b>VAT payable</b></td><td class="num"><b>{{ v.vat_payable }}</b></td></tr>
                <tr><td>Due date</td><td class="num">{{ v.due_date }}</td></tr>
              </tbody>
            </table>
          } @else {
            <div class="empty">Select a period</div>
          }
        </div>

        <div class="card">
          <div class="page-head">
            <h2>QPD — quarterly payment dates</h2>
            <input
              type="number"
              [(ngModel)]="qpdYear"
              (ngModelChange)="loadQpd()"
              style="width:90px"
            />
          </div>
          <div class="table-wrap">
            <table class="list">
              <thead>
                <tr><th>Qtr</th><th>Percent</th><th>Due</th><th class="num">Est. tax</th><th class="num">Paid</th></tr>
              </thead>
              <tbody>
                @for (q of qpd(); track q.qtr) {
                  <tr>
                    <td>Q{{ q.qtr }}</td>
                    <td>{{ q.percent }}</td>
                    <td>{{ q.due_date | date: 'd MMM y' }}</td>
                    <td class="num">{{ q.estimated_tax }}</td>
                    <td class="num">{{ q.payment }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="empty">No QPD data</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TaxComponent {
  vatPeriod = new Date().toISOString().slice(0, 7);
  qpdYear = new Date().getFullYear();
  vat = signal<VatSummary | null>(null);
  qpd = signal<QpdRow[]>([]);
  error = signal('');

  ngOnInit(): void {
    this.loadVat();
    this.loadQpd();
  }

  async loadVat(): Promise<void> {
    try {
      this.vat.set(await api.get<VatSummary>('/tax/vat-summary/', { period: this.vatPeriod }));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load VAT summary');
    }
  }

  async loadQpd(): Promise<void> {
    try {
      const res = await api.get<QpdRow[]>('/tax/qpd/', { year: this.qpdYear });
      this.qpd.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load QPD');
    }
  }
}
