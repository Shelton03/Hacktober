import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Currency, Product, TaxType } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { LabelPipe, MoneyPipe } from '../shared/format';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [FormsModule, IconComponent, ModalComponent, MoneyPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Products</h1>
          <p class="sub">Your price list and stock levels.</p>
        </div>
        <button class="btn" (click)="openNew()"><app-icon name="plus" [size]="16" /> Add product</button>
      </div>

      <div class="grid cols-4" style="margin-bottom:20px">
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Products</p><span class="stat-icon"><app-icon name="package" [size]="17" /></span></div>
          <p class="stat-value">{{ products().length }}</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Stock value (cost)</p><span class="stat-icon blue"><app-icon name="wallet" [size]="17" /></span></div>
          <p class="stat-value">{{ stockValue() | money }}</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Avg. margin</p><span class="stat-icon green"><app-icon name="percent" [size]="17" /></span></div>
          <p class="stat-value">{{ avgMargin() }}%</p>
        </div>
        <button class="card stat interactive" style="text-align:left;font:inherit;cursor:pointer" (click)="lowOnly.set(!lowOnly())">
          <div class="stat-top"><p class="stat-label">Low stock</p><span class="stat-icon red"><app-icon name="alert" [size]="17" /></span></div>
          <p class="stat-value" [class.neg]="lowCount() > 0">{{ lowCount() }}</p>
          <p class="stat-sub">{{ lowOnly() ? 'Showing low stock · show all' : 'Tap to filter' }}</p>
        </button>
      </div>

      <div class="toolbar">
        <div class="input-icon">
          <app-icon name="search" [size]="16" />
          <input type="search" placeholder="Search name or SKU…" [(ngModel)]="q" />
        </div>
        @if (lowOnly()) {
          <button class="badge red" style="border:none;cursor:pointer" (click)="lowOnly.set(false)">Low stock only <app-icon name="x" [size]="12" /></button>
        }
      </div>

      <div class="card flush">
        <div class="table-wrap">
          <table class="list">
            <thead>
              <tr><th>Product</th><th class="num">Cost</th><th class="num">Price</th><th class="num">Margin</th><th style="min-width:150px">Stock</th><th>Tax</th><th></th></tr>
            </thead>
            <tbody>
              @for (p of shown(); track p.id) {
                <tr>
                  <td>
                    <div class="cell-main">{{ p.name }}</div>
                    <div class="cell-sub mono">{{ p.sku || '–' }}</div>
                  </td>
                  <td class="num text-2">{{ p.cost_price | money: p.currency }}</td>
                  <td class="num cell-main">{{ p.selling_price | money: p.currency }}</td>
                  <td class="num">{{ margin(p) }}%</td>
                  <td>
                    <div class="row" style="justify-content:space-between;font-size:0.8rem;margin-bottom:4px">
                      <b [class.neg]="isLow(p)">{{ p.stock_qty }}</b>
                      @if (isLow(p)) { <span class="badge red">Low</span> }
                    </div>
                    <div class="bar" [class.red]="isLow(p)"><span [style.width.%]="stockPct(p)"></span></div>
                  </td>
                  <td><span class="badge slate">{{ p.tax_type | label }}</span></td>
                  <td>
                    <div class="row-actions" style="justify-content:flex-end">
                      <button class="btn ghost small" (click)="openRestock(p)">Restock</button>
                      <button class="icon-btn small" (click)="openEdit(p)" title="Edit"><app-icon name="pencil" [size]="15" /></button>
                      <button class="icon-btn small" (click)="confirmDelete.set(p)" title="Delete"><app-icon name="trash" [size]="15" /></button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">{{ loading() ? 'Loading…' : 'No products match' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (editing(); as f) {
        <app-modal [title]="f.id ? 'Edit product' : 'New product'" [width]="580" (closed)="editing.set(null)">
          <form (ngSubmit)="save()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="pn">Name</label>
                <input id="pn" name="name" [(ngModel)]="f.name" required />
              </div>
              <div>
                <label class="field" for="ps">SKU</label>
                <input id="ps" name="sku" [(ngModel)]="f.sku" />
              </div>
              <div>
                <label class="field" for="pcur">Currency</label>
                <select id="pcur" name="cur" [(ngModel)]="f.currency">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
              <div>
                <label class="field" for="pc">Cost price</label>
                <input id="pc" name="cost" inputmode="decimal" [(ngModel)]="f.cost_price" />
              </div>
              <div>
                <label class="field" for="pp">Selling price</label>
                <input id="pp" name="sell" inputmode="decimal" [(ngModel)]="f.selling_price" required />
              </div>
              <div>
                <label class="field" for="pq">Stock on hand</label>
                <input id="pq" type="number" name="qty" [(ngModel)]="f.stock_qty" />
              </div>
              <div>
                <label class="field" for="pl">Low-stock alert at</label>
                <input id="pl" type="number" name="low" [(ngModel)]="f.low_stock_threshold" />
              </div>
              <div class="full">
                <label class="field" for="pt">Tax treatment</label>
                <select id="pt" name="tax" [(ngModel)]="f.tax_type">
                  <option value="standard">Standard VAT</option>
                  <option value="zero">Zero-rated</option>
                  <option value="exempt">Exempt</option>
                  <option value="withholding">Withholding</option>
                </select>
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="editing.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !f.name || !f.selling_price">{{ busy() ? 'Saving…' : 'Save product' }}</button>
            </div>
          </form>
        </app-modal>
      }

      @if (restocking(); as p) {
        <app-modal title="Restock" [subtitle]="p.name + ' · ' + p.stock_qty + ' on hand'" [width]="380" (closed)="restocking.set(null)">
          <form (ngSubmit)="restock()">
            <label class="field" for="rq">Quantity received</label>
            <input id="rq" name="rq" type="number" min="1" [(ngModel)]="restockQty" required />
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="restocking.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !(restockQty > 0)">Add {{ restockQty || '' }} to stock</button>
            </div>
          </form>
        </app-modal>
      }

      @if (confirmDelete(); as p) {
        <app-modal title="Delete product?" [width]="400" (closed)="confirmDelete.set(null)">
          <p class="text-2">Remove <b>{{ p.name }}</b> from your price list? Past sales are kept.</p>
          <div class="form-actions">
            <button class="btn ghost" (click)="confirmDelete.set(null)">Cancel</button>
            <button class="btn danger" (click)="remove(p)">Delete</button>
          </div>
        </app-modal>
      }
    </div>
  `,
})
export class ProductsComponent implements OnInit {
  private toast = inject(ToastService);

  products = signal<Product[]>([]);
  loading = signal(true);
  q = signal('');
  lowOnly = signal(false);
  editing = signal<Product | null>(null);
  restocking = signal<Product | null>(null);
  confirmDelete = signal<Product | null>(null);
  formError = signal('');
  busy = signal(false);
  restockQty = 10;

  shown = computed(() => {
    const n = this.q().trim().toLowerCase();
    return this.products().filter(
      (p) =>
        (!this.lowOnly() || this.isLow(p)) &&
        (!n || p.name.toLowerCase().includes(n) || (p.sku ?? '').toLowerCase().includes(n))
    );
  });
  lowCount = computed(() => this.products().filter((p) => this.isLow(p)).length);
  stockValue = computed(() =>
    this.products().reduce((s, p) => s + Number(p.cost_price || 0) * Math.max(0, p.stock_qty), 0)
  );
  avgMargin = computed(() => {
    const ms = this.products().filter((p) => Number(p.selling_price) > 0).map((p) => this.margin(p));
    return ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      this.products.set(asList<Product>(await api.get('/products/')));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load products');
    } finally {
      this.loading.set(false);
    }
  }

  isLow(p: Product): boolean {
    if (typeof p.is_low_stock === 'boolean') return p.is_low_stock;
    return Number(p.stock_qty) <= Number(p.low_stock_threshold || 0);
  }

  margin(p: Product): number {
    const sell = Number(p.selling_price);
    return sell > 0 ? Math.round(((sell - Number(p.cost_price || 0)) / sell) * 100) : 0;
  }

  stockPct(p: Product): number {
    const target = Math.max(1, (p.low_stock_threshold || 5) * 4);
    return Math.min(100, Math.max(3, (p.stock_qty / target) * 100));
  }

  openNew(): void {
    this.formError.set('');
    this.editing.set({
      id: 0,
      name: '',
      sku: '',
      cost_price: '',
      selling_price: '',
      tax_type: 'standard' as TaxType,
      stock_qty: 0,
      low_stock_threshold: 5,
      currency: 'USD' as Currency,
    });
  }

  openEdit(p: Product): void {
    this.formError.set('');
    this.editing.set({ ...p });
  }

  openRestock(p: Product): void {
    this.restockQty = Math.max(1, (p.low_stock_threshold || 5) * 2);
    this.restocking.set(p);
  }

  async save(): Promise<void> {
    const f = this.editing();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const body = {
        name: f.name,
        sku: f.sku,
        cost_price: String(f.cost_price || '0'),
        selling_price: String(f.selling_price),
        tax_type: f.tax_type,
        stock_qty: Number(f.stock_qty) || 0,
        low_stock_threshold: Number(f.low_stock_threshold) || 0,
        currency: f.currency,
      };
      if (f.id) await api.patch(`/products/${f.id}/`, body);
      else await api.post('/products/', body);
      this.editing.set(null);
      this.toast.success(f.id ? 'Product updated' : 'Product added');
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async restock(): Promise<void> {
    const p = this.restocking();
    if (!p) return;
    this.busy.set(true);
    try {
      const updated = await api.post<Product>(`/products/${p.id}/restock/`, { qty: Number(this.restockQty) });
      this.products.update((list) => list.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
      this.restocking.set(null);
      this.toast.success(`${p.name}: +${this.restockQty} in stock`);
    } catch (e: any) {
      this.toast.error(e?.message || 'Restock failed');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(p: Product): Promise<void> {
    this.confirmDelete.set(null);
    try {
      await api.del(`/products/${p.id}/`);
      this.toast.success(`${p.name} deleted`);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Delete failed');
    }
  }
}
