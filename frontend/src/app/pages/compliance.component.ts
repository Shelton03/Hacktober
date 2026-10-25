import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { api } from '../core/api';
import type { ComplianceIssue, ComplianceResponse } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ScoreRingComponent } from '../shared/score-ring.component';
import { severityClass, severityIcon, today } from '../shared/format';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, ScoreRingComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Compliance</h1>
          <p class="sub">We scan your books for anything ZIMRA would flag, and tell you how to fix it.</p>
        </div>
        <div class="page-actions">
          <input type="month" [(ngModel)]="period" style="width:auto" aria-label="Export period" />
          <button class="btn ghost" (click)="exportAs('csv')"><app-icon name="download" [size]="16" /> CSV</button>
          <button class="btn ghost" (click)="exportAs('pdf')"><app-icon name="download" [size]="16" /> PDF</button>
        </div>
      </div>

      <div class="card overview">
        <app-score-ring [score]="data()?.score" [size]="140" label="of 100" />
        <div class="ov-text">
          <h2>{{ verdict() }}</h2>
          <p class="text-2" style="font-size:0.9rem">
            Each open issue lowers your score: urgent −10, warning −5, info −2. A high score also improves your
            <a routerLink="/loan">loan readiness</a>.
          </p>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
            <span class="badge red dot">{{ count('critical') }} urgent</span>
            <span class="badge amber dot">{{ count('warning') }} warnings</span>
            <span class="badge teal dot">{{ count('info') }} info</span>
          </div>
        </div>
      </div>

      <div class="section-title"><h2>Open issues</h2></div>
      <div class="stack">
        @for (i of issues(); track i.id) {
          <div class="card issue sev" [class]="'sev-' + i.severity">
            <span class="i-ico" [class]="sevClass(i.severity)"><app-icon [name]="sevIcon(i.severity)" [size]="18" /></span>
            <div style="flex:1;min-width:0">
              <h3>{{ i.title }}</h3>
              <p class="fix"><app-icon name="zap" [size]="14" /> {{ i.suggested_fix }}</p>
            </div>
            <button class="btn plain small" (click)="dismiss(i)">Dismiss</button>
          </div>
        } @empty {
          <div class="card empty">
            <app-icon name="check-circle" [size]="30" [stroke]="1.5" />
            <p>{{ loaded() ? 'No open compliance issues. Well done.' : 'Scanning your books…' }}</p>
          </div>
        }
      </div>

      @if (data()?.disclaimer) {
        <p class="muted" style="margin-top:18px">{{ data()?.disclaimer }}</p>
      }
    </div>
  `,
  styles: [
    `
      .overview {
        display: flex;
        gap: 28px;
        align-items: center;
        flex-wrap: wrap;
      }
      .ov-text {
        flex: 1;
        min-width: 240px;
      }
      .issue {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
      .i-ico {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        flex: none;
      }
      .i-ico.red {
        background: var(--danger-soft);
        color: var(--danger-ink);
      }
      .i-ico.amber {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .i-ico.teal {
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .fix {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        font-size: 0.86rem;
        color: var(--text-2);
        margin-top: 6px;
      }
      .fix app-icon {
        color: var(--accent);
        margin-top: 3px;
      }
    `,
  ],
})
export class ComplianceComponent implements OnInit {
  private toast = inject(ToastService);
  data = signal<ComplianceResponse | null>(null);
  issues = signal<ComplianceIssue[]>([]);
  loaded = signal(false);
  period = today().slice(0, 7);

  verdict = computed(() => {
    const s = this.data()?.score;
    if (s === undefined || s === null) return 'Checking your compliance…';
    if (s >= 80) return 'You are in good standing';
    if (s >= 50) return 'A few issues to tidy up';
    return 'Action needed before your next return';
  });

  sevClass = severityClass;
  sevIcon = severityIcon;

  ngOnInit(): void {
    this.load();
  }

  count(sev: string): number {
    return this.issues().filter((i) => i.severity === sev).length;
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<ComplianceResponse>('/compliance/');
      this.data.set(res);
      this.issues.set(res.issues ?? []);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load compliance');
    } finally {
      this.loaded.set(true);
    }
  }

  async dismiss(issue: ComplianceIssue): Promise<void> {
    try {
      await api.post(`/compliance/${issue.id}/dismiss/`);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Dismiss failed');
    }
  }

  exportAs(format: 'csv' | 'pdf'): void {
    api.download(`/compliance/export/?period=${this.period}&format=${format}`);
  }
}
