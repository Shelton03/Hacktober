import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Expense, PurchaseInvoice, Supplier } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { InitialsPipe, LabelPipe, MoneyPipe, humanize, today } from '../shared/format';
import { ToastService } from '../shared/toast.service';

type Tab = 'expenses' | 'purchases' | 'suppliers';
type Dialog = 'expense' | 'purchase' | 'supplier' | null;

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, MoneyPipe, LabelPipe, InitialsPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Expenses &amp; purchases</h1>
          <p class="sub">Track spending. Only FDMS-validated purchase invoices count towards input VAT.</p>
        </div>
        <button class="btn" (click)="openDialog(tab() === 'expenses' ? 'expense' : tab() === 'purchases' ? 'purchase' : 'supplier')">
          <app-icon name="plus" [size]="16" />
          {{ tab() === 'expenses' ? 'Add expense' : tab() === 'purchases' ? 'Add purchase invoice' : 'Add supplier' }}
        </button>
      </div>

      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'expenses'" (click)="tab.set('expenses')"><app-icon name="wallet" [size]="16" /> Expenses</button>
        <button class="tab" [class.active]="tab() === 'purchases'" (click)="tab.set('purchases')"><app-icon name="invoice" [size]="16" /> Purchase invoices</button>
        <button class="tab" [class.active]="tab() === 'suppliers'" (click)="tab.set('suppliers')"><app-icon name="truck" [size]="16" /> Suppliers</button>
      </div>

      @switch (tab()) {
        @case ('expenses') {
          <div class="split" style="margin-bottom:16px">
            <div class="grid cols-2">
              <div class="card stat">
                <div class="stat-top"><p class="stat-label">This month</p><span class="stat-icon red"><app-icon name="wallet" [size]="17" /></span></div>
                <p class="stat-value">{{ monthTotal() | money }}</p>
                <p class="stat-sub">{{ monthExpenses().length }} expense(s) since the 1st</p>
              </div>
              <div class="card stat">
                <div class="stat-top"><p class="stat-label">Biggest cost</p><span class="stat-icon amber"><app-icon name="pie" [size]="17" /></span></div>
                <p class="stat-value" style="font-size:1.25rem">{{ byCategory()[0]?.label || '–' }}</p>
                <p class="stat-sub">{{ (byCategory()[0]?.value ?? 0) | money }} this month</p>
              </div>
            </div>
            <div class="card">
              <h3 style="margin-bottom:10px">Where the money went</h3>
              @for (c of byCategory().slice(0, 5); track c.label) {
                <div style="margin-bottom:9px">
                  <div class="row" style="justify-content:space-between;font-size:0.8rem;margin-bottom:4px">
                    <span class="text-2">{{ c.label }}</span><b>{{ c.value | money }}</b>
                  </div>
                  <div class="bar amber"><span [style.width.%]="(c.value / (byCategory()[0].value || 1)) * 100"></span></div>
                </div>
              } @empty {
                <p class="muted">No expenses this month yet.</p>
              }
            </div>
          </div>

          <div class="card flush">
            <div class="table-wrap">
              <table class="list">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead>
                <tbody>
                  @for (e of expenses(); track e.id) {
                    <tr>
                      <td class="text-2">{{ e.date | date: 'd MMM y' }}</td>
                      <td><span class="badge teal">{{ e.category | label }}</span></td>
                      <td>{{ e.description || '–' }}</td>
                      <td class="num cell-main">{{ e.amount | money: e.currency }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="empty">{{ loading() ? 'Loading…' : 'No expenses recorded' }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @case ('purchases') {
          <div class="grid cols-3" style="margin-bottom:16px">
            <div class="card stat">
              <div class="stat-top"><p class="stat-label">Claimable input VAT</p><span class="stat-icon green"><app-icon name="check-circle" [size]="17" /></span></div>
              <p class="stat-value">{{ claimableVat() | money }}</p>
              <p class="stat-sub">From FDMS-validated invoices</p>
            </div>
            <div class="card stat">
              <div class="stat-top"><p class="stat-label">Not validated</p><span class="stat-icon amber"><app-icon name="alert" [size]="17" /></span></div>
              <p class="stat-value">{{ unvalidated().length }}</p>
              <p class="stat-sub">{{ unvalidatedVat() | money }} VAT you can't claim yet</p>
            </div>
            <div class="card stat">
              <div class="stat-top"><p class="stat-label">Purchases</p><span class="stat-icon"><app-icon name="invoice" [size]="17" /></span></div>
              <p class="stat-value">{{ purchaseTotal() | money }}</p>
              <p class="stat-sub">{{ purchases().length }} supplier invoice(s)</p>
            </div>
          </div>
          <div class="card flush">
            <div class="table-wrap">
              <table class="list">
                <thead>
                  <tr><th>Date</th><th>Supplier</th><th>Invoice no.</th><th>Fiscal no.</th><th class="num">Amount</th><th class="num">VAT</th><th>FDMS</th></tr>
                </thead>
                <tbody>
                  @for (p of purchases(); track p.id) {
                    <tr>
                      <td class="text-2">{{ p.date | date: 'd MMM y' }}</td>
                      <td class="cell-main">{{ p.supplier_name || '–' }}</td>
                      <td class="mono">{{ p.supplier_invoice_no || '–' }}</td>
                      <td class="mono">{{ p.fiscal_invoice_no || '–' }}</td>
                      <td class="num">{{ p.amount | money: p.currency }}</td>
                      <td class="num">{{ p.vat_amount | money: p.currency }}</td>
                      <td>
                        @if (p.fdms_validated) {
                          <span class="badge green dot" [title]="p.validation_ref || ''">Validated</span>
                        } @else {
                          <span class="badge amber dot">Not validated</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="7" class="empty">{{ loading() ? 'Loading…' : 'No purchase invoices' }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @default {
          <div class="grid cols-3">
            @for (s of suppliers(); track s.id) {
              <div class="card row" style="gap:12px;align-items:flex-start">
                <span class="avatar">{{ s.name | initials }}</span>
                <div style="min-width:0">
                  <h3>{{ s.name }}</h3>
                  <p class="muted" style="margin:2px 0 0">{{ s.phone || 'No phone' }}{{ s.email ? ' · ' + s.email : '' }}</p>
                  <p class="muted" style="margin:2px 0 0">TIN {{ s.tin || '–' }}</p>
                </div>
              </div>
            } @empty {
              <div class="card empty" style="grid-column:1/-1">{{ loading() ? 'Loading…' : 'No suppliers yet' }}</div>
            }
          </div>
        }
      }

      @if (dialog() === 'expense') {
        <app-modal title="Add expense" [width]="480" (closed)="dialog.set(null)">
          <form (ngSubmit)="saveExpense()">
            <div class="form-grid">
              <div>
                <label class="field" for="ed">Date</label>
                <input id="ed" type="date" name="date" [(ngModel)]="expForm.date" />
              </div>
              <div>
                <label class="field" for="ec">Category</label>
                <select id="ec" name="category" [(ngModel)]="expForm.category">
                  @for (c of categories(); track c) {
                    <option [value]="c">{{ c | label }}</option>
                  }
                </select>
              </div>
              <div class="full">
                <label class="field" for="edesc">Description</label>
                <input id="edesc" name="desc" [(ngModel)]="expForm.description" placeholder="e.g. October rent" />
              </div>
              <div>
                <label class="field" for="ea">Amount</label>
                <input id="ea" name="amount" inputmode="decimal" [(ngModel)]="expForm.amount" required />
              </div>
              <div>
                <label class="field" for="ecur">Currency</label>
                <select id="ecur" name="cur" [(ngModel)]="expForm.currency">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="dialog.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !(+expForm.amount > 0)">{{ busy() ? 'Saving…' : 'Add expense' }}</button>
            </div>
          </form>
        </app-modal>
      }

      @if (dialog() === 'purchase') {
        <app-modal title="Add purchase invoice" subtitle="We'll check the fiscal number against ZIMRA FDMS" [width]="560" (closed)="dialog.set(null)">
          <form (ngSubmit)="savePurchase()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="ps">Supplier</label>
                <select id="ps" name="supplier" [(ngModel)]="purForm.supplier">
                  <option [ngValue]="null">Select supplier…</option>
                  @for (s of suppliers(); track s.id) {
                    <option [ngValue]="s.id">{{ s.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="field" for="psi">Supplier invoice no.</label>
                <input id="psi" name="sino" [(ngModel)]="purForm.supplier_invoice_no" />
              </div>
              <div>
                <label class="field" for="pfi">Fiscal invoice no.</label>
                <input id="pfi" name="fino" [(ngModel)]="purForm.fiscal_invoice_no" placeholder="From the supplier's receipt" />
              </div>
              <div>
                <label class="field" for="pd">Date</label>
                <input id="pd" type="date" name="pdate" [(ngModel)]="purForm.date" />
              </div>
              <div>
                <label class="field" for="pcur">Currency</label>
                <select id="pcur" name="pcur" [(ngModel)]="purForm.currency">
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
              <div>
                <label class="field" for="pa">Amount (incl. VAT)</label>
                <input id="pa" name="pamount" inputmode="decimal" [(ngModel)]="purForm.amount" required />
              </div>
              <div>
                <label class="field" for="pv">VAT amount</label>
                <input id="pv" name="pvat" inputmode="decimal" [(ngModel)]="purForm.vat_amount" />
              </div>
              <div class="full">
                <label class="field" for="pdesc">Description</label>
                <input id="pdesc" name="pdesc" [(ngModel)]="purForm.description" />
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="dialog.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !(+purForm.amount > 0)">{{ busy() ? 'Validating…' : 'Save & validate' }}</button>
            </div>
          </form>
        </app-modal>
      }

      @if (dialog() === 'supplier') {
        <app-modal title="Add supplier" [width]="460" (closed)="dialog.set(null)">
          <form (ngSubmit)="saveSupplier()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="sn">Name</label>
                <input id="sn" name="sname" [(ngModel)]="supForm.name" required />
              </div>
              <div>
                <label class="field" for="sp">Phone</label>
                <input id="sp" name="sphone" [(ngModel)]="supForm.phone" />
              </div>
              <div>
                <label class="field" for="st">TIN</label>
                <input id="st" name="stin" [(ngModel)]="supForm.tin" />
              </div>
              <div class="full">
                <label class="field" for="se">Email</label>
                <input id="se" type="email" name="semail" [(ngModel)]="supForm.email" />
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="dialog.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !supForm.name">Add supplier</button>
            </div>
          </form>
        </app-modal>
      }
    </div>
  `,
})
export class ExpensesComponent implements OnInit {
  private toast = inject(ToastService);

  tab = signal<Tab>('expenses');
  dialog = signal<Dialog>(null);
  expenses = signal<Expense[]>([]);
  purchases = signal<PurchaseInvoice[]>([]);
  suppliers = signal<Supplier[]>([]);
  categories = signal<string[]>([]);
  loading = signal(true);
  busy = signal(false);
  formError = signal('');

  expForm = this.blankExpense();
  purForm = this.blankPurchase();
  supForm = { name: '', phone: '', email: '', tin: '' };

  monthExpenses = computed(() => {
    const start = today().slice(0, 8) + '01';
    return this.expenses().filter((e) => e.date >= start);
  });
  monthTotal = computed(() => this.monthExpenses().reduce((s, e) => s + Number(e.amount), 0));
  byCategory = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.monthExpenses()) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount));
    return [...m.entries()].map(([k, v]) => ({ label: humanize(k), value: v })).sort((a, b) => b.value - a.value);
  });
  claimableVat = computed(() =>
    this.purchases().filter((p) => p.fdms_validated).reduce((s, p) => s + Number(p.vat_amount), 0)
  );
  unvalidated = computed(() => this.purchases().filter((p) => !p.fdms_validated));
  unvalidatedVat = computed(() => this.unvalidated().reduce((s, p) => s + Number(p.vat_amount), 0));
  purchaseTotal = computed(() => this.purchases().reduce((s, p) => s + Number(p.amount), 0));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [exp, pur, sup, cats] = await Promise.all([
        api.get('/expenses/'),
        api.get('/purchase-invoices/'),
        api.get('/suppliers/'),
        api.get('/expenses/categories/'),
      ]);
      this.expenses.set(asList<Expense>(exp));
      this.purchases.set(asList<PurchaseInvoice>(pur));
      this.suppliers.set(asList<Supplier>(sup));
      const list = asList<string>(cats, 'categories');
      this.categories.set(list.length ? list : ['other']);
      if (!this.expForm.category) this.expForm.category = this.categories()[0];
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load expenses');
    } finally {
      this.loading.set(false);
    }
  }

  openDialog(d: Dialog): void {
    this.formError.set('');
    if (d === 'expense') this.expForm = { ...this.blankExpense(), category: this.categories()[0] ?? '' };
    if (d === 'purchase') this.purForm = this.blankPurchase();
    if (d === 'supplier') this.supForm = { name: '', phone: '', email: '', tin: '' };
    this.dialog.set(d);
  }

  private blankExpense() {
    return { date: today(), category: '', description: '', amount: '', currency: 'USD' };
  }

  private blankPurchase() {
    return {
      supplier: null as number | null,
      supplier_invoice_no: '',
      fiscal_invoice_no: '',
      description: '',
      date: today(),
      amount: '',
      vat_amount: '',
      currency: 'USD',
    };
  }

  private async submit(fn: () => Promise<unknown>, ok: string): Promise<void> {
    this.busy.set(true);
    this.formError.set('');
    try {
      await fn();
      this.dialog.set(null);
      this.toast.success(ok);
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  saveExpense(): Promise<void> {
    return this.submit(() => api.post('/expenses/', { ...this.expForm, amount: String(this.expForm.amount) }), 'Expense added');
  }

  savePurchase(): Promise<void> {
    const f = this.purForm;
    return this.submit(
      () =>
        api.post('/purchase-invoices/', {
          ...f,
          supplier: f.supplier ?? undefined,
          amount: String(f.amount),
          vat_amount: String(f.vat_amount || '0'),
        }),
      'Purchase invoice saved'
    );
  }

  saveSupplier(): Promise<void> {
    return this.submit(() => api.post('/suppliers/', { ...this.supForm }), 'Supplier added');
  }
}
