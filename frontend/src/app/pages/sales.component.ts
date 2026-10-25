import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Currency, Customer, PaymentMethod, Product, Sale, TaxType } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { MoneyPipe } from '../shared/format';
import { ToastService } from '../shared/toast.service';

interface CartLine {
  key: string;
  product: number | null;
  name: string;
  qty: number;
  unit_price: number;
  tax_type: TaxType;
  stock?: number;
}

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: 'banknote' },
  { value: 'mobile_money', label: 'EcoCash', icon: 'phone' },
  { value: 'card', label: 'Card', icon: 'card' },
  { value: 'bank_transfer', label: 'Bank', icon: 'landmark' },
];

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Sales</h1>
          <p class="sub">Ring up a sale. A ZIMRA fiscal receipt is issued automatically.</p>
        </div>
        <div class="seg">
          <button [class.active]="view() === 'pos'" (click)="view.set('pos')"><app-icon name="cart" [size]="15" /> Point of sale</button>
          <button [class.active]="view() === 'history'" (click)="view.set('history')"><app-icon name="clock" [size]="15" /> History</button>
        </div>
      </div>

      @if (view() === 'pos') {
        <div class="pos-grid">
          <section>
            <div class="toolbar">
              <div class="input-icon">
                <app-icon name="search" [size]="16" />
                <input type="search" placeholder="Search products or SKU…" [(ngModel)]="q" />
              </div>
              <button class="btn ghost" (click)="customOpen.set(true)"><app-icon name="plus" [size]="16" /> Custom item</button>
            </div>
            <div class="tiles">
              @for (p of filtered(); track p.id) {
                <button class="tile" (click)="add(p)" [class.out]="p.stock_qty <= 0">
                  <span class="t-ico">{{ p.name.charAt(0) }}</span>
                  <span class="t-name">{{ p.name }}</span>
                  <span class="t-meta">
                    <b>{{ p.selling_price | money: p.currency }}</b>
                    <span [class.low]="p.is_low_stock || p.stock_qty <= p.low_stock_threshold">{{ p.stock_qty }} in stock</span>
                  </span>
                  @if (inCart(p.id); as n) {
                    <span class="t-count">{{ n }}</span>
                  }
                </button>
              } @empty {
                <div class="card empty" style="grid-column:1/-1">
                  {{ loading() ? 'Loading products…' : 'No products match. Add a custom item instead.' }}
                </div>
              }
            </div>
          </section>

          <aside class="card cart" id="cart">
            <div class="card-head">
              <h2>Current sale</h2>
              @if (cart().length) {
                <button class="btn plain small" (click)="clear()">Clear</button>
              }
            </div>

            <div class="form-row">
              <div>
                <label class="field" for="cust">Customer</label>
                <select id="cust" [(ngModel)]="customer">
                  <option [ngValue]="null">Walk-in customer</option>
                  @for (c of customers(); track c.id) {
                    <option [ngValue]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>
              <div style="flex:0 0 96px">
                <label class="field" for="cur">Currency</label>
                <select id="cur" [(ngModel)]="currency">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
            </div>

            <div class="lines">
              @for (l of cart(); track l.key) {
                <div class="line">
                  <div class="l-main">
                    <b>{{ l.name }}</b>
                    <small>{{ l.unit_price | money: currency() }} · {{ taxLabel(l.tax_type) }}</small>
                  </div>
                  <div class="qty">
                    <button class="icon-btn small" (click)="bump(l.key, -1)" aria-label="Decrease"><app-icon name="minus" [size]="14" /></button>
                    <span>{{ l.qty }}</span>
                    <button class="icon-btn small" (click)="bump(l.key, 1)" aria-label="Increase"><app-icon name="plus" [size]="14" /></button>
                  </div>
                  <b class="l-total">{{ l.qty * l.unit_price | money: currency() }}</b>
                </div>
              } @empty {
                <div class="cart-empty">
                  <app-icon name="cart" [size]="28" [stroke]="1.5" />
                  <p>Tap a product to add it</p>
                </div>
              }
            </div>

            @if (cart().length) {
              <label class="field" style="margin-top:14px">Payment</label>
              <div class="methods">
                @for (m of methods; track m.value) {
                  <button type="button" [class.active]="method() === m.value" (click)="method.set(m.value)">
                    <app-icon [name]="m.icon" [size]="16" /> {{ m.label }}
                  </button>
                }
              </div>

              <div class="form-row" style="margin-top:12px">
                <div>
                  <label class="field" for="tend">Amount tendered</label>
                  <input id="tend" inputmode="decimal" [placeholder]="total().toFixed(2)" [(ngModel)]="tendered" />
                </div>
                <div>
                  <label class="field">Change due</label>
                  <div class="change" [class.neg]="change() < 0">{{ change() | money: currency() }}</div>
                </div>
              </div>

              <div class="totals">
                <div class="kv"><span>{{ itemCount() }} item(s)</span><span>{{ total() | money: currency() }}</span></div>
                <div class="kv total"><span>Total</span><span>{{ total() | money: currency() }}</span></div>
              </div>

              @if (formError()) {
                <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
              }
              <button class="btn large block" (click)="submit()" [disabled]="busy() || change() < 0">
                <app-icon name="check" [size]="18" /> {{ busy() ? 'Fiscalising…' : 'Complete sale · ' + (total() | money: currency()) }}
              </button>
            }
          </aside>
        </div>

        @if (cart().length) {
          <a class="mobile-cart btn large" href="#cart">
            <app-icon name="cart" [size]="18" /> {{ itemCount() }} · {{ total() | money: currency() }} · Checkout
          </a>
        }
      } @else {
        <div class="card flush">
          <div class="table-wrap">
            <table class="list">
              <thead>
                <tr><th>Date</th><th>Customer</th><th>Receipt</th><th class="num">VAT</th><th class="num">Total</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                @for (s of sales(); track s.id) {
                  <tr>
                    <td>{{ s.date | date: 'd MMM y' }}</td>
                    <td class="cell-main">{{ s.customer_name || 'Walk-in' }}</td>
                    <td>
                      @if (s.receipt; as r) {
                        <span class="mono">#{{ r.global_no }}</span> <span class="cell-sub">day {{ r.fiscal_day_no }}</span>
                      } @else {
                        <span class="muted">–</span>
                      }
                    </td>
                    <td class="num text-2">{{ s.tax_total | money: s.currency }}</td>
                    <td class="num cell-main">{{ s.total | money: s.currency }}</td>
                    <td>
                      @if (s.receipt?.sync_status === 'pending') {
                        <span class="badge amber dot">Pending sync</span>
                      } @else if (s.receipt) {
                        <span class="badge green dot">Fiscalised</span>
                      } @else {
                        <span class="badge slate">No receipt</span>
                      }
                    </td>
                    <td>
                      <div class="row-actions" style="justify-content:flex-end">
                        @if (s.receipt?.qr_url) {
                          <a class="icon-btn small" [href]="s.receipt!.qr_url" target="_blank" rel="noopener" title="Verify on ZIMRA"><app-icon name="qr" [size]="16" /></a>
                        }
                        <button class="icon-btn small" (click)="receiptPdf(s.id)" title="Receipt PDF"><app-icon name="download" [size]="16" /></button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="empty">{{ loading() ? 'Loading…' : 'No sales yet' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (customOpen()) {
        <app-modal title="Custom item" subtitle="For items not in your product list" [width]="420" (closed)="customOpen.set(false)">
          <form (ngSubmit)="addCustom()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="cn">Description</label>
                <input id="cn" name="cn" [(ngModel)]="custom.name" required placeholder="e.g. Delivery fee" />
              </div>
              <div>
                <label class="field" for="cp">Unit price</label>
                <input id="cp" name="cp" inputmode="decimal" [(ngModel)]="custom.price" required placeholder="0.00" />
              </div>
              <div>
                <label class="field" for="ct">Tax</label>
                <select id="ct" name="ct" [(ngModel)]="custom.tax_type">
                  <option value="standard">Standard VAT</option>
                  <option value="zero">Zero-rated</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="customOpen.set(false)">Cancel</button>
              <button class="btn" [disabled]="!custom.name || !(+custom.price > 0)">Add to sale</button>
            </div>
          </form>
        </app-modal>
      }

      @if (done(); as s) {
        <app-modal title="Sale complete" [width]="420" (closed)="done.set(null)">
          <div class="done">
            <span class="done-ico"><app-icon name="check" [size]="28" [stroke]="2.5" /></span>
            <p class="done-total">{{ s.total | money: s.currency }}</p>
            @if (s.receipt; as r) {
              <p class="muted">Fiscal receipt <b class="mono">#{{ r.global_no }}</b> · day {{ r.fiscal_day_no }}</p>
              @if (r.sync_status === 'pending') {
                <div class="alert warn"><app-icon name="upload" /> Saved offline. It will sync to ZIMRA FDMS automatically.</div>
              } @else {
                <span class="badge green dot">Submitted to ZIMRA FDMS</span>
              }
            }
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:18px">
            <button class="btn ghost" (click)="receiptPdf(s.id)"><app-icon name="download" [size]="16" /> Receipt PDF</button>
            @if (s.share?.wa_link) {
              <a class="btn ghost" [href]="s.share!.wa_link" target="_blank" rel="noopener"><app-icon name="whatsapp" [size]="16" /> WhatsApp</a>
            } @else if (s.receipt?.qr_url) {
              <a class="btn ghost" [href]="s.receipt!.qr_url" target="_blank" rel="noopener"><app-icon name="qr" [size]="16" /> Verify</a>
            }
          </div>
          <button class="btn block" style="margin-top:10px" (click)="done.set(null)">New sale</button>
        </app-modal>
      }
    </div>
  `,
  styles: [
    `
      .pos-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 380px;
        gap: 20px;
        align-items: start;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
      }
      .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 6px;
        text-align: left;
        padding: 14px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        cursor: pointer;
        transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s;
      }
      .tile:hover {
        border-color: var(--primary);
        box-shadow: var(--shadow);
      }
      .tile:active {
        transform: scale(0.98);
      }
      .tile.out {
        opacity: 0.6;
      }
      .t-ico {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        font-weight: 700;
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .t-name {
        font-weight: 600;
        font-size: 0.875rem;
        line-height: 1.3;
        min-height: 2.6em;
      }
      .t-meta {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 6px;
        font-size: 0.75rem;
        color: var(--text-3);
      }
      .t-meta b {
        font-size: 0.9rem;
        color: var(--text);
      }
      .t-meta .low {
        color: var(--danger);
        font-weight: 600;
      }
      .t-count {
        position: absolute;
        top: 10px;
        right: 10px;
        min-width: 22px;
        height: 22px;
        border-radius: 99px;
        padding: 0 6px;
        display: grid;
        place-items: center;
        background: var(--primary);
        color: var(--on-primary);
        font-size: 0.72rem;
        font-weight: 700;
      }
      .cart {
        position: sticky;
        top: 76px;
      }
      .lines {
        margin-top: 14px;
        border-top: 1px solid var(--border);
        max-height: 34vh;
        overflow: auto;
      }
      .line {
        display: grid;
        grid-template-columns: 1fr auto 80px;
        gap: 10px;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
      }
      .l-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .l-main b {
        font-size: 0.86rem;
        font-weight: 600;
      }
      .l-main small {
        font-size: 0.74rem;
        color: var(--text-3);
      }
      .l-total {
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-size: 0.88rem;
      }
      .qty {
        display: flex;
        align-items: center;
        gap: 2px;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 1px;
      }
      .qty span {
        min-width: 22px;
        text-align: center;
        font-weight: 600;
        font-size: 0.86rem;
      }
      .cart-empty {
        padding: 34px 0;
        text-align: center;
        color: var(--text-3);
        font-size: 0.86rem;
      }
      .methods {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .methods button {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 9px 4px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-2);
        font: inherit;
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
      }
      .methods button.active {
        border-color: var(--primary);
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .change {
        min-height: 40px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        border-radius: var(--radius-sm);
        background: var(--surface-2);
        border: 1px dashed var(--border-strong);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .totals {
        margin: 14px 0;
      }
      .mobile-cart {
        display: none;
      }
      .done {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .done-ico {
        width: 60px;
        height: 60px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        background: var(--success-soft);
        color: var(--success);
      }
      .done-total {
        font-size: 2rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin: 10px 0 0;
      }
      @media (max-width: 1020px) {
        .pos-grid {
          grid-template-columns: 1fr;
        }
        .cart {
          position: static;
        }
        .mobile-cart {
          display: flex;
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: 76px;
          z-index: 30;
          box-shadow: var(--shadow-lg);
        }
      }
      @media (min-width: 901px) and (max-width: 1020px) {
        .mobile-cart {
          bottom: 20px;
        }
      }
    `,
  ],
})
export class SalesComponent implements OnInit {
  private toast = inject(ToastService);
  readonly methods = METHODS;

  view = signal<'pos' | 'history'>('pos');
  products = signal<Product[]>([]);
  customers = signal<Customer[]>([]);
  sales = signal<Sale[]>([]);
  loading = signal(true);
  busy = signal(false);
  formError = signal('');
  done = signal<Sale | null>(null);
  customOpen = signal(false);

  q = signal('');
  customer = signal<number | null>(null);
  currency = signal<Currency>('USD');
  method = signal<PaymentMethod>('cash');
  tendered = signal('');
  cart = signal<CartLine[]>([]);
  custom = { name: '', price: '', tax_type: 'standard' as TaxType };

  filtered = computed(() => {
    const n = this.q().trim().toLowerCase();
    const list = this.products();
    return n ? list.filter((p) => p.name.toLowerCase().includes(n) || p.sku?.toLowerCase().includes(n)) : list;
  });
  total = computed(() => this.cart().reduce((s, l) => s + l.qty * l.unit_price, 0));
  itemCount = computed(() => this.cart().reduce((s, l) => s + l.qty, 0));
  change = computed(() => {
    const t = this.tendered().trim();
    return t === '' ? 0 : Number(t) - this.total();
  });

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [prods, custs, sales] = await Promise.all([
        api.get('/products/'),
        api.get('/customers/'),
        api.get('/sales/list/'),
      ]);
      this.products.set(asList<Product>(prods));
      this.customers.set(asList<Customer>(custs));
      this.sales.set(asList<Sale>(sales).slice(0, 100));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load sales data');
    } finally {
      this.loading.set(false);
    }
  }

  inCart(productId: number): number {
    return this.cart().find((l) => l.product === productId)?.qty ?? 0;
  }

  add(p: Product): void {
    const key = 'p' + p.id;
    if (this.cart().some((l) => l.key === key)) {
      this.bump(key, 1);
      return;
    }
    this.cart.update((c) => [
      ...c,
      { key, product: p.id, name: p.name, qty: 1, unit_price: Number(p.selling_price), tax_type: p.tax_type, stock: p.stock_qty },
    ]);
  }

  addCustom(): void {
    const price = Number(this.custom.price);
    if (!this.custom.name || !(price > 0)) return;
    this.cart.update((c) => [
      ...c,
      { key: 'c' + Date.now(), product: null, name: this.custom.name, qty: 1, unit_price: price, tax_type: this.custom.tax_type },
    ]);
    this.custom = { name: '', price: '', tax_type: 'standard' };
    this.customOpen.set(false);
  }

  bump(key: string, delta: number): void {
    this.cart.update((c) =>
      c.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  clear(): void {
    this.cart.set([]);
    this.tendered.set('');
    this.formError.set('');
  }

  taxLabel(t: TaxType): string {
    return { standard: 'VAT', zero: 'Zero-rated', exempt: 'Exempt', withholding: 'Withholding' }[t] ?? t;
  }

  async submit(): Promise<void> {
    if (!this.cart().length || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const sale = await api.post<Sale>('/sales/', {
        customer: this.customer() ?? undefined,
        currency: this.currency(),
        lines: this.cart().map((l) => ({
          product: l.product ?? undefined,
          name: l.product ? undefined : l.name,
          qty: l.qty,
          unit_price: l.unit_price.toFixed(2),
          tax_type: l.tax_type,
        })),
        // record the sale total, not the cash handed over (change goes back)
        payment: { method: this.method(), amount: this.total().toFixed(2) },
      });
      this.done.set(sale);
      this.clear();
      this.customer.set(null);
      this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Sale failed');
    } finally {
      this.busy.set(false);
    }
  }

  receiptPdf(id: number): void {
    api.download(`/sales/${id}/receipt-pdf/`);
  }
}
