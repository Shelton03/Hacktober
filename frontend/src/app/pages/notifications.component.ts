import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { api, asList } from '../core/api';
import type { AppNotification, NotificationSettings } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { AgoPipe } from '../shared/format';
import { ToastService } from '../shared/toast.service';

const KIND_ICON: Record<string, string> = {
  overdue_invoice: 'invoice',
  low_stock: 'package',
  lead_followup: 'target',
  tax_due: 'landmark',
  fiscal: 'printer',
};

type Toggle = 'tax_reminders' | 'invoice_reminders' | 'lead_reminders' | 'stock_alerts' | 'advisor_digest';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [FormsModule, IconComponent, AgoPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Notifications</h1>
          <p class="sub">Reminders and alerts about your business.</p>
        </div>
        @if (unread() > 0) {
          <button class="btn ghost" (click)="markAll()"><app-icon name="check" [size]="16" /> Mark all read</button>
        }
      </div>

      <div class="split">
        <div class="card flush">
          @for (n of notifications(); track n.id) {
            <button class="n-row" [class.unread]="!n.read" (click)="open(n)">
              <span class="n-ico"><app-icon [name]="icon(n.kind)" [size]="17" /></span>
              <span style="flex:1;min-width:0">
                <b>{{ n.title }}</b>
                <small>{{ n.body }}</small>
              </span>
              <span class="when">{{ n.created_at | ago }}</span>
            </button>
          } @empty {
            <div class="empty"><app-icon name="bell" [size]="28" [stroke]="1.5" /><p>No notifications yet</p></div>
          }
        </div>

        @if (settings(); as s) {
          <div class="card">
            <h2>Preferences</h2>
            <p class="eyebrow" style="margin-top:16px">Channels</p>
            <label class="switch">In-app <input type="checkbox" [(ngModel)]="s.channels.in_app" (ngModelChange)="save()" /></label>
            <label class="switch">Email <input type="checkbox" [(ngModel)]="s.channels.email" (ngModelChange)="save()" /></label>
            <label class="switch">SMS <span class="badge slate">soon</span><span class="spacer"></span><input type="checkbox" disabled [checked]="s.channels.sms" /></label>
            <label class="switch">WhatsApp <span class="badge slate">soon</span><span class="spacer"></span><input type="checkbox" disabled [checked]="s.channels.whatsapp" /></label>

            <p class="eyebrow" style="margin-top:16px">Remind me about</p>
            @for (t of toggles; track t.key) {
              <label class="switch">{{ t.label }} <input type="checkbox" [(ngModel)]="s[t.key]" (ngModelChange)="save()" /></label>
            }

            <p class="eyebrow" style="margin-top:16px">Quiet hours</p>
            <div class="form-row">
              <div>
                <label class="field" for="qs">From</label>
                <input id="qs" type="time" [(ngModel)]="s.quiet_start" (change)="save()" />
              </div>
              <div>
                <label class="field" for="qe">Until</label>
                <input id="qe" type="time" [(ngModel)]="s.quiet_end" (change)="save()" />
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .n-row {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        width: 100%;
        text-align: left;
        padding: 14px 20px;
        border: none;
        border-bottom: 1px solid var(--border);
        background: none;
        color: var(--text);
        font: inherit;
        cursor: pointer;
      }
      .n-row:last-child {
        border-bottom: none;
      }
      .n-row:hover {
        background: var(--surface-hover);
      }
      .n-row b {
        display: block;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .n-row small {
        display: block;
        color: var(--text-2);
        font-size: 0.84rem;
      }
      .n-row.unread {
        background: color-mix(in srgb, var(--primary-soft) 45%, transparent);
      }
      .n-ico {
        width: 36px;
        height: 36px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        background: var(--surface-hover);
        color: var(--text-2);
        flex: none;
      }
      .unread .n-ico {
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .when {
        font-size: 0.75rem;
        color: var(--text-3);
        white-space: nowrap;
      }
      .switch {
        border-bottom: 1px solid var(--border);
      }
      .switch .spacer {
        flex: 1;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit {
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly toggles: { key: Toggle; label: string }[] = [
    { key: 'tax_reminders', label: 'Tax deadlines' },
    { key: 'invoice_reminders', label: 'Overdue invoices' },
    { key: 'lead_reminders', label: 'Lead follow-ups' },
    { key: 'stock_alerts', label: 'Low stock' },
    { key: 'advisor_digest', label: 'Advisor digest' },
  ];

  notifications = signal<AppNotification[]>([]);
  settings = signal<NotificationSettings | null>(null);
  unread = computed(() => this.notifications().filter((n) => !n.read).length);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  icon(kind: string): string {
    return KIND_ICON[kind] ?? 'bell';
  }

  async load(): Promise<void> {
    try {
      const [list, s] = await Promise.all([
        api.get('/notifications/'),
        api.get<NotificationSettings>('/notifications/settings/').catch(() => null),
      ]);
      this.notifications.set(asList<AppNotification>(list));
      if (s) this.settings.set(s);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load notifications');
    }
  }

  private async markRead(n: AppNotification): Promise<void> {
    if (n.read) return;
    await api.post(`/notifications/${n.id}/read/`);
    this.notifications.update((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  async open(n: AppNotification): Promise<void> {
    try {
      await this.markRead(n);
    } catch {
      /* still navigate */
    }
    if (n.link) this.router.navigateByUrl(n.link);
  }

  async markAll(): Promise<void> {
    try {
      await Promise.all(this.notifications().map((n) => this.markRead(n)));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed');
    }
  }

  /** debounce so toggling several switches sends one request */
  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await api.post('/notifications/settings/', this.settings());
        this.toast.success('Preferences saved');
      } catch (e: any) {
        this.toast.error(e?.message || 'Save failed');
      }
    }, 500);
  }
}
