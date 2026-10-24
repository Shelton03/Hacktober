import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Customer, Sale } from '../core/models';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Customers</h1>
          <p class="sub">Your customer book</p>
        </div>
        <button class="btn" (click)="openNew()">+ Add customer</button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @if (editing(); as f) {
        <form class="card" style="margin-bottom:14px" (ngSubmit)="save()">
          <h2>{{ f.id ? 'Edit customer' : 'New customer' }}</h2>
          <div class="form-row">
            <div>
              <label class="field">Name *</label>
              <input [(ngModel)]="f.name" name="name" required />
            </div>
            <div>
              <label class="field">Phone</label>
              <input [(ngModel)]="f.phone" name="phone" placeholder="+263…" />
            </div>
            <div>
              <label class="field">Email</label>
              <input type="email" [(ngModel)]="f.email" name="email" />
            </div>
          </div>
          <div class="form-row" style="margin-top:8px">
            <div>
              <label class="field">Address</label>
              <input [(ngModel)]="f.address" name="address" />
            </div>
            <div>
              <label class="field">TIN</label>
              <input [(ngModel)]="f.tin" name="tin" />
            </div>
            <div>
              <label class="field">VAT number</label>
              <input [(ngModel)]="f.vat_number" name="vat" />
            </div>
          </div>
          <label class="field" style="margin-top:8px">Notes</label>
          <textarea [(ngModel)]="f.notes" name="notes" rows="2"></textarea>
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
            <tr><th>Name</th><th>Phone</th><th>Email</th><th>TIN</th><th>Actions</th></tr>
          </thead>
          <tbody>
            @for (c of customers(); track c.id) {
              <tr>
                <td><b>{{ c.name }}</b></td>
                <td>{{ c.phone }}</td>
                <td>{{ c.email }}</td>
                <td>{{ c.tin }}</td>
                <td>
                  <div class="row-actions">
                    <button class="btn ghost small" (click)="openEdit(c)">Edit</button>
                    <button class="btn ghost small" (click)="view(c)">History</button>
                    <button class="btn danger small" (click)="remove(c)">Delete</button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">No customers yet</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (detail(); as d) {
        <div class="card" style="margin-top:14px">
          <div class="page-head">
            <h2>Purchase history — {{ d.c.name }}</h2>
            <button class="btn ghost small" (click)="detail.set(null)">Close</button>
          </div>
          <table class="list">
            <thead>
              <tr><th>Date</th><th class="num">Total</th><th>Currency</th><th>Receipt</th></tr>
            </thead>
            <tbody>
              @for (s of d.history; track s.id) {
                <tr>
                  <td>{{ s.date | date: 'd MMM y' }}</td>
                  <td class="num">{{ s.total }}</td>
                  <td>{{ s.currency }}</td>
                  <td>{{ s.receipt_status }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">No purchases yet</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class CustomersComponent {
  customers = signal<Customer[]>([]);
  editing = signal<Customer | null>(null);
  detail = signal<{ c: Customer; history: Sale[] } | null>(null);
  error = signal('');
  formError = signal('');
  busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<Customer[]>('/customers/');
      this.customers.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load customers');
    }
  }

  openNew(): void {
    this.editing.set({
      id: 0,
      name: '',
      phone: '',
      email: '',
      address: '',
      tin: '',
      vat_number: '',
      notes: '',
    });
  }

  openEdit(c: Customer): void {
    this.editing.set({ ...c });
  }

  async save(): Promise<void> {
    const f = this.editing();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const body = {
        name: f.name,
        phone: f.phone,
        email: f.email,
        address: f.address,
        tin: f.tin,
        vat_number: f.vat_number,
        notes: f.notes,
      };
      if (f.id) {
        await api.patch(`/customers/${f.id}/`, body);
      } else {
        await api.post('/customers/', body);
      }
      this.editing.set(null);
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async view(c: Customer): Promise<void> {
    try {
      const full = await api.get<Customer & { purchase_history: Sale[] }>(`/customers/${c.id}/`);
      this.detail.set({ c, history: full.purchase_history ?? [] });
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load history');
    }
  }

  async remove(c: Customer): Promise<void> {
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await api.del(`/customers/${c.id}/`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Delete failed');
    }
  }
}
