import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Currency, Customer, Invoice, InvoiceStatus, PaymentMethod, Product, TaxType } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { LabelPipe, MoneyPipe, localDate } from '../shared/format';
import { ToastService } from '../shared/toast.service';

type Filter = 'all' | InvoiceStatus;

interface DraftLine {
  product: number | null;
  name: string;
  qty: number;
  unit_price: string;
  tax_type: TaxType;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'part_paid', label: 'Part paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'draft', label: 'Draft' },
];

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, MoneyPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Invoices</h1>
          <p class="sub">Bill customers, share on WhatsApp and track what's owed.</p>
        </div>
        <button class="btn" (click)="openNew()"><app-icon name="plus" [size]="16" /> New invoice</button>
      </div>

      <div class="grid cols-3" style="margin-bottom:20px">
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Outstanding</p><span class="stat-icon amber"><app-icon name="clock" [size]="17" /></span></div>
          <p class="stat-value">{{ outstanding() | money }}</p>
          <p class="stat-sub">{{ openCount() }} unpaid invoice(s)</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Overdue</p><span class="stat-icon red"><app-icon name="alert" [size]="17" /></span></div>
          <p class="stat-value" [class.neg]="overdueTotal() > 0">{{ overdueTotal() | money }}</p>
          <p class="stat-sub">{{ count('overdue') }} past due date</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Paid</p><span class="stat-icon green"><app-icon name="check-circle" [size]="17" /></span></div>
          <p class="stat-value">{{ paidTotal() | money }}</p>
          <p class="stat-sub">{{ count('paid') }} settled invoice(s)</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="seg">
          @for (f of filters; track f.key) {
            <button [class.active]="filter() === f.key" (click)="filter.set(f.key)">
              {{ f.label }} <span class="count">{{ f.key === 'all' ? invoices().length : count(f.key) }}</span>
            </button>
          }
        </div>
        <span class="spacer"></span>
        <div class="input-icon">
          <app-icon name="search" [size]="16" />
          <input type="search" placeholder="Search customer…" [(ngModel)]="q" />
        </div>
      </div>

      <div class="card flush">
        <div class="table-wrap">
          <table class="list">
            <thead>
              <tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th class="num">Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              @for (inv of shown(); track inv.id) {
                <tr class="clickable" (click)="open(inv)">
                  <td class="mono">INV-{{ inv.id }}</td>
                  <td class="cell-main">{{ inv.customer_name || 'Walk-in' }}</td>
                  <td class="text-2">{{ inv.date | date: 'd MMM y' }}</td>
                  <td [class.neg]="inv.status === 'overdue'">{{ inv.due_date | date: 'd MMM y' }}</td>
                  <td class="num cell-main">{{ inv.total | money: inv.currency }}</td>
                  <td><span class="badge dot" [class]="statusClass(inv.status)">{{ inv.status | label }}</span></td>
                  <td (click)="$event.stopPropagation()">
                    <div class="row-actions" style="justify-content:flex-end">
                      @if (inv.status !== 'paid') {
                        <button class="btn ghost small" (click)="openPay(inv)">Record payment</button>
                      }
                      <button class="icon-btn small" (click)="pdf(inv.id)" title="Download PDF"><app-icon name="download" [size]="16" /></button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">{{ loading() ? 'Loading…' : 'No invoices here yet' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- detail drawer -->
      @if (selected(); as inv) {
        <app-modal [drawer]="true" [width]="460" [title]="'INV-' + inv.id" [subtitle]="inv.customer_name || 'Walk-in customer'" (closed)="selected.set(null)">
          <div class="row" style="margin-bottom:14px">
            <span class="badge dot" [class]="statusClass(inv.status)">{{ inv.status | label }}</span>
            <span class="muted">Issued {{ inv.date | date: 'd MMM y' }} · due {{ inv.due_date | date: 'd MMM y' }}</span>
          </div>

          @if (inv.lines?.length) {
            <div class="card" style="padding:4px 16px;background:var(--surface-2)">
              @for (l of inv.lines; track $index) {
                <div class="kv">
                  <span>{{ +l.qty }} × {{ l.name }}</span>
                  <span>{{ l.line_total | money: inv.currency }}</span>
                </div>
              }
            </div>
          } @else if (detailLoading()) {
            <div class="skeleton" style="height:90px"></div>
          }
          <div style="margin-top:10px">
            <div class="kv"><span>Subtotal</span><span>{{ inv.subtotal | money: inv.currency }}</span></div>
            <div class="kv"><span>VAT</span><span>{{ inv.tax_total | money: inv.currency }}</span></div>
            <div class="kv total"><span>Total</span><span>{{ inv.total | money: inv.currency }}</span></div>
            <div class="kv"><span>Paid</span><span class="pos">{{ paidOf(inv) | money: inv.currency }}</span></div>
            <div class="kv total"><span>Balance due</span><span>{{ +inv.total - paidOf(inv) | money: inv.currency }}</span></div>
          </div>

          @if (inv.payments?.length) {
            <p class="eyebrow" style="margin-top:18px">Payments</p>
            @for (p of inv.payments; track p.id) {
              <div class="kv"><span>{{ p.date | date: 'd MMM y' }} · {{ p.method | label }}</span><span>{{ p.amount | money: inv.currency }}</span></div>
            }
          }

          <div class="stack" style="margin-top:20px">
            <button class="btn block" (click)="send(inv)"><app-icon name="whatsapp" [size]="16" /> Send via WhatsApp</button>
            <div class="grid" style="grid-template-columns:1fr 1fr">
              @if (inv.status !== 'paid') {
                <button class="btn ghost" (click)="openPay(inv)"><app-icon name="banknote" [size]="16" /> Record payment</button>
              }
              <button class="btn ghost" (click)="pdf(inv.id)"><app-icon name="download" [size]="16" /> PDF</button>
            </div>
          </div>
        </app-modal>
      }

      <!-- payment -->
      @if (paying(); as p) {
        <app-modal title="Record payment" [subtitle]="'INV-' + p.id + ' · ' + (p.customer_name || 'Walk-in')" [width]="420" (closed)="paying.set(null)">
          <form (ngSubmit)="recordPayment()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="pa">Amount ({{ p.currency }})</label>
                <input id="pa" name="pa" inputmode="decimal" [(ngModel)]="payAmount" required />
                <p class="hint">Invoice total {{ p.total | money: p.currency }}</p>
              </div>
              <div class="full">
                <label class="field">Method</label>
                <div class="seg" style="display:flex">
                  @for (m of payMethods; track m.v) {
                    <button type="button" style="flex:1;justify-content:center" [class.active]="payMethod === m.v" (click)="payMethod = m.v">{{ m.l }}</button>
                  }
                </div>
              </div>
              <div class="full">
                <label class="field" for="pr">Reference <span class="muted">(optional)</span></label>
                <input id="pr" name="pr" [(ngModel)]="payRef" placeholder="EcoCash / bank ref" />
              </div>
            </div>
            @if (payError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ payError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="paying.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !(+payAmount > 0)">{{ busy() ? 'Saving…' : 'Save payment' }}</button>
            </div>
          </form>
        </app-modal>
      }

      <!-- new invoice -->
      @if (creating()) {
        <app-modal title="New invoice" subtitle="A fiscal invoice is issued when you save" [width]="680" (closed)="creating.set(false)">
          <form (ngSubmit)="create()">
            <div class="form-grid">
              <div>
                <label class="field" for="nc">Customer</label>
                <select id="nc" name="nc" [(ngModel)]="draft.customer">
                  <option [ngValue]="null">Walk-in customer</option>
                  @for (c of customers(); track c.id) {
                    <option [ngValue]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="field" for="nd">Due date</label>
                <input id="nd" name="nd" type="date" [(ngModel)]="draft.due_date" />
              </div>
              <div>
                <label class="field" for="ncur">Currency</label>
                <select id="ncur" name="ncur" [(ngModel)]="draft.currency">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
            </div>

            <p class="eyebrow" style="margin-top:18px">Line items</p>
            @for (l of draft.lines; track $index; let i = $index) {
              <div class="dline">
                <select [name]="'lp' + i" [ngModel]="l.product" (ngModelChange)="pick(l, $event)">
                  <option [ngValue]="null">Custom item…</option>
                  @for (p of products(); track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
                @if (!l.product) {
                  <input [name]="'ln' + i" [(ngModel)]="l.name" placeholder="Description" />
                }
                <input [name]="'lq' + i" type="number" min="1" [(ngModel)]="l.qty" class="sm" aria-label="Quantity" />
                <input [name]="'lu' + i" inputmode="decimal" [(ngModel)]="l.unit_price" class="sm" placeholder="Price" aria-label="Unit price" />
                <button type="button" class="icon-btn" (click)="removeLine(i)" aria-label="Remove line"><app-icon name="trash" [size]="16" /></button>
              </div>
            }
            <button type="button" class="btn plain small" (click)="addLine()"><app-icon name="plus" [size]="14" /> Add line</button>

            <div class="form-grid" style="margin-top:14px">
              <div class="full">
                <label class="field" for="nn">Notes <span class="muted">(optional)</span></label>
                <textarea id="nn" name="nn" rows="2" [(ngModel)]="draft.notes" placeholder="Payment terms, bank details…"></textarea>
              </div>
            </div>

            <div class="kv total"><span>Total (VAT inclusive)</span><span>{{ draftTotal() | money: draft.currency }}</span></div>
            @if (createError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ createError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="creating.set(false)">Cancel</button>
              <button class="btn" [disabled]="busy() || draftTotal() <= 0">{{ busy() ? 'Issuing…' : 'Create invoice' }}</button>
            </div>
          </form>
        </app-modal>
      }
    </div>
  `,
  styles: [
    `
      .dline {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
      }
      .dline select,
      .dline input:not(.sm) {
        flex: 1 1 160px;
        min-width: 0;
      }
      .dline .sm {
        flex: 0 0 84px;
      }
      @media (max-width: 560px) {
        .dline {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class InvoicesComponent implements OnInit {
  private toast = inject(ToastService);
  readonly filters = FILTERS;
  readonly payMethods: { v: PaymentMethod; l: string }[] = [
    { v: 'cash', l: 'Cash' },
    { v: 'mobile_money', l: 'EcoCash' },
    { v: 'bank_transfer', l: 'Bank' },
    { v: 'card', l: 'Card' },
  ];

  invoices = signal<Invoice[]>([]);
  customers = signal<Customer[]>([]);
  products = signal<Product[]>([]);
  loading = signal(true);
  filter = signal<Filter>('all');
  q = signal('');
  selected = signal<Invoice | null>(null);
  detailLoading = signal(false);
  paying = signal<Invoice | null>(null);
  creating = signal(false);
  busy = signal(false);
  payError = signal('');
  createError = signal('');

  payAmount = '';
  payMethod: PaymentMethod = 'cash';
  payRef = '';
  draft = this.emptyDraft();

  shown = computed(() => {
    const f = this.filter();
    const n = this.q().trim().toLowerCase();
    return this.invoices().filter(
      (i) => (f === 'all' || i.status === f) && (!n || (i.customer_name ?? '').toLowerCase().includes(n))
    );
  });
  private unpaid = computed(() => this.invoices().filter((i) => i.status !== 'paid' && i.status !== 'draft'));
  outstanding = computed(() => this.unpaid().reduce((s, i) => s + Number(i.total), 0));
  openCount = computed(() => this.unpaid().length);
  overdueTotal = computed(() =>
    this.invoices().filter((i) => i.status === 'overdue').reduce((s, i) => s + Number(i.total), 0)
  );
  paidTotal = computed(() =>
    this.invoices().filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)
  );

  ngOnInit(): void {
    this.load();
    Promise.all([api.get('/customers/'), api.get('/products/')])
      .then(([c, p]) => {
        this.customers.set(asList<Customer>(c));
        this.products.set(asList<Product>(p));
      })
      .catch(() => {});
  }

  async load(): Promise<void> {
    try {
      this.invoices.set(asList<Invoice>(await api.get('/invoices/')));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load invoices');
    } finally {
      this.loading.set(false);
    }
  }

  count(status: InvoiceStatus | 'all'): number {
    return this.invoices().filter((i) => i.status === status).length;
  }

  statusClass(status: string): string {
    return (
      { paid: 'green', overdue: 'red', part_paid: 'amber', sent: 'blue', draft: 'slate' }[status] ?? 'slate'
    );
  }

  paidOf(inv: Invoice): number {
    return (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  }

  async open(inv: Invoice): Promise<void> {
    this.selected.set(inv);
    this.detailLoading.set(true);
    try {
      this.selected.set(await api.get<Invoice>(`/invoices/${inv.id}/`));
    } catch {
      /* keep the list row */
    } finally {
      this.detailLoading.set(false);
    }
  }

  pdf(id: number): void {
    api.download(`/sales/${id}/pdf/`);
  }

  async send(inv: Invoice): Promise<void> {
    try {
      const res = await api.post<{ wa_link: string; status: InvoiceStatus }>(`/invoices/${inv.id}/send/`);
      if (res?.wa_link) window.open(res.wa_link, '_blank', 'noopener');
      this.toast.success('Invoice marked as sent');
      this.selected.update((s) => (s ? { ...s, status: res.status ?? s.status } : s));
      this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Send failed');
    }
  }

  openPay(inv: Invoice): void {
    this.paying.set(inv);
    const balance = Number(inv.total) - this.paidOf(inv);
    this.payAmount = balance > 0 ? balance.toFixed(2) : '';
    this.payRef = '';
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
        reference: this.payRef,
      });
      this.paying.set(null);
      this.toast.success('Payment recorded');
      await this.load();
      if (this.selected()?.id === p.id) this.open(p);
    } catch (e: any) {
      this.payError.set(e?.message || 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  // ---- new invoice ----
  private emptyDraft() {
    return {
      customer: null as number | null,
      due_date: localDate(new Date(Date.now() + 14 * 864e5)),
      currency: 'USD' as Currency,
      notes: '',
      lines: [{ product: null, name: '', qty: 1, unit_price: '', tax_type: 'standard' }] as DraftLine[],
    };
  }

  draftTotal(): number {
    return this.draft.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  }

  openNew(): void {
    this.draft = this.emptyDraft();
    this.createError.set('');
    this.creating.set(true);
  }

  pick(l: DraftLine, productId: number | null): void {
    l.product = productId;
    const p = this.products().find((x) => x.id === productId);
    if (p) {
      l.name = p.name;
      l.unit_price = p.selling_price;
      l.tax_type = p.tax_type;
    }
  }

  addLine(): void {
    this.draft.lines.push({ product: null, name: '', qty: 1, unit_price: '', tax_type: 'standard' });
  }

  removeLine(i: number): void {
    this.draft.lines.splice(i, 1);
    if (!this.draft.lines.length) this.addLine();
  }

  async create(): Promise<void> {
    this.busy.set(true);
    this.createError.set('');
    try {
      const inv = await api.post<Invoice>('/invoices/', {
        customer: this.draft.customer ?? undefined,
        due_date: this.draft.due_date,
        currency: this.draft.currency,
        notes: this.draft.notes,
        lines: this.draft.lines
          .filter((l) => Number(l.unit_price) > 0)
          .map((l) => ({
            product: l.product ?? undefined,
            name: l.product ? undefined : l.name || 'Item',
            qty: Number(l.qty) || 1,
            unit_price: String(l.unit_price),
            tax_type: l.tax_type,
          })),
      });
      this.creating.set(false);
      this.toast.success(`Invoice INV-${inv.id} created`);
      await this.load();
      this.open(inv);
    } catch (e: any) {
      this.createError.set(e?.message || 'Could not create invoice');
    } finally {
      this.busy.set(false);
    }
  }
}
