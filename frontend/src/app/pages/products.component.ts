import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Product, TaxType, Currency } from '../core/models';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Products</h1>
          <p class="sub">Inventory with low-stock alerts</p>
        </div>
        <button class="btn" (click)="openNew()">+ Add product</button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @if (editing(); as f) {
        <form class="card" style="margin-bottom:14px" (ngSubmit)="save()">
          <h2>{{ f.id ? 'Edit product' : 'New product' }}</h2>
          <div class="form-row">
            <div>
              <label class="field">Name *</label>
              <input [(ngModel)]="f.name" name="name" required />
            </div>
            <div>
              <label class="field">SKU</label>
              <input [(ngModel)]="f.sku" name="sku" />
            </div>
            <div>
              <label class="field">Cost price</label>
              <input type="text" [(ngModel)]="f.cost_price" name="cost" />
            </div>
            <div>
              <label class="field">Selling price *</label>
              <input type="text" [(ngModel)]="f.selling_price" name="sell" required />
            </div>
          </div>
          <div class="form-row" style="margin-top:8px">
            <div>
              <label class="field">Stock qty</label>
              <input type="number" [(ngModel)]="f.stock_qty" name="qty" />
            </div>
            <div>
              <label class="field">Low-stock threshold</label>
              <input type="number" [(ngModel)]="f.low_stock_threshold" name="low" />
            </div>
            <div>
              <label class="field">Tax type</label>
              <select [(ngModel)]="f.tax_type" name="tax">
                <option value="standard">Standard</option>
                <option value="zero">Zero</option>
                <option value="exempt">Exempt</option>
                <option value="withholding">Withholding</option>
              </select>
            </div>
            <div>
              <label class="field">Currency</label>
              <select [(ngModel)]="f.currency" name="cur">
                <option value="USD">USD</option>
                <option value="ZWG">ZWG</option>
              </select>
            </div>
          </div>
          @if (formError()) {
            <div class="alert error">{{ formError() }}</div>
          }
          <div class="row-actions" style="margin-top:10px">
            <button class="btn" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn ghost" (click)="editing.set(null)">Cancel</button>
          </div>
        </form>
      }

      <div class="table-wrap">
        <table class="list">
          <thead>
            <tr>
              <th>Name</th><th>SKU</th><th class="num">Cost</th><th class="num">Price</th>
              <th class="num">Stock</th><th>Tax</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr [class.low-row]="isLow(p)">
                <td>
                  <b>{{ p.name }}</b>
                  @if (isLow(p)) {
                    <span class="badge red">low stock</span>
                  }
                </td>
                <td>{{ p.sku }}</td>
                <td class="num">{{ p.cost_price }}</td>
                <td class="num">{{ p.selling_price }} {{ p.currency }}</td>
                <td class="num">{{ p.stock_qty }}</td>
                <td>{{ p.tax_type }}</td>
                <td>
                  <div class="row-actions">
                    <button class="btn ghost small" (click)="openEdit(p)">Edit</button>
                    <button class="btn danger small" (click)="remove(p)">Delete</button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No products yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      .low-row td:first-child {
        border-left: 3px solid #dc2626;
      }
    `,
  ],
})
export class ProductsComponent {
  products = signal<Product[]>([]);
  editing = signal<Product | null>(null);
  error = signal('');
  formError = signal('');
  busy = signal(false);

  lowCount = computed(() => this.products().filter((p) => this.isLow(p)).length);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<Product[]>('/products/');
      this.products.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load products');
    }
  }

  isLow(p: Product): boolean {
    if (typeof p.is_low_stock === 'boolean') return p.is_low_stock;
    return Number(p.stock_qty) <= Number(p.low_stock_threshold || 0);
  }

  openNew(): void {
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
    this.editing.set({ ...p });
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
        cost_price: String(f.cost_price),
        selling_price: String(f.selling_price),
        tax_type: f.tax_type,
        stock_qty: Number(f.stock_qty) || 0,
        low_stock_threshold: Number(f.low_stock_threshold) || 0,
        currency: f.currency,
      };
      if (f.id) {
        await api.patch(`/products/${f.id}/`, body);
      } else {
        await api.post('/products/', body);
      }
      this.editing.set(null);
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(p: Product): Promise<void> {
    if (!confirm(`Delete product "${p.name}"?`)) return;
    try {
      await api.del(`/products/${p.id}/`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Delete failed');
    }
  }
}
