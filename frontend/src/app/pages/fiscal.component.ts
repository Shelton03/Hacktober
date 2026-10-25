import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { FiscalDevice, FiscalReceiptRow, FiscalStatus } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-fiscal',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Fiscal device</h1>
          <p class="sub">ZIMRA FDMS device, fiscal day and receipt sync.</p>
        </div>
        @if (status()?.device?.mode; as mode) {
          <span class="badge" [class]="mode === 'PRODUCTION' ? 'green' : 'amber'">FDMS {{ mode }}</span>
        }
      </div>

      @if (loaded() && !devices().length) {
        <div class="card onboard">
          <span class="ob-ico"><app-icon name="printer" [size]="26" /></span>
          <h2>Register your fiscal device</h2>
          <p class="text-2">Enter the device ID, serial number and activation key from ZIMRA. Certificates and keys are stored encrypted for this business only.</p>
          <button class="btn" (click)="registerOpen.set(true)"><app-icon name="plus" [size]="16" /> Register device</button>
        </div>
      } @else {
        <div class="grid cols-3">
          <!-- fiscal day -->
          <div class="card day" [class.open]="dayOpen()">
            <p class="stat-label">Fiscal day</p>
            <div class="row" style="margin:10px 0 4px">
              <span class="pulse" [class.on]="dayOpen()"></span>
              <span class="stat-value">{{ dayOpen() ? 'Open' : 'Closed' }}</span>
            </div>
            <p class="stat-sub">
              @if (status()?.day?.fiscal_day_no) { Day #{{ status()?.day?.fiscal_day_no }} · {{ status()?.day?.last_receipt_counter ?? 0 }} receipt(s) today }
              @else { No day open }
            </p>
            @if (status()?.day && status()?.day?.yesterday_closed === false) {
              <div class="alert warn" style="margin-bottom:0"><app-icon name="alert" /> Yesterday's day was not closed. Close days daily to submit Z-reports on time.</div>
            }
            <div style="margin-top:16px">
              @if (dayOpen()) {
                <button class="btn danger-ghost block" (click)="confirmClose.set(true)" [disabled]="busy()"><app-icon name="power" [size]="16" /> Close day &amp; submit Z-report</button>
              } @else {
                <button class="btn block" (click)="openDay()" [disabled]="busy()"><app-icon name="power" [size]="16" /> Open fiscal day</button>
              }
            </div>
          </div>

          <!-- sync -->
          <div class="card">
            <p class="stat-label">Receipt sync</p>
            @if (pending().length) {
              <div class="row" style="margin:10px 0 4px"><app-icon name="upload" [size]="22" /><span class="stat-value">{{ pending().length }} pending</span></div>
              <p class="stat-sub">Saved offline. Retry once you're back online.</p>
              <button class="btn block" style="margin-top:16px" (click)="syncPending()" [disabled]="busy()"><app-icon name="refresh" [size]="16" /> Sync now</button>
            } @else {
              <div class="row" style="margin:10px 0 4px;color:var(--success)"><app-icon name="check-circle" [size]="22" /><span class="stat-value">All synced</span></div>
              <p class="stat-sub">{{ receipts().length }} receipt(s) submitted to FDMS</p>
            }
          </div>

          <!-- device -->
          @for (d of devices(); track d.id) {
            <div class="card">
              <div class="row" style="justify-content:space-between">
                <p class="stat-label">Device</p>
                <span class="badge dot" [class]="d.status === 'active' ? 'green' : 'slate'">{{ d.status }}</span>
              </div>
              <h3 style="margin-top:10px">{{ d.model_name }} <span class="muted">{{ d.model_version }}</span></h3>
              <div class="kv"><span>Device ID</span><span class="mono">{{ d.device_id }}</span></div>
              <div class="kv"><span>Serial</span><span class="mono">{{ d.serial_no }}</span></div>
              <div class="kv"><span>TIN</span><span class="mono">{{ d.taxpayer.tin || '–' }}</span></div>
              <div class="kv"><span>Certificate</span><span [class.neg]="isExpiring(d.certificate_valid_till)">to {{ d.certificate_valid_till | date: 'd MMM y' }}</span></div>
              <button class="btn ghost small" style="margin-top:10px" (click)="renew(d)" [disabled]="busy()">
                <app-icon name="refresh" [size]="14" /> Renew certificate
              </button>
            </div>
          }
        </div>

        <div class="section-title"><h2>Recent fiscal receipts</h2></div>
        <div class="card flush">
          <div class="table-wrap">
            <table class="list">
              <thead><tr><th>Global no.</th><th>Receipt ID</th><th>Invoice</th><th>Counter</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (r of receipts().slice(0, 25); track r.id) {
                  <tr>
                    <td class="mono cell-main">#{{ r.global_no }}</td>
                    <td class="mono">{{ r.receipt_id }}</td>
                    <td class="mono">{{ r.invoice_no || '–' }}</td>
                    <td>{{ r.counter ?? '–' }}</td>
                    <td><span class="badge dot" [class]="r.sync_status === 'pending' ? 'amber' : 'green'">{{ r.sync_status === 'pending' ? 'Pending' : 'Synced' }}</span></td>
                    <td>
                      <div class="row-actions" style="justify-content:flex-end">
                        @if (r.qr_url) {
                          <a class="icon-btn small" [href]="r.qr_url" target="_blank" rel="noopener" title="Verify on ZIMRA"><app-icon name="qr" [size]="16" /></a>
                        }
                        <button class="icon-btn small" (click)="receiptPdf(r.sale)" title="Receipt PDF"><app-icon name="download" [size]="16" /></button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="empty">No receipts yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (registerOpen()) {
        <app-modal title="Register fiscal device" subtitle="Details from your ZIMRA FDMS registration" [width]="520" (closed)="registerOpen.set(false)">
          <form (ngSubmit)="register()">
            <div class="form-grid">
              <div>
                <label class="field" for="rd">Device ID</label>
                <input id="rd" name="device_id" [(ngModel)]="regForm.device_id" required />
              </div>
              <div>
                <label class="field" for="rs">Serial no.</label>
                <input id="rs" name="serial" [(ngModel)]="regForm.serial_no" required />
              </div>
              <div class="full">
                <label class="field" for="rk">Activation key</label>
                <input id="rk" name="key" [(ngModel)]="regForm.activation_key" required autocomplete="off" />
              </div>
              <div>
                <label class="field" for="rm">Model name</label>
                <input id="rm" name="model" [(ngModel)]="regForm.model_name" />
              </div>
              <div>
                <label class="field" for="rv">Model version</label>
                <input id="rv" name="version" [(ngModel)]="regForm.model_version" />
              </div>
            </div>
            @if (regError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ regError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="registerOpen.set(false)">Cancel</button>
              <button class="btn" [disabled]="busy()">{{ busy() ? 'Registering…' : 'Register' }}</button>
            </div>
          </form>
        </app-modal>
      }

      @if (confirmClose()) {
        <app-modal title="Close fiscal day?" [width]="420" (closed)="confirmClose.set(false)">
          <p class="text-2">This submits the Z-report for day #{{ status()?.day?.fiscal_day_no }} to ZIMRA. New sales will open a new fiscal day.</p>
          <div class="form-actions">
            <button class="btn ghost" (click)="confirmClose.set(false)">Cancel</button>
            <button class="btn danger" (click)="closeDay()" [disabled]="busy()">Close day</button>
          </div>
        </app-modal>
      }
    </div>
  `,
  styles: [
    `
      .onboard {
        text-align: center;
        padding: 40px 24px;
        max-width: 560px;
        margin: 0 auto;
      }
      .ob-ico {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: inline-grid;
        place-items: center;
        background: var(--primary-soft);
        color: var(--primary-ink);
        margin-bottom: 12px;
      }
      .pulse {
        width: 12px;
        height: 12px;
        border-radius: 99px;
        background: var(--text-3);
        flex: none;
      }
      .pulse.on {
        background: var(--success);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 45%, transparent);
        animation: pulse 1.8s infinite;
      }
      @keyframes pulse {
        70% {
          box-shadow: 0 0 0 10px transparent;
        }
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
      }
      .day.open {
        border-color: color-mix(in srgb, var(--success) 40%, var(--border));
      }
    `,
  ],
})
export class FiscalComponent implements OnInit {
  private toast = inject(ToastService);
  devices = signal<FiscalDevice[]>([]);
  status = signal<FiscalStatus | null>(null);
  receipts = signal<FiscalReceiptRow[]>([]);
  loaded = signal(false);
  busy = signal(false);
  registerOpen = signal(false);
  confirmClose = signal(false);
  regError = signal('');

  regForm = { device_id: '', serial_no: '', activation_key: '', model_name: 'Server', model_version: 'v1' };

  dayOpen = computed(() => !!this.status()?.day?.open);
  pending = computed(() => this.receipts().filter((r) => r.sync_status === 'pending'));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [devices, status, receipts] = await Promise.all([
        api.get('/fiscal/devices/'),
        api.get<FiscalStatus>('/fiscal/status/').catch(() => null),
        api.get('/fiscal/receipts/'),
      ]);
      this.devices.set(asList<FiscalDevice>(devices));
      this.status.set(status);
      this.receipts.set(asList<FiscalReceiptRow>(receipts));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load fiscal data');
    } finally {
      this.loaded.set(true);
    }
  }

  isExpiring(till: string | null): boolean {
    if (!till) return false;
    const d = new Date(till).getTime();
    return !isNaN(d) && d - Date.now() < 60 * 864e5;
  }

  private async run(fn: () => Promise<unknown>, ok: string, fail: string): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.toast.success(ok);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || fail);
    } finally {
      this.busy.set(false);
    }
  }

  renew(d: FiscalDevice): Promise<void> {
    return this.run(() => api.post(`/fiscal/devices/${d.id}/renew/`), 'Certificate renewed', 'Renewal failed');
  }

  openDay(): Promise<void> {
    return this.run(() => api.post('/fiscal/open-day/', {}), 'Fiscal day opened', 'Could not open day');
  }

  async closeDay(): Promise<void> {
    this.confirmClose.set(false);
    await this.run(() => api.post('/fiscal/close-day/', {}), 'Day closed and Z-report submitted', 'Close day failed');
  }

  syncPending(): Promise<void> {
    return this.run(async () => {
      const r = await api.post<{ synced: number }>('/fiscal/sync-pending/', {});
      if (!r?.synced) throw new Error('Nothing synced. FDMS may still be unreachable');
    }, 'Pending receipts synced', 'Sync failed');
  }

  async register(): Promise<void> {
    this.busy.set(true);
    this.regError.set('');
    try {
      await api.post('/fiscal/devices/', { ...this.regForm });
      this.registerOpen.set(false);
      this.toast.success('Fiscal device registered');
      await this.load();
    } catch (e: any) {
      this.regError.set(e?.message || 'Registration failed');
    } finally {
      this.busy.set(false);
    }
  }

  receiptPdf(saleId: number): void {
    api.download(`/sales/${saleId}/receipt-pdf/`);
  }
}
