import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { api, asList } from '../../core/api';
import type { LenderSme, RiskBand } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { SparklineComponent } from '../../shared/sparkline.component';
import { LabelPipe, MoneyPipe } from '../../shared/format';
import { ToastService } from '../../shared/toast.service';

const BANDS: RiskBand[] = ['A', 'B', 'C', 'D', 'E'];
type SortKey = 'health' | 'name' | 'revenue';

@Component({
  selector: 'app-lender-portfolio',
  standalone: true,
  imports: [FormsModule, IconComponent, SparklineComponent, MoneyPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Portfolio overview</p>
          <h1>SME borrowers</h1>
          <p class="sub">FDMS-verified health scores across {{ smes().length }} sample businesses.</p>
        </div>
      </div>

      <div class="grid cols-4">
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Businesses</p><span class="stat-icon"><app-icon name="store" [size]="17" /></span></div>
          <p class="stat-value">{{ smes().length }}</p>
          <p class="stat-sub">{{ consented() }} with active consent</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Avg. health</p><span class="stat-icon green"><app-icon name="shield" [size]="17" /></span></div>
          <p class="stat-value">{{ avgHealth() }}</p>
          <p class="stat-sub">out of 100</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Monthly revenue</p><span class="stat-icon blue"><app-icon name="trending-up" [size]="17" /></span></div>
          <p class="stat-value">{{ totalRevenue() | money: 'USD' : 0 }}</p>
          <p class="stat-sub">Latest month, all SMEs</p>
        </div>
        <div class="card">
          <p class="stat-label" style="margin-bottom:10px">Risk band mix</p>
          <div class="bands">
            @for (b of bands; track b) {
              <button class="band" [class.active]="band() === b" (click)="band.set(band() === b ? '' : b)" [title]="'Filter band ' + b">
                <span class="band-bar" [style.height.%]="bandPct(b)" [class]="'band-bar risk-' + b"></span>
                <b>{{ b }}</b>
                <small>{{ bandCount(b) }}</small>
              </button>
            }
          </div>
        </div>
      </div>

      <div class="toolbar" style="margin-top:20px">
        <div class="input-icon">
          <app-icon name="search" [size]="16" />
          <input type="search" placeholder="Search name, sector or location…" [(ngModel)]="q" />
        </div>
        @if (band()) {
          <button class="badge amber" style="border:none;cursor:pointer" (click)="band.set('')">Band {{ band() }} <app-icon name="x" [size]="12" /></button>
        }
        <span class="spacer"></span>
        <div class="seg">
          <button [class.active]="sort() === 'health'" (click)="sort.set('health')">Health</button>
          <button [class.active]="sort() === 'revenue'" (click)="sort.set('revenue')">Revenue</button>
          <button [class.active]="sort() === 'name'" (click)="sort.set('name')">Name</button>
        </div>
      </div>

      <div class="card flush">
        <div class="table-wrap">
          <table class="list">
            <thead>
              <tr><th>SME</th><th>Sector</th><th>Location</th><th>12-month revenue</th><th class="num">Health</th><th>Band</th><th>Consent</th></tr>
            </thead>
            <tbody>
              @for (s of shown(); track s.id) {
                <tr class="clickable" (click)="open(s)">
                  <td>
                    <div class="cell-main">{{ s.name }}</div>
                    <div class="cell-sub mono">{{ s.ref_id }}</div>
                  </td>
                  <td>{{ s.sector | label }}</td>
                  <td class="text-2">{{ s.location }}</td>
                  <td>
                    <div class="row" style="gap:10px">
                      <app-sparkline [data]="s.revenue_trend" />
                      <span class="cell-sub">{{ last(s.revenue_trend) | money: 'USD' : 0 }}/mo</span>
                    </div>
                  </td>
                  <td class="num">
                    <div class="row" style="justify-content:flex-end;gap:8px">
                      <div class="bar" style="width:56px" [class]="'bar ' + tone(s.health_score)"><span [style.width.%]="s.health_score"></span></div>
                      <b>{{ s.health_score }}</b>
                    </div>
                  </td>
                  <td><span class="band-chip" [class]="'band-chip risk-' + s.risk_band">{{ s.risk_band }}</span></td>
                  <td><span class="badge dot" [class]="s.consent_status === 'granted' ? 'green' : 'slate'">{{ s.consent_status | label }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">{{ loading() ? 'Loading portfolio…' : 'No SMEs match' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .bands {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        height: 78px;
      }
      .band {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--text);
        font: inherit;
        border-radius: 8px;
        padding: 2px;
      }
      .band.active {
        background: var(--surface-hover);
      }
      .band-bar {
        width: 100%;
        min-height: 4px;
        border-radius: 4px 4px 2px 2px;
      }
      .band b {
        font-size: 0.75rem;
      }
      .band small {
        font-size: 0.66rem;
        color: var(--text-3);
      }
      .band-chip {
        display: inline-grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        font-weight: 800;
        font-size: 0.78rem;
      }
    `,
  ],
})
export class LenderPortfolioComponent implements OnInit {
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly bands = BANDS;

  smes = signal<LenderSme[]>([]);
  loading = signal(true);
  q = signal('');
  band = signal<RiskBand | ''>('');
  sort = signal<SortKey>('health');

  shown = computed(() => {
    const n = this.q().trim().toLowerCase();
    const list = this.smes().filter(
      (s) =>
        (!this.band() || s.risk_band === this.band()) &&
        (!n || [s.name, s.sector, s.location, s.ref_id].some((v) => (v ?? '').toLowerCase().includes(n)))
    );
    const key = this.sort();
    return [...list].sort((a, b) =>
      key === 'name'
        ? a.name.localeCompare(b.name)
        : key === 'revenue'
          ? this.last(b.revenue_trend) - this.last(a.revenue_trend)
          : b.health_score - a.health_score
    );
  });
  consented = computed(() => this.smes().filter((s) => s.consent_status === 'granted').length);
  avgHealth = computed(() => {
    const l = this.smes();
    return l.length ? Math.round(l.reduce((s, x) => s + x.health_score, 0) / l.length) : 0;
  });
  totalRevenue = computed(() => this.smes().reduce((s, x) => s + this.last(x.revenue_trend), 0));
  private maxBand = computed(() => Math.max(1, ...BANDS.map((b) => this.bandCount(b))));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      this.smes.set(asList<LenderSme>(await api.get('/lender/portfolio/'), 'smes'));
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load portfolio');
    } finally {
      this.loading.set(false);
    }
  }

  last(trend: number[]): number {
    return trend?.length ? trend[trend.length - 1] : 0;
  }

  bandCount(b: RiskBand): number {
    return this.smes().filter((s) => s.risk_band === b).length;
  }

  bandPct(b: RiskBand): number {
    return (this.bandCount(b) / this.maxBand()) * 100;
  }

  tone(score: number): string {
    return score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red';
  }

  open(s: LenderSme): void {
    this.router.navigate(['/lender', 'smes', s.id]);
  }
}
