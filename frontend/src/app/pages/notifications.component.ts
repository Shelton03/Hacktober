import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { api } from '../core/api';
import type { AppNotification, NotificationSettings } from '../core/models';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Notifications</h1>
          <p class="sub">Reminders and alerts — in-app and email</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="grid cols-2">
        <div>
          <h2>Recent</h2>
          <div class="table-wrap">
            <table class="list">
              <thead><tr><th>Title</th><th>Body</th><th>When</th><th></th></tr></thead>
              <tbody>
                @for (n of notifications(); track n.id) {
                  <tr [class.unread-row]="!n.read">
                    <td><b>{{ n.title }}</b></td>
                    <td>{{ n.body }}</td>
                    <td>{{ n.created_at | date: 'd MMM, HH:mm' }}</td>
                    <td>
                      @if (!n.read) {
                        <button class="btn ghost small" (click)="markRead(n)">Mark read</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="empty">Nothing yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Settings</h2>
          <label class="checkbox">
            <input type="checkbox" [(ngModel)]="settings().channels.email" name="chEmail"
              (ngModelChange)="save()" />
            Email notifications
          </label>
          <label class="checkbox" style="margin-top:6px">
            <input type="checkbox" [(ngModel)]="settings().channels.in_app" name="chApp"
              (ngModelChange)="save()" />
            In-app notifications
          </label>
          <label class="checkbox" style="margin-top:6px">
            <input type="checkbox" [(ngModel)]="settings().tax_reminders" name="chTax"
              (ngModelChange)="save()" />
            Tax reminders
          </label>
          <div class="form-row" style="margin-top:10px">
            <div>
              <label class="field">Quiet hours start</label>
              <input type="time" [(ngModel)]="settings().quiet_hours.start" name="qs"
                (ngModelChange)="save()" />
            </div>
            <div>
              <label class="field">Quiet hours end</label>
              <input type="time" [(ngModel)]="settings().quiet_hours.end" name="qe"
                (ngModelChange)="save()" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .unread-row td:first-child {
        border-left: 3px solid #0f766e;
      }
    `,
  ],
})
export class NotificationsComponent {
  notifications = signal<AppNotification[]>([]);
  settings = signal<NotificationSettings>({
    channels: { email: true, in_app: true },
    quiet_hours: { start: '21:00', end: '07:00' },
    tax_reminders: true,
  });
  error = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [list, s] = await Promise.all([
        api.get<AppNotification[]>('/notifications/'),
        api.get<NotificationSettings>('/notifications/settings/').catch(() => null),
      ]);
      this.notifications.set(Array.isArray(list) ? list : (list as any).results ?? []);
      if (s) this.settings.set({ ...this.settings(), ...s });
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load notifications');
    }
  }

  async markRead(n: AppNotification): Promise<void> {
    try {
      await api.post(`/notifications/${n.id}/read/`);
      n.read = true;
      this.notifications.set([...this.notifications()]);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed');
    }
  }

  async save(): Promise<void> {
    try {
      await api.post('/notifications/settings/', this.settings());
    } catch (e: any) {
      this.error.set(e?.message || 'Save failed');
    }
  }
}
