import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { api } from '../core/api';
import type { AdvisorInsight } from '../core/models';

@Component({
  selector: 'app-advisor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>AI business advisor</h1>
          <p class="sub">Rule-based insights from your ledger — with recommended actions</p>
        </div>
        <button class="btn ghost" (click)="refresh()" [disabled]="busy()">
          {{ busy() ? 'Recomputing…' : 'Refresh insights' }}
        </button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @for (i of insights(); track i.id) {
        <div class="card insight" [class]="'sev-' + i.severity">
          <div class="page-head">
            <h3>
              {{ i.title }}
              <span class="badge" [class]="badgeClass(i.severity)">{{ i.severity }}</span>
              <span class="badge slate" style="margin-left:6px">{{ i.status }}</span>
            </h3>
            <div class="row-actions">
              @if (i.status === 'active') {
                <button class="btn small" (click)="done(i)">Mark done</button>
                <button class="btn ghost small" (click)="dismiss(i)">Dismiss</button>
              }
            </div>
          </div>
          <p>{{ i.llm_phrased || i.explanation }}</p>
          @if (i.recommended_action) {
            <p class="muted"><b>Recommended:</b> {{ i.recommended_action }}</p>
          }
        </div>
      } @empty {
        <div class="card"><div class="empty">No active insights — your business looks healthy 🎉</div></div>
      }
    </div>
  `,
  styles: [
    `
      .insight {
        margin-bottom: 12px;
      }
      .insight.sev-critical {
        border-left: 4px solid #dc2626;
      }
      .insight.sev-warning {
        border-left: 4px solid #f59e0b;
      }
      .insight.sev-info {
        border-left: 4px solid #0f766e;
      }
    `,
  ],
})
export class AdvisorComponent {
  insights = signal<AdvisorInsight[]>([]);
  error = signal('');
  busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<AdvisorInsight[]>('/advisor/insights/');
      this.insights.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load insights');
    }
  }

  badgeClass(sev: string): string {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'amber';
    return 'teal';
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/advisor/refresh/');
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Refresh failed');
    } finally {
      this.busy.set(false);
    }
  }

  async done(i: AdvisorInsight): Promise<void> {
    try {
      await api.post(`/advisor/insights/${i.id}/done/`);
      i.status = 'done';
      this.insights.set([...this.insights()]);
    } catch (e: any) {
      this.error.set(e?.message || 'Update failed');
    }
  }

  async dismiss(i: AdvisorInsight): Promise<void> {
    try {
      await api.post(`/advisor/insights/${i.id}/dismiss/`);
      this.insights.set(this.insights().filter((x) => x.id !== i.id));
    } catch (e: any) {
      this.error.set(e?.message || 'Dismiss failed');
    }
  }
}
