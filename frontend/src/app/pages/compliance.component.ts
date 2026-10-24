import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { api } from '../core/api';
import type { ComplianceResponse } from '../core/models';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Tax &amp; Compliance</h1>
          <p class="sub">Score, open issues and suggested fixes</p>
        </div>
        <div class="row-actions">
          <button class="btn ghost" (click)="exportCsv()">Export CSV</button>
          <button class="btn ghost" (click)="exportPdf()">Export PDF</button>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="grid cols-2">
        <div class="card" style="text-align:center">
          <p class="stat-label">Compliance score</p>
          <p class="score-ring" [class]="scoreClass">{{ data()?.score ?? '—' }}</p>
          <p class="stat-sub">{{ issues().length }} open issue(s)</p>
        </div>
        <div class="card">
          <h3>Next steps</h3>
          <p class="muted">
            Fix issues below to raise your score. See also
            <a routerLink="/tax">Tax summaries</a>.
          </p>
        </div>
      </div>

      <h2 style="margin-top:16px">Issues</h2>
      @for (i of issues(); track i.id) {
        <div class="card issue" [class]="'sev-' + i.severity">
          <div class="page-head">
            <h3>
              {{ i.title }}
              <span class="badge" [class]="badgeClass(i.severity)">{{ i.severity }}</span>
            </h3>
            <button class="btn ghost small" (click)="dismiss(i)">Dismiss</button>
          </div>
          <p class="muted"><b>Fix:</b> {{ i.suggested_fix }}</p>
        </div>
      } @empty {
        <div class="card"><div class="empty">No open compliance issues 🎉</div></div>
      }
    </div>
  `,
  styles: [
    `
      .issue {
        margin-bottom: 10px;
      }
      .issue.sev-critical {
        border-left: 4px solid #dc2626;
      }
      .issue.sev-warning {
        border-left: 4px solid #f59e0b;
      }
      .issue.sev-info {
        border-left: 4px solid #0f766e;
      }
    `,
  ],
})
export class ComplianceComponent {
  data = signal<ComplianceResponse | null>(null);
  error = signal('');

  issues = signal(this.data()?.issues ?? []);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<ComplianceResponse>('/compliance/');
      this.data.set(res);
      this.issues.set(res.issues ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load compliance');
    }
  }

  get scoreClass(): string {
    const s = this.data()?.score ?? 0;
    if (s >= 80) return 'score-good';
    if (s >= 50) return 'score-mid';
    return 'score-bad';
  }

  badgeClass(sev: string): string {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'amber';
    return 'teal';
  }

  async dismiss(issue: any): Promise<void> {
    try {
      await api.post(`/compliance/${issue.id}/dismiss/`);
      this.issues.set(this.issues().filter((i) => i.id !== issue.id));
    } catch (e: any) {
      this.error.set(e?.message || 'Dismiss failed');
    }
  }

  exportCsv(): void {
    api.download('/compliance/export/?format=csv');
  }

  exportPdf(): void {
    api.download('/compliance/export/?format=pdf');
  }
}
