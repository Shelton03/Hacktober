import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Invoice, InvoiceStatus, Customer, PaymentMethod } from '../core/models';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Invoices</h1>
          <p class="sub">Send, track and settle invoices</p>
        </div>
        <div class="row-actions">
          <select [(ngModel)]="statusFilter" (ngModelChange)="load()" style="width:auto">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="part_paid">Part paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="table-wrap">
        <table class="list">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Date</th><th>Due</th>
              <th class="num">Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (inv of invoices(); track inv.id) {
              <tr>
                <td>{{ inv.number || inv.id }}</td>
                <td>{{ inv.customer_name || inv.customer }}</td>
                <td>{{ inv.date | date: 'd MMM y' }}</td>
                <td>{{ inv.due_date | date: 'd MMM y' }}</td>
                <td class="num">{{ inv.total }} {{ inv.currency }}</td>
                <td>
                  <span class="badge" [class]="statusClass(inv.status)">{{ inv.status }}</span>
                </td>
                <td>
                  <div class="row-actions">
                    <button class="btn ghost small" (click)="select(inv)">Open</button>
                    @if (inv.status !== 'paid') {
                      <button class="btn ghost small" (click)="openPay(inv)">Payment</button>
                    }
                    <a class="btn ghost small" [href]="pdfUrl(inv.id)" target="_blank">PDF</a>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No invoices — create one from a lead or sale</td></tr>
            }
          </tbody>
        </table>
      </div>

      <!-- detail drawer -->
      @if (selected(); as inv) {
        <div class="card" style="margin-top:14px">
          <div class="page-head">
            <h2>Invoice {{ inv.number || inv.id }} — {{ inv.customer_name || inv.customer }}</h2>
            <button class="btn ghost small" (click)="selected.set(null)">Close</button>
          </div>
          <p>
            <b>Status:</b>
            <span class="badge" [class]="statusClass(inv.status)">{{ inv.status }}</span>
            <b style="margin-left:12px">Total:</b> {{ inv.total }} {{ inv.currency }}
            @if (inv.amount_paid) {
              <b style="margin-left:12px">Paid:</b> {{ inv.amount_paid }}
            }
          </p>
          @if (inv.notes) {
            <p class="muted">{{ inv.notes }}</p>
          }
          <div class="row-actions" style="margin-top:8px">
            @if (inv.wa_link) {
              <a class="btn" [href]="inv.wa_link" target="_blank">Share via WhatsApp</a>
            } @else {
              <button class="btn" (click)="send(inv)">Send (WhatsApp link)</button>
            }
            <a class="btn ghost" [href]="pdfUrl(inv.id)" target="_blank">Download PDF</a>
          </div>
        </div>
      }

      <!-- payment modal -->
      @if (paying(); as p) {
        <div class="overlay">
          <form class="card modal" (ngSubmit)="recordPayment()">
            <h2>Record payment — invoice {{ p.number || p.id }}</h2>
            <label class="field">Amount</label>
            <input type="text" [(ngModel)]="payAmount" name="payAmount" placeholder="0.00" />
            <label class="field" style="margin-top:8px">Method</label>
            <select [(ngModel)]="payMethod" name="payMethod">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
            <label class="field" style="margin-top:8px">Date</label>
            <input type="date" [(ngModel)]="payDate" name="payDate" />
            @if (payError()) {
              <div class="alert error">{{ payError() }}</div>
            }
            <div class="row-actions" style="margin-top:12px">
              <button class="btn" [disabled]="busy()">Save payment</button>
              <button type="button" class="btn ghost" (click)="paying.set(null)">Cancel</button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 70;
        padding: 14px;
      }
      .modal {
        width: 100%;
        max-width: 400px;
      }
    `,
  ],
})
export class InvoicesComponent {
  invoices = signal<Invoice[]>([]);
  selected = signal<Invoice | null>(null);
  paying = signal<Invoice | null>(null);
  statusFilter = '';
  error = signal('');
  busy = signal(false);

  payAmount = '';
  payMethod: PaymentMethod = 'cash';
  payDate = new Date().toISOString().slice(0, 10);
  payError = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      const res = await api.get<Invoice[]>('/invoices/', {
        status: this.statusFilter || undefined,
      });
      this.invoices.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load invoices');
    }
  }

  statusClass(status: InvoiceStatus | string): string {
    if (status === 'paid') return 'green';
    if (status === 'overdue') return 'red';
    if (status === 'part_paid') return 'amber';
    return 'slate';
  }

  select(inv: Invoice): void {
    this.selected.set(inv);
  }

  pdfUrl(id: number): string {
    return api.url(`/invoices/${id}/pdf/`);
  }

  async send(inv: Invoice): Promise<void> {
    try {
      const res = await api.post<any>(`/invoices/${inv.id}/send/`);
      inv.wa_link = res?.wa_link;
      this.selected.set({ ...inv });
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Send failed');
    }
  }

  openPay(inv: Invoice): void {
    this.paying.set(inv);
    this.payAmount = '';
    this.payError.set('');
  }

  async recordPayment(): Promise<void> {
    const p = this.paying();
    if (!p) return;
    this.busy.set(true);
    this.payError.set('');
    try {
      await api.post(`/invoices/${p.id}/payments/`, {
        amount: this.payAmount,
        method: this.payMethod,
        date: this.payDate,
      });
      this.paying.set(null);
      await this.load();
    } catch (e: any) {
      this.payError.set(e?.message || 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }
}
