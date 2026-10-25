import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Customer, Sale } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { InitialsPipe, LabelPipe, MoneyPipe } from '../shared/format';
import { ToastService } from '../shared/toast.service';

const BLANK: Customer = { id: 0, name: '', phone: '', email: '', address: '', tin: '', vat_number: '', notes: '' };

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, InitialsPipe, MoneyPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Customers</h1>
          <p class="sub">{{ customers().length }} customer(s) · capture TINs for compliant fiscal invoices.</p>
        </div>
        <button class="btn" (click)="edit(blank)"><app-icon name="plus" [size]="16" /> Add customer</button>
      </div>

      <div class="toolbar">
        <div class="input-icon">
          <app-icon name="search" [size]="16" />
          <input type="search" placeholder="Search name, phone or email…" [(ngModel)]="q" />
        </div>
        @if (missingTin() > 0) {
          <span class="badge amber dot">{{ missingTin() }} without a TIN</span>
        }
      </div>

      <div class="card flush">
        <div class="table-wrap">
          <table class="list">
            <thead><tr><th>Customer</th><th>Phone</th><th>TIN</th><th>VAT no.</th><th></th></tr></thead>
            <tbody>
              @for (c of shown(); track c.id) {
                <tr class="clickable" (click)="view(c)">
                  <td>
                    <div class="row" style="gap:12px">
                      <span class="avatar">{{ c.name | initials }}</span>
                      <div>
                        <div class="cell-main">{{ c.name }}</div>
                        <div class="cell-sub">{{ c.email || c.address || '–' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>{{ c.phone || '–' }}</td>
                  <td>
                    @if (c.tin) { <span class="mono">{{ c.tin }}</span> } @else { <span class="badge amber">Missing</span> }
                  </td>
                  <td class="mono">{{ c.vat_number || '–' }}</td>
                  <td (click)="$event.stopPropagation()">
                    <div class="row-actions" style="justify-content:flex-end">
                      <button class="icon-btn small" (click)="edit(c)" title="Edit"><app-icon name="pencil" [size]="15" /></button>
                      <button class="icon-btn small" (click)="confirmDelete.set(c)" title="Delete"><app-icon name="trash" [size]="15" /></button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">{{ loading() ? 'Loading…' : q() ? 'No customers match your search' : 'No customers yet. Add your first one.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (editing(); as f) {
        <app-modal [title]="f.id ? 'Edit customer' : 'New customer'" [width]="560" (closed)="editing.set(null)">
          <form (ngSubmit)="save()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="cn">Name</label>
                <input id="cn" name="name" [(ngModel)]="f.name" required />
              </div>
              <div>
                <label class="field" for="cp">Phone</label>
                <input id="cp" name="phone" [(ngModel)]="f.phone" placeholder="+263…" />
              </div>
              <div>
                <label class="field" for="ce">Email</label>
                <input id="ce" type="email" name="email" [(ngModel)]="f.email" />
              </div>
              <div class="full">
                <label class="field" for="ca">Address</label>
                <input id="ca" name="address" [(ngModel)]="f.address" />
              </div>
              <div>
                <label class="field" for="ct">TIN</label>
                <input id="ct" name="tin" [(ngModel)]="f.tin" />
                <p class="hint">Required on fiscal invoices to VAT-registered buyers</p>
              </div>
              <div>
                <label class="field" for="cv">VAT number</label>
                <input id="cv" name="vat" [(ngModel)]="f.vat_number" />
              </div>
              <div class="full">
                <label class="field" for="cno">Notes</label>
                <textarea id="cno" name="notes" rows="2" [(ngModel)]="f.notes"></textarea>
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="editing.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !f.name">{{ busy() ? 'Saving…' : 'Save customer' }}</button>
            </div>
          </form>
        </app-modal>
      }

      @if (detail(); as d) {
        <app-modal [drawer]="true" [width]="460" [title]="d.c.name" [subtitle]="d.c.phone || d.c.email" (closed)="detail.set(null)">
          <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
            <div class="card stat" style="padding:14px">
              <p class="stat-label">Lifetime spend</p>
              <p class="stat-value" style="font-size:1.25rem">{{ spend(d.history) | money }}</p>
            </div>
            <div class="card stat" style="padding:14px">
              <p class="stat-label">Purchases</p>
              <p class="stat-value" style="font-size:1.25rem">{{ d.history.length }}</p>
            </div>
          </div>
          <p class="eyebrow">Purchase history</p>
          @for (s of d.history; track s.id) {
            <div class="kv">
              <span>{{ s.date | date: 'd MMM y' }} · {{ s.doc_type | label }}</span>
              <span>{{ s.total | money: s.currency }}</span>
            </div>
          } @empty {
            <div class="empty">No purchases yet</div>
          }
          <button class="btn ghost block" style="margin-top:18px" (click)="edit(d.c); detail.set(null)">
            <app-icon name="pencil" [size]="15" /> Edit details
          </button>
        </app-modal>
      }

      @if (confirmDelete(); as c) {
        <app-modal title="Delete customer?" [width]="400" (closed)="confirmDelete.set(null)">
          <p class="text-2">This removes <b>{{ c.name }}</b> from your customer book. Past sales stay on record.</p>
          <div class="form-actions">
            <button class="btn ghost" (click)="confirmDelete.set(null)">Cancel</button>
            <button class="btn danger" (click)="remove(c)">Delete</button>
          </div>
        </app-modal>
      }
    </div>
  `,
})
export class CustomersComponent implements OnInit {
  private toast = inject(ToastService);
  readonly blank = BLANK;

  customers = signal<Customer[]>([]);
  loading = signal(true);
  q = signal('');
  editing = signal<Customer | null>(null);
  detail = signal<{ c: Customer; history: Sale[] } | null>(null);
  confirmDelete = signal<Customer | null>(null);
  formError = signal('');
  busy = signal(false);

  shown = computed(() => {
    const n = this.q().trim().toLowerCase();
    if (!n) return this.customers();
    return this.customers().filter((c) =>
      [c.name, c.phone, c.email].some((v) => (v ?? '').toLowerCase().includes(n))
    );
  });
  missingTin = computed(() => this.customers().filter((c) => !c.tin).length);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      this.customers.set(asList<Customer>(await api.get('/customers/')));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load customers');
    } finally {
      this.loading.set(false);
    }
  }

  /** edit a copy so cancelling leaves the list untouched */
  edit(c: Customer): void {
    this.formError.set('');
    this.editing.set({ ...c });
  }

  spend(history: Sale[]): number {
    return history.reduce((s, x) => s + Number(x.total), 0);
  }

  async save(): Promise<void> {
    const f = this.editing();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const { id, ...body } = f;
      if (id) await api.patch(`/customers/${id}/`, body);
      else await api.post('/customers/', body);
      this.editing.set(null);
      this.toast.success(id ? 'Customer updated' : 'Customer added');
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async view(c: Customer): Promise<void> {
    this.detail.set({ c, history: [] });
    try {
      const full = await api.get<Customer & { purchase_history: Sale[] }>(`/customers/${c.id}/`);
      this.detail.set({ c, history: full.purchase_history ?? [] });
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load history');
    }
  }

  async remove(c: Customer): Promise<void> {
    this.confirmDelete.set(null);
    try {
      await api.del(`/customers/${c.id}/`);
      this.toast.success(`${c.name} deleted`);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Delete failed');
    }
  }
}
