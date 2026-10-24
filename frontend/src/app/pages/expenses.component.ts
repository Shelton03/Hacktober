import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Expense, PurchaseInvoice, Supplier } from '../core/models';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Expenses &amp; Purchases</h1>
          <p class="sub">Track spending; FDMS-validated purchase invoices</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'expenses'" (click)="tab.set('expenses')">
          Expenses
        </button>
        <button
          class="tab"
          [class.active]="tab() === 'purchases'"
          (click)="tab.set('purchases')"
        >
          Purchase invoices
        </button>
        <button class="tab" [class.active]="tab() === 'suppliers'" (click)="tab.set('suppliers')">
          Suppliers
        </button>
      </div>

      @if (tab() === 'expenses') {
        <div class="grid cols-2">
          <form class="card" (ngSubmit)="saveExpense()">
            <h2>New expense</h2>
            <div class="form-row">
              <div>
                <label class="field">Date</label>
                <input type="date" [(ngModel)]="expForm.date" name="date" />
              </div>
              <div>
                <label class="field">Category</label>
                <select [(ngModel)]="expForm.category" name="category">
                  @for (c of categories(); track $index) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              </div>
            </div>
            <label class="field" style="margin-top:8px">Description</label>
            <input [(ngModel)]="expForm.description" name="desc" />
            <div class="form-row" style="margin-top:8px">
              <div>
                <label class="field">Amount</label>
                <input type="text" [(ngModel)]="expForm.amount" name="amount" />
              </div>
              <div>
                <label class="field">Currency</label>
                <select [(ngModel)]="expForm.currency" name="cur">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
            </div>
            @if (expError()) {
              <div class="alert error">{{ expError() }}</div>
            }
            <button class="btn" style="margin-top:10px" [disabled]="busy()">
              {{ busy() ? 'Saving…' : 'Add expense' }}
            </button>
          </form>

          <div class="table-wrap">
            <table class="list">
              <thead>
                <tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr>
              </thead>
              <tbody>
                @for (e of expenses(); track e.id) {
                  <tr>
                    <td>{{ e.date | date: 'd MMM y' }}</td>
                    <td><span class="badge teal">{{ e.category }}</span></td>
                    <td>{{ e.description }}</td>
                    <td class="num">{{ e.amount }} {{ e.currency }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="empty">No expenses recorded</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else if (tab() === 'purchases') {
        <div class="table-wrap">
          <table class="list">
            <thead>
              <tr>
                <th>Date</th><th>Supplier</th><th>Supplier inv #</th><th>Fiscal inv #</th>
                <th class="num">Amount</th><th class="num">VAT</th><th>FDMS</th>
              </tr>
            </thead>
            <tbody>
              @for (p of purchases(); track p.id) {
                <tr>
                  <td>{{ p.date | date: 'd MMM y' }}</td>
                  <td>{{ p.supplier_name || p.supplier }}</td>
                  <td>{{ p.supplier_invoice_no }}</td>
                  <td>{{ p.fiscal_invoice_no }}</td>
                  <td class="num">{{ p.amount }}</td>
                  <td class="num">{{ p.vat_amount }}</td>
                  <td>
                    <span class="badge" [class]="p.fdms_validated ? 'green' : 'slate'">
                      {{ p.fdms_validated ? 'validated' : 'not validated' }}
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">No purchase invoices</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="grid cols-2">
          <form class="card" (ngSubmit)="saveSupplier()">
            <h2>New supplier</h2>
            <label class="field">Name *</label>
            <input [(ngModel)]="supForm.name" name="sname" required />
            <div class="form-row" style="margin-top:8px">
              <div>
                <label class="field">Phone</label>
                <input [(ngModel)]="supForm.phone" name="sphone" />
              </div>
              <div>
                <label class="field">Email</label>
                <input [(ngModel)]="supForm.email" name="semail" />
              </div>
              <div>
                <label class="field">TIN</label>
                <input [(ngModel)]="supForm.tin" name="stin" />
              </div>
            </div>
            @if (supError()) {
              <div class="alert error">{{ supError() }}</div>
            }
            <button class="btn" style="margin-top:10px" [disabled]="busy()">Add supplier</button>
          </form>
          <div class="table-wrap">
            <table class="list">
              <thead><tr><th>Name</th><th>Phone</th><th>TIN</th></tr></thead>
              <tbody>
                @for (s of suppliers(); track s.id) {
                  <tr>
                    <td><b>{{ s.name }}</b></td>
                    <td>{{ s.phone }}</td>
                    <td>{{ s.tin }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="empty">No suppliers yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .tabs {
        display: flex;
        gap: 6px;
        margin-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
      }
      .tab {
        background: none;
        border: none;
        padding: 8px 14px;
        font-size: 0.88rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        border-bottom: 2px solid transparent;
      }
      .tab.active {
        color: #0f766e;
        border-bottom-color: #0f766e;
      }
    `,
  ],
})
export class ExpensesComponent {
  tab = signal<'expenses' | 'purchases' | 'suppliers'>('expenses');
  expenses = signal<Expense[]>([]);
  purchases = signal<PurchaseInvoice[]>([]);
  suppliers = signal<Supplier[]>([]);
  categories = signal<string[]>([]);
  error = signal('');
  expError = signal('');
  supError = signal('');
  busy = signal(false);

  expForm = {
    date: new Date().toISOString().slice(0, 10),
    category: '',
    description: '',
    amount: '',
    currency: 'USD',
  };
  supForm = { name: '', phone: '', email: '', tin: '' };

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll(): Promise<void> {
    try {
      const [exp, pur, sup, cats] = await Promise.all([
        api.get<Expense[]>('/expenses/'),
        api.get<PurchaseInvoice[]>('/purchase-invoices/'),
        api.get<Supplier[]>('/suppliers/'),
        api.get<any>('/expenses/categories/'),
      ]);
      this.expenses.set(Array.isArray(exp) ? exp : (exp as any).results ?? []);
      this.purchases.set(Array.isArray(pur) ? pur : (pur as any).results ?? []);
      this.suppliers.set(Array.isArray(sup) ? sup : (sup as any).results ?? []);
      const catList = Array.isArray(cats)
        ? cats.map((c: any) => (typeof c === 'string' ? c : c.name))
        : (cats as any)?.results?.map((c: any) => c.name ?? c) ?? [];
      this.categories.set(catList.length ? catList : ['stock', 'rent', 'utilities', 'transport', 'other']);
      if (!this.expForm.category && this.categories().length) {
        this.expForm.category = this.categories()[0];
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load expenses');
    }
  }

  async saveExpense(): Promise<void> {
    this.busy.set(true);
    this.expError.set('');
    try {
      await api.post('/expenses/', {
        date: this.expForm.date,
        category: this.expForm.category,
        description: this.expForm.description,
        amount: String(this.expForm.amount),
        currency: this.expForm.currency,
      });
      this.expForm.description = '';
      this.expForm.amount = '';
      await this.loadAll();
    } catch (e: any) {
      this.expError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async saveSupplier(): Promise<void> {
    this.busy.set(true);
    this.supError.set('');
    try {
      await api.post('/suppliers/', { ...this.supForm });
      this.supForm = { name: '', phone: '', email: '', tin: '' };
      await this.loadAll();
    } catch (e: any) {
      this.supError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }
}
