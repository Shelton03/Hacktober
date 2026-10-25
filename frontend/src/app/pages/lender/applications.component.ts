import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { api, asList } from '../../core/api';
import type { LenderApplication, LenderDecision } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';

const DECISION: Record<LenderDecision, { label: string; cls: string; icon: string }> = {
  recommend: { label: 'Recommend', cls: 'green', icon: 'check-circle' },
  review: { label: 'Review', cls: 'amber', icon: 'eye' },
  decline: { label: 'Decline', cls: 'red', icon: 'x' },
};

@Component({
  selector: 'app-lender-applications',
  standalone: true,
  imports: [DatePipe, RouterLink, IconComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Decision queue</p>
          <h1>Loan applications</h1>
          <p class="sub">Model suggestions with explainable reasons. Decisions here are a demo and are not saved.</p>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:18px">
        <div class="card stat">
          <p class="stat-label">In queue</p>
          <p class="stat-value">{{ apps().length }}</p>
          <p class="stat-sub">{{ requested() | money: 'USD' : 0 }} requested</p>
        </div>
        @for (k of keys; track k) {
          <div class="card stat">
            <p class="stat-label">Suggested: {{ meta[k].label }}</p>
            <p class="stat-value">{{ suggestedCount(k) }}</p>
          </div>
        }
      </div>

      <div class="stack">
        @for (a of apps(); track a.id) {
          <div class="card app">
            <div class="app-main">
              <div class="row" style="gap:10px;flex-wrap:wrap">
                <span class="band-chip" [class]="'band-chip risk-' + a.sme.risk_band">{{ a.sme.risk_band }}</span>
                <a class="cell-main" [routerLink]="['/lender', 'smes', a.sme.id]">{{ a.sme.name }}</a>
                <span class="muted mono">{{ a.sme.ref_id }}</span>
                <span class="spacer"></span>
                <span class="muted">{{ a.submitted_at | date: 'd MMM, HH:mm' }}</span>
              </div>
              <div class="row" style="gap:16px;margin-top:10px;flex-wrap:wrap">
                <span class="amount">{{ a.amount | money: a.currency }}</span>
                <span class="text-2">{{ a.purpose }}</span>
              </div>
              <div class="reasons">
                <span class="badge" [class]="meta[a.suggested].cls"><app-icon [name]="meta[a.suggested].icon" [size]="12" /> Model suggests {{ meta[a.suggested].label.toLowerCase() }}</span>
                @for (r of a.reasons; track $index) {
                  <span class="reason">{{ r }}</span>
                }
              </div>
            </div>
            <div class="app-actions">
              @if (decided()[a.id]; as d) {
                <span class="badge dot" [class]="meta[d].cls">{{ meta[d].label }}d</span>
                <button class="btn plain small" (click)="undo(a.id)">Undo</button>
              } @else {
                <button class="btn small" (click)="decide(a, 'recommend')">Recommend</button>
                <button class="btn ghost small" (click)="decide(a, 'review')">Review</button>
                <button class="btn danger-ghost small" (click)="decide(a, 'decline')">Decline</button>
              }
            </div>
          </div>
        } @empty {
          <div class="card empty">{{ loading() ? 'Loading queue…' : 'Queue is empty' }}</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .app {
        display: flex;
        gap: 18px;
        align-items: center;
        flex-wrap: wrap;
      }
      .app-main {
        flex: 1;
        min-width: 280px;
      }
      .app-actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .amount {
        font-size: 1.15rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
      }
      .reason {
        font-size: 0.76rem;
        padding: 3px 9px;
        border-radius: 99px;
        border: 1px solid var(--border-strong);
        color: var(--text-2);
      }
      .band-chip {
        display: inline-grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        font-weight: 800;
        font-size: 0.74rem;
      }
    `,
  ],
})
export class LenderApplicationsComponent implements OnInit {
  private toast = inject(ToastService);
  readonly meta = DECISION;
  readonly keys: LenderDecision[] = ['recommend', 'review', 'decline'];

  apps = signal<LenderApplication[]>([]);
  loading = signal(true);
  /** demo only: decisions live in the page, never sent to a server */
  decided = signal<Record<number, LenderDecision>>({});

  requested = computed(() => this.apps().reduce((s, a) => s + Number(a.amount), 0));

  ngOnInit(): void {
    this.load();
  }

  suggestedCount(k: LenderDecision): number {
    return this.apps().filter((a) => a.suggested === k).length;
  }

  async load(): Promise<void> {
    try {
      this.apps.set(asList<LenderApplication>(await api.get('/lender/applications/'), 'applications'));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load applications');
    } finally {
      this.loading.set(false);
    }
  }

  decide(a: LenderApplication, d: LenderDecision): void {
    this.decided.update((m) => ({ ...m, [a.id]: d }));
    this.toast.info(`${a.sme.name}: ${DECISION[d].label.toLowerCase()} (demo, not saved)`);
  }

  undo(id: number): void {
    this.decided.update((m) => {
      const { [id]: _, ...rest } = m;
      return rest;
    });
  }
}
