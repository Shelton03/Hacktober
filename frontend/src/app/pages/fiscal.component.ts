import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { FiscalDevice, FiscalStatus, FiscalReceiptRow } from '../core/models';

@Component({
  selector: 'app-fiscal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Fiscal device (FDMS)</h1>
          <p class="sub">ZIMRA fiscal device status, day control and receipt sync</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="grid cols-2">
        <!-- device card -->
        <div class="card">
          <h2>Device</h2>
          @for (d of devices(); track d.id) {
            <p>
              <b>{{ d.model_name }}</b> (v{{ d.model_version }})
              <span class="badge" [class]="d.status === 'active' ? 'green' : 'slate'">
                {{ d.status }}
              </span>
            </p>
            <p class="muted">Device ID: {{ d.device_id }} · Serial: {{ d.serial_no }}</p>
            <p class="muted">Taxpayer: {{ d.taxpayer.name }} · TIN {{ d.taxpayer.tin }}</p>
            <p class="muted">Certificate valid till: {{ d.certificate_valid_till }}</p>
            @if (isExpiring(d.certificate_valid_till)) {
              <div class="alert info">Certificate expiring soon — renew below.</div>
            }
            <button class="btn ghost small" (click)="renew(d)">Renew certificate</button>
          } @empty {
            <div class="empty">No fiscal device registered yet.</div>
          }

          @if (showRegister()) {
            <form class="card" style="margin-top:10px;background:#f8fafc" (ngSubmit)="register()">
              <h3>Register device</h3>
              <div class="form-row">
                <div>
                  <label class="field">Device ID</label>
                  <input [(ngModel)]="regForm.device_id" name="device_id" />
                </div>
                <div>
                  <label class="field">Serial no</label>
                  <input [(ngModel)]="regForm.serial_no" name="serial" />
                </div>
              </div>
              <div class="form-row" style="margin-top:8px">
                <div>
                  <label class="field">Activation key</label>
                  <input [(ngModel)]="regForm.activation_key" name="key" />
                </div>
                <div>
                  <label class="field">Model name</label>
                  <input [(ngModel)]="regForm.model_name" name="model" />
                </div>
                <div>
                  <label class="field">Model version</label>
                  <input [(ngModel)]="regForm.model_version" name="version" />
                </div>
              </div>
              @if (regError()) {
                <div class="alert error">{{ regError() }}</div>
              }
              <div class="row-actions" style="margin-top:8px">
                <button class="btn small" [disabled]="busy()">Register</button>
                <button type="button" class="btn ghost small" (click)="showRegister.set(false)">
                  Cancel
                </button>
              </div>
            </form>
          } @else if (!devices().length) {
            <button class="btn" style="margin-top:8px" (click)="showRegister.set(true)">
              + Register device
            </button>
          }
        </div>

        <!-- day control -->
        <div class="card">
          <h2>Fiscal day</h2>
          @if (status(); as s) {
            <p>
              Day status:
              <span class="badge" [class]="s.day_open ? 'green' : 'slate'">
                {{ s.day_open ? 'open' : 'closed' }}
              </span>
              @if (s.fiscal_day_no) {
                <span class="muted"> · day #{{ s.fiscal_day_no }}</span>
              }
            </p>
            <div class="row-actions" style="margin-top:10px">
              @if (s.day_open) {
                <button class="btn danger" (click)="closeDay()" [disabled]="busy()">
                  Close day (Z-report)
                </button>
              } @else {
                <button class="btn" (click)="openDay()" [disabled]="busy()">Open day</button>
              }
            </div>
            @if (dayMsg()) {
              <div class="alert ok">{{ dayMsg() }}</div>
            }
          } @else {
            <div class="empty">No status available</div>
          }

          <h2 style="margin-top:16px">Receipt sync</h2>
          @if (pending().length) {
            <p>
              <span class="badge amber">{{ pending().length }} pending sync</span>
            </p>
            <button class="btn small" (click)="syncPending()" [disabled]="busy()">
              Retry sync now
            </button>
          } @else {
            <p><span class="badge green">all receipts synced</span></p>
          }
          @if (syncMsg()) {
            <div class="alert ok">{{ syncMsg() }}</div>
          }
          <div class="table-wrap" style="margin-top:10px">
            <table class="list">
              <thead><th>Receipt</th><th>Global no</th><th>Status</th></thead>
              <tbody>
                @for (r of receipts().slice(0, 15); track r.id) {
                  <tr>
                    <td>{{ r.receipt_id }}</td>
                    <td>{{ r.global_no }}</td>
                    <td>
                      <span class="badge" [class]="r.sync_status === 'pending' ? 'amber' : 'green'">
                        {{ r.sync_status }}
                      </span>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="empty">No receipts yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class FiscalComponent {
  devices = signal<FiscalDevice[]>([]);
  status = signal<FiscalStatus | null>(null);
  receipts = signal<FiscalReceiptRow[]>([]);
  error = signal('');
  busy = signal(false);
  dayMsg = signal('');
  syncMsg = signal('');
  showRegister = signal(false);
  regError = signal('');

  regForm = {
    device_id: '',
    serial_no: '',
    activation_key: '',
    model_name: '',
    model_version: '',
  };

  pending = computed(() => this.receipts().filter((r) => r.sync_status === 'pending'));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [devices, status, receipts] = await Promise.all([
        api.get<FiscalDevice[]>('/fiscal/devices/'),
        api.get<FiscalStatus>('/fiscal/status/').catch(() => null),
        api.get<FiscalReceiptRow[]>('/fiscal/receipts/'),
      ]);
      this.devices.set(Array.isArray(devices) ? devices : (devices as any).results ?? []);
      this.status.set(status);
      this.receipts.set(Array.isArray(receipts) ? receipts : (receipts as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load fiscal data');
    }
  }

  isExpiring(till: string): boolean {
    if (!till) return false;
    const d = new Date(till).getTime();
    return !isNaN(d) && d - Date.now() < 60 * 864e5;
  }

  async renew(d: FiscalDevice): Promise<void> {
    this.busy.set(true);
    try {
      await api.post(`/fiscal/devices/${d.id}/renew/`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Renew failed');
    } finally {
      this.busy.set(false);
    }
  }

  async register(): Promise<void> {
    this.busy.set(true);
    this.regError.set('');
    try {
      await api.post('/fiscal/devices/', { ...this.regForm });
      this.showRegister.set(false);
      await this.load();
    } catch (e: any) {
      this.regError.set(e?.message || 'Registration failed');
    } finally {
      this.busy.set(false);
    }
  }

  async openDay(): Promise<void> {
    this.busy.set(true);
    try {
      const res = await api.post<any>('/fiscal/open-day/', {});
      this.dayMsg.set(res?.fiscal_day_no ? `Day #${res.fiscal_day_no} opened.` : 'Day opened.');
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Open day failed');
    } finally {
      this.busy.set(false);
    }
  }

  async closeDay(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/fiscal/close-day/', {});
      this.dayMsg.set('Day closed — Z-report generated.');
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Close day failed');
    } finally {
      this.busy.set(false);
    }
  }

  async syncPending(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/fiscal/sync-pending/', {});
      this.syncMsg.set('Pending receipts queued for sync.');
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Sync failed');
    } finally {
      this.busy.set(false);
    }
  }
}
