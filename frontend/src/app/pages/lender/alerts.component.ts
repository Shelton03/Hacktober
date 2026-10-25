import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { api, asList } from '../../core/api';
import type { FraudAlert } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { AgoPipe, LabelPipe, severityClass, severityIcon } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';

type Sev = 'all' | FraudAlert['severity'];

@Component({
  selector: 'app-lender-alerts',
  standalone: true,
  imports: [RouterLink, IconComponent, AgoPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Risk monitoring</p>
          <h1>Fraud alerts</h1>
          <p class="sub">Suspicious patterns detected across the portfolio.</p>
        </div>
        <div class="seg">
          <button [class.active]="sev() === 'all'" (click)="sev.set('all')">All <span class="count">{{ alerts().length }}</span></button>
          <button [class.active]="sev() === 'critical'" (click)="sev.set('critical')">Critical <span class="count">{{ count('critical') }}</span></button>
          <button [class.active]="sev() === 'warning'" (click)="sev.set('warning')">Warning <span class="count">{{ count('warning') }}</span></button>
          <button [class.active]="sev() === 'info'" (click)="sev.set('info')">Info <span class="count">{{ count('info') }}</span></button>
        </div>
      </div>

      <div class="stack">
        @for (a of shown(); track a.id) {
          <div class="card alert-card sev" [class]="'sev-' + a.severity">
            <span class="a-ico" [class]="sevClass(a.severity)"><app-icon [name]="sevIcon(a.severity)" [size]="18" /></span>
            <div style="flex:1;min-width:0">
              <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:4px">
                <h3>{{ a.kind | label }}</h3>
                <span class="badge" [class]="sevClass(a.severity)">{{ a.severity }}</span>
                <span class="spacer"></span>
                <span class="muted">{{ a.detected_at | ago }}</span>
              </div>
              <a class="sme" [routerLink]="['/lender', 'smes', a.sme.id]">{{ a.sme.name }} <app-icon name="arrow-right" [size]="13" /></a>
              <p class="text-2" style="font-size:0.9rem">{{ a.explanation }}</p>
              <div class="next"><app-icon name="zap" [size]="14" /> <span><b>Next step:</b> {{ a.suggested_action }}</span></div>
            </div>
          </div>
        } @empty {
          <div class="card empty">{{ loading() ? 'Loading alerts…' : 'No alerts. All clear' }}</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .alert-card {
        display: flex;
        gap: 14px;
      }
      .a-ico {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        flex: none;
      }
      .a-ico.red {
        background: var(--danger-soft);
        color: var(--danger-ink);
      }
      .a-ico.amber {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .a-ico.teal {
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .sme {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.82rem;
        font-weight: 600;
      }
      .next {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        font-size: 0.85rem;
      }
      .next app-icon {
        color: var(--primary);
        margin-top: 2px;
      }
    `,
  ],
})
export class LenderAlertsComponent implements OnInit {
  private toast = inject(ToastService);
  alerts = signal<FraudAlert[]>([]);
  loading = signal(true);
  sev = signal<Sev>('all');

  shown = computed(() => this.alerts().filter((a) => this.sev() === 'all' || a.severity === this.sev()));
  sevClass = severityClass;
  sevIcon = severityIcon;

  ngOnInit(): void {
    this.load();
  }

  count(s: string): number {
    return this.alerts().filter((a) => a.severity === s).length;
  }

  async load(): Promise<void> {
    try {
      this.alerts.set(asList<FraudAlert>(await api.get('/lender/alerts/'), 'alerts'));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load alerts');
    } finally {
      this.loading.set(false);
    }
  }
}
