import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { api, asList } from '../core/api';
import type { AdvisorInsight } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { AgoPipe, severityClass, severityIcon } from '../shared/format';
import { ToastService } from '../shared/toast.service';

type Sev = 'all' | 'critical' | 'warning' | 'info';
const ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

@Component({
  selector: 'app-advisor',
  standalone: true,
  imports: [IconComponent, AgoPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>AI business advisor</h1>
          <p class="sub">Every number comes from your own books. Plain-language advice, one action at a time.</p>
        </div>
        <button class="btn ghost" (click)="refresh()" [disabled]="busy()">
          <app-icon name="refresh" [size]="16" /> {{ busy() ? 'Analysing…' : 'Re-analyse my books' }}
        </button>
      </div>

      <div class="hero card">
        <span class="hero-ico"><app-icon name="sparkles" [size]="22" /></span>
        <div>
          <h2>{{ headline() }}</h2>
          <p class="text-2" style="margin:4px 0 0;font-size:0.88rem">
            {{ counts().critical }} urgent · {{ counts().warning }} worth a look · {{ counts().info }} tips
          </p>
        </div>
      </div>

      <div class="toolbar" style="margin-top:18px">
        <div class="seg">
          <button [class.active]="sev() === 'all'" (click)="sev.set('all')">All <span class="count">{{ active().length }}</span></button>
          <button [class.active]="sev() === 'critical'" (click)="sev.set('critical')">Urgent <span class="count">{{ counts().critical }}</span></button>
          <button [class.active]="sev() === 'warning'" (click)="sev.set('warning')">Warnings <span class="count">{{ counts().warning }}</span></button>
          <button [class.active]="sev() === 'info'" (click)="sev.set('info')">Tips <span class="count">{{ counts().info }}</span></button>
        </div>
      </div>

      @if (loading()) {
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton" style="height:120px;margin-bottom:12px;border-radius:12px"></div>
        }
      }
      <div class="stack">
        @for (i of shown(); track i.id) {
          <article class="card insight sev" [class]="'sev-' + i.severity" [class.done]="i.status === 'done'">
            <span class="i-ico" [class]="sevClass(i.severity)"><app-icon [name]="sevIcon(i.severity)" [size]="18" /></span>
            <div class="i-body">
              <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:4px">
                <h3>{{ i.title }}</h3>
                @if (i.llm_phrased) {
                  <span class="badge teal" title="Phrased by Gemma from rule-based numbers"><app-icon name="sparkles" [size]="11" /> AI-phrased</span>
                }
                @if (i.status === 'done') {
                  <span class="badge green"><app-icon name="check" [size]="11" /> Done</span>
                }
              </div>
              <p class="text-2" style="font-size:0.9rem">{{ i.explanation }}</p>
              @if (i.recommended_action) {
                <div class="action"><app-icon name="arrow-right" [size]="15" /> <span><b>Do this:</b> {{ i.recommended_action }}</span></div>
              }
              <div class="i-foot">
                <span class="muted">{{ i.created_at | ago }}</span>
                @if (i.status === 'active') {
                  <div class="row-actions">
                    <button class="btn plain small" (click)="dismiss(i)">Dismiss</button>
                    <button class="btn soft small" (click)="done(i)"><app-icon name="check" [size]="14" /> Mark done</button>
                  </div>
                }
              </div>
            </div>
          </article>
        } @empty {
          @if (!loading()) {
            <div class="card empty">
              <app-icon name="check-circle" [size]="30" [stroke]="1.5" />
              <p>Nothing here. Your business looks healthy.</p>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      .hero {
        display: flex;
        gap: 16px;
        align-items: center;
        background: var(--surface);
      }
      .hero-ico {
        width: 46px;
        height: 46px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: var(--brand);
        color: #ffffff;
        flex: none;
      }
      .insight {
        display: flex;
        gap: 14px;
      }
      .insight.done {
        opacity: 0.65;
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
      .i-body {
        flex: 1;
        min-width: 0;
      }
      .action {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        font-size: 0.86rem;
      }
      .action app-icon {
        color: var(--primary);
        margin-top: 2px;
      }
      .i-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
      }
    `,
  ],
})
export class AdvisorComponent implements OnInit {
  private toast = inject(ToastService);
  insights = signal<AdvisorInsight[]>([]);
  loading = signal(true);
  busy = signal(false);
  sev = signal<Sev>('all');

  active = computed(() => this.insights().filter((i) => i.status !== 'dismissed'));
  counts = computed(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const i of this.active()) if (i.status === 'active') c[i.severity]++;
    return c;
  });
  shown = computed(() =>
    this.active()
      .filter((i) => this.sev() === 'all' || i.severity === this.sev())
      .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || ORDER[a.severity] - ORDER[b.severity])
  );
  headline = computed(() => {
    const c = this.counts();
    if (c.critical) return `${c.critical} thing(s) need your attention today`;
    if (c.warning) return 'A few things are worth a look this week';
    return 'Your business is in good shape';
  });

  sevClass = severityClass;
  sevIcon = severityIcon;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      this.insights.set(asList<AdvisorInsight>(await api.get('/advisor/insights/')));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load insights');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/advisor/refresh/');
      await this.load();
      this.toast.success('Insights refreshed from your latest numbers');
    } catch (e: any) {
      this.toast.error(e?.message || 'Refresh failed');
    } finally {
      this.busy.set(false);
    }
  }

  async done(i: AdvisorInsight): Promise<void> {
    try {
      await api.post(`/advisor/insights/${i.id}/done/`);
      this.insights.update((l) => l.map((x) => (x.id === i.id ? { ...x, status: 'done' } : x)));
    } catch (e: any) {
      this.toast.error(e?.message || 'Update failed');
    }
  }

  async dismiss(i: AdvisorInsight): Promise<void> {
    try {
      await api.post(`/advisor/insights/${i.id}/dismiss/`);
      this.insights.update((l) => l.filter((x) => x.id !== i.id));
    } catch (e: any) {
      this.toast.error(e?.message || 'Dismiss failed');
    }
  }
}
