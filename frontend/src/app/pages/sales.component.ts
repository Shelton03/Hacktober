import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Customer, Product, Sale, PaymentMethod, Currency, TaxType } from '../core/models';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Sales</h1>
          <p class="sub">Ring up a quick sale (fiscal receipt is created automatically)</p>
        </div>
      </div>

      <div class="grid cols-2">
        <!-- quick sale form -->
        <form class="card" (ngSubmit)="submitSale()">
          <h2>Quick sale</h2>

          <div class="form-row">
            <div>
              <label class="field" for="cust">Customer (optional)</label>
              <select id="cust" [(ngModel)]="form.customer" name="customer">
                <option [ngValue]="null">Walk-in</option>
                @for (c of customers(); track c.id) {
                  <option [ngValue]="c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="field" for="cur">Currency</label>
              <select id="cur" [(ngModel)]="form.currency" name="currency">
                <option value="USD">USD</option>
                <option value="ZWG">ZWG</option>
              </select>
            </div>
          </div>

          <h3 style="margin-top:12px">Line items</h3>
          @for (line of form.lines; track $index; let i = $index) {
            <div class="form-row line-row">
              <div>
                <label class="field">Product</label>
                <select
                  [ngModel]="line.product"
                  (ngModelChange)="pickProduct(i, $event)"
                  [name]="'p' + i"
                >
                  <option [ngValue]="null">Custom item</option>
                  @for (p of products(); track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>
              <div style="max-width:90px">
                <label class="field">Qty</label>
                <input
                  type="number"
                  min="1"
                  [(ngModel)]="line.qty"
                  [name]="'q' + i"
                  (ngModelChange)="recalc()"
                />
              </div>
              <div style="max-width:120px">
                <label class="field">Unit price</label>
                <input
                  type="text"
                  [(ngModel)]="line.unit_price"
                  [name]="'u' + i"
                  (ngModelChange)="recalc()"
                />
              </div>
              <div style="max-width:110px">
                <label class="field">Tax</label>
                <select [(ngModel)]="line.tax_type" [name]="'t' + i">
                  <option value="standard">Standard</option>
                  <option value="zero">Zero</option>
                  <option value="exempt">Exempt</option>
                  <option value="withholding">Withholding</option>
                </select>
              </div>
              <div style="max-width:40px;align-self:end">
                <button type="button" class="btn danger small" (click)="removeLine(i)">✕</button>
              </div>
            </div>
          }
          <button type="button" class="btn ghost small" (click)="addLine()">+ Add line</button>

          <div class="form-row" style="margin-top:12px">
            <div>
              <label class="field">Payment method</label>
              <select [(ngModel)]="form.payment.method" name="method">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile_money">Mobile money</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
            <div>
              <label class="field">Amount tendered</label>
              <input type="text" [(ngModel)]="form.payment.amount" name="amount" />
            </div>
          </div>

          <p style="margin-top:10px"><b>Total: {{ total() }}</b></p>

          @if (formError()) {
            <div class="alert error">{{ formError() }}</div>
          }
          @if (receiptInfo()) {
            <div class="alert ok">
              Sale recorded. Receipt
              <b>{{ receiptInfo()?.receipt_id }}</b> (global no {{ receiptInfo()?.global_no }})
              @if (receiptPending()) {
                <span class="badge amber">pending sync</span>
              }
            </div>
          }

          <button class="btn" style="margin-top:8px" [disabled]="busy()">
            {{ busy() ? 'Saving…' : 'Complete sale' }}
          </button>
        </form>

        <!-- history -->
        <div>
          <div class="table-wrap">
            <table class="list">
              <thead>
                <tr>
                  <th>Date</th><th>Customer</th><th class="num">Total</th><th>Receipt</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (s of sales(); track s.id) {
                  <tr>
                    <td>{{ s.date | date: 'd MMM, HH:mm' }}</td>
                    <td>{{ s.customer_name || s.customer || 'Walk-in' }}</td>
                    <td class="num">{{ s.total }} {{ s.currency }}</td>
                    <td>
                      <span
                        class="badge"
                        [class]="s.sync_status === 'pending' ? 'amber' : 'green'"
                        >{{ s.sync_status === 'pending' ? 'pending' : 'ok' }}</span
                      >
                    </td>
                    <td>
                      <div class="row-actions">
                        @if (s.share?.wa_link) {
                          <a class="btn ghost small" [href]="s.share?.wa_link" target="_blank"
                            >WhatsApp</a
                          >
                        }
                        <button class="btn ghost small" (click)="openReceiptPdf(s.id)">
                          Receipt PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="empty">No sales yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .line-row {
        align-items: end;
      }
    `,
  ],
})
export class SalesComponent {
  customers = signal<Customer[]>([]);
  products = signal<Product[]>([]);
  sales = signal<Sale[]>([]);
  busy = signal(false);
  formError = signal('');
  receiptInfo = signal<any>(null);
  receiptPending = signal(false);

  form = {
    customer: null as number | null,
    currency: 'USD' as Currency,
    lines: [
      { product: null as number | null, name: '', qty: 1, unit_price: '', tax_type: 'standard' as TaxType },
    ],
    payment: { method: 'cash' as PaymentMethod, amount: '' },
  };

  total = computed(() =>
    this.form.lines
      .reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0)
      .toFixed(2)
  );

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll(): Promise<void> {
    try {
      const [custs, prods, sales] = await Promise.all([
        api.get<Customer[]>('/customers/'),
        api.get<Product[]>('/products/'),
        api.get<Sale[]>('/sales/', { type: 'sale' }),
      ]);
      this.customers.set(Array.isArray(custs) ? custs : (custs as any).results ?? []);
      this.products.set(Array.isArray(prods) ? prods : (prods as any).results ?? []);
      const saleList = Array.isArray(sales) ? sales : (sales as any).results ?? [];
      this.sales.set(saleList.slice(0, 50));
    } catch (e: any) {
      this.formError.set(e?.message || 'Failed to load data');
    }
  }

  addLine(): void {
    this.form.lines.push({
      product: null,
      name: '',
      qty: 1,
      unit_price: '',
      tax_type: 'standard',
    });
  }

  removeLine(i: number): void {
    this.form.lines.splice(i, 1);
    if (!this.form.lines.length) this.addLine();
  }

  pickProduct(i: number, productId: number | null): void {
    const line = this.form.lines[i];
    line.product = productId;
    if (productId) {
      const p = this.products().find((x) => x.id === productId);
      if (p) {
        line.unit_price = p.selling_price;
        line.tax_type = p.tax_type;
        line.name = p.name;
      }
    }
    this.recalc();
  }

  recalc(): void {
    /* total is computed — nothing to do, kept for clarity */
  }

  async submitSale(): Promise<void> {
    this.busy.set(true);
    this.formError.set('');
    this.receiptInfo.set(null);
    try {
      const payload = {
        customer: this.form.customer ?? undefined,
        lines: this.form.lines.map((l) => ({
          product: l.product ?? undefined,
          name: l.product ? undefined : l.name || 'Item',
          qty: Number(l.qty) || 1,
          unit_price: String(l.unit_price || '0'),
          tax_type: l.tax_type,
        })),
        payment: {
          method: this.form.payment.method,
          amount: String(this.form.payment.amount || this.total()),
        },
        currency: this.form.currency,
      };
      const res = await api.post<any>('/sales/', payload);
      this.receiptInfo.set(res?.receipt ?? null);
      this.receiptPending.set(res?.sync_status === 'pending' || res?.receipt?.sync_status === 'pending');
      this.form.lines = [
        { product: null, name: '', qty: 1, unit_price: '', tax_type: 'standard' },
      ];
      this.form.payment.amount = '';
      await this.loadAll();
    } catch (e: any) {
      this.formError.set(e?.message || 'Sale failed');
    } finally {
      this.busy.set(false);
    }
  }

  openReceiptPdf(saleId: number): void {
    api.download(`/sales/${saleId}/receipt-pdf/`);
  }
}
