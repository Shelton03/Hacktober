import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { api } from '../core/api';
import type { Dashboard } from '../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p class="sub">Business health at a glance</p>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }
      @if (loading()) {
        <div class="empty">Loading…</div>
      } @else if (d(); as d) {
        <div class="grid cols-4">
          <div class="card">
            <p class="stat-label">Today's sales</p>
            <p class="stat-value">{{ d.today_sales }}</p>
          </div>
          <div class="card">
            <p class="stat-label">Month profit</p>
            <p class="stat-value">{{ d.month_profit }}</p>
          </div>
          <div class="card">
            <p class="stat-label">Cash position</p>
            <p class="stat-value">{{ d.cash_position }}</p>
          </div>
          <div class="card">
            <p class="stat-label">Receivables</p>
            <p class="stat-value">{{ d.receivables }}</p>
          </div>
          <div class="card">
            <p class="stat-label">Next tax due</p>
            @if (d.next_tax; as nt) {
              <p class="stat-value">{{ nt.amount }}</p>
              <p class="stat-sub">{{ nt.type }} · due {{ nt.due_date }}</p>
            } @else {
              <p class="stat-value">—</p>
              <p class="stat-sub">Nothing scheduled</p>
            }
          </div>
          <div class="card">
            <p class="stat-label">Compliance score</p>
            <p class="stat-value" [class]="scoreClass(d.compliance_score)">{{ d.compliance_score }}</p>
            <p class="stat-sub"><a routerLink="/compliance">View issues →</a></p>
          </div>
          <div class="card">
            <p class="stat-label">Open leads</p>
            <p class="stat-value">{{ d.open_leads }}</p>
            <p class="stat-sub"><a routerLink="/leads">Go to pipeline →</a></p>
          </div>
        </div>

        <h2 style="margin-top:18px">AI business advisor — top insights</h2>
        <div class="grid cols-2">
          @for (i of d.top_insights; track i.id) {
            <div class="card insight" [class]="'sev-' + i.severity">
              <h3>
                {{ i.title }}
                <span class="badge" [class]="badgeClass(i.severity)">{{ i.severity }}</span>
              </h3>
              <p>{{ i.llm_phrased || i.explanation }}</p>
              @if (i.recommended_action) {
                <p class="muted"><b>Do:</b> {{ i.recommended_action }}</p>
              }
            </div>
          } @empty {
            <div class="card"><div class="empty">No insights yet</div></div>
          }
        </div>
        <p style="margin-top:10px"><a routerLink="/advisor">All advisor insights →</a></p>
      }
    </div>
  `,
  styles: [
    `
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
export class DashboardComponent {
  d = signal<Dashboard | null>(null);
  loading = signal(true);
  error = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.d.set(await api.get<Dashboard>('/dashboard/'));
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-mid';
    return 'score-bad';
  }

  badgeClass(sev: string): string {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'amber';
    return 'teal';
  }
}
