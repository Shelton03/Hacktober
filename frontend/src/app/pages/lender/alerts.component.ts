import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../../core/api';
import type { FraudAlert } from '../../core/models';

@Component({
  selector: 'app-lender-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="demo-banner">DEMO — sample data</div>
      <div class="page-head">
        <div>
          <h1>Fraud alerts</h1>
          <p class="sub">Feed of suspicious patterns across the portfolio</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @for (a of alerts(); track a.id) {
        <div class="card" [class]="'sev-' + a.severity" style="margin-bottom:10px">
          <h3>
            {{ a.title || 'Alert #' + a.id }}
            <span class="badge" [class]="badgeClass(a.severity)">{{ a.severity }}</span>
          </h3>
          <p>{{ a.explanation }}</p>
          <p class="muted"><b>Action:</b> {{ a.suggested_action }}</p>
        </div>
      } @empty {
        <div class="card"><div class="empty">No fraud alerts — all clear</div></div>
      }
    </div>
  `,
  styles: [
    `
      .demo-banner {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 8px 12px;
        font-weight: 700;
        font-size: 0.85rem;
        margin-bottom: 12px;
        text-align: center;
      }
      .sev-critical {
        border-left: 4px solid #dc2626;
      }
      .sev-warning {
        border-left: 4px solid #f59e0b;
      }
      .sev-info {
        border-left: 4px solid #0f766e;
      }
    `,
  ],
})
export class LenderAlertsComponent {
  alerts = signal<FraudAlert[]>([]);
  error = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<FraudAlert[]>('/lender/alerts/');
      this.alerts.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load alerts');
    }
  }

  badgeClass(sev: string): string {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'amber';
    return 'teal';
  }
}
