import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../../core/api';
import type { LenderApplication } from '../../core/models';

@Component({
  selector: 'app-lender-applications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="demo-banner">DEMO — sample data</div>
      <div class="page-head">
        <div>
          <h1>Applications queue</h1>
          <p class="sub">Recommend, review or decline with reasons</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="table-wrap">
        <table class="list">
          <thead>
            <tr><th>SME</th><th class="num">Amount</th><th>Status</th><th>Reasons</th><th>Actions</th></tr>
          </thead>
          <tbody>
            @for (a of applications(); track a.id) {
              <tr>
                <td><b>{{ a.sme }}</b></td>
                <td class="num">{{ a.amount }}</td>
                <td>
                  <span class="badge" [class]="statusClass(a.status)">{{ a.status }}</span>
                </td>
                <td>
                  @for (r of a.reasons ?? []; track $index) {
                    <span class="badge slate" style="margin-right:4px">{{ r }}</span>
                  }
                </td>
                <td>
                  <div class="row-actions">
                    <button class="btn small" (click)="decide(a, 'recommend')">Recommend</button>
                    <button class="btn ghost small" (click)="decide(a, 'review')">Review</button>
                    <button class="btn danger small" (click)="decide(a, 'decline')">Decline</button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">Queue is empty</td></tr>
            }
          </tbody>
        </table>
      </div>
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
    `,
  ],
})
export class LenderApplicationsComponent {
  applications = signal<LenderApplication[]>([]);
  error = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<LenderApplication[]>('/lender/applications/');
      this.applications.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load applications');
    }
  }

  statusClass(status: string): string {
    if (status === 'recommended' || status === 'approved') return 'green';
    if (status === 'declined') return 'red';
    if (status === 'in_review') return 'amber';
    return 'slate';
  }

  async decide(a: LenderApplication, action: string): Promise<void> {
    try {
      await api.post(`/lender/applications/${a.id}/${action}/`, {}).catch(async () => {
        await api.patch(`/lender/applications/${a.id}/`, { status: action });
      });
      a.status = action === 'recommend' ? 'recommended' : action === 'review' ? 'in_review' : 'declined';
      this.applications.set([...this.applications()]);
    } catch (e: any) {
      this.error.set(e?.message || 'Action failed');
    }
  }
}
