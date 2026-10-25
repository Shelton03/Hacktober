import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { LoanConsent, LoanHealth } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { ScoreRingComponent } from '../shared/score-ring.component';
import { LabelPipe, localDate, scoreTone } from '../shared/format';
import { ToastService } from '../shared/toast.service';

const COMPONENTS: { key: keyof LoanHealth['components']; label: string; hint: string }[] = [
  { key: 'data_completeness', label: 'Data completeness', hint: 'Products, customers and expenses on record' },
  { key: 'fiscalisation_consistency', label: 'Fiscalisation', hint: 'Share of sales with a ZIMRA fiscal receipt' },
  { key: 'sales_stability', label: 'Sales stability', hint: 'How steady your takings are month to month' },
  { key: 'compliance', label: 'Compliance', hint: 'Open compliance issues lower this' },
];

const SCOPES = [
  { key: 'sales', label: 'Verified sales (fiscal receipts)' },
  { key: 'compliance', label: 'Compliance & tax history' },
  { key: 'identity', label: 'Business identity (name, TIN)' },
];

@Component({
  selector: 'app-loan',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, ScoreRingComponent, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Loan readiness</h1>
          <p class="sub">How your verified books look to a lender, and who you've chosen to share them with.</p>
        </div>
      </div>

      <div class="split">
        <div class="card health">
          <div class="h-score">
            <app-score-ring [score]="health()?.score" [size]="150" [label]="'Band ' + (health()?.band || '–')" />
          </div>
          <div style="flex:1;min-width:240px">
            <h2>{{ verdict() }}</h2>
            <p class="muted" style="margin-bottom:14px">{{ health()?.note }}</p>
            @for (c of components; track c.key) {
              <div class="comp">
                <div class="row" style="justify-content:space-between">
                  <span><b>{{ c.label }}</b> <span class="muted">· {{ c.hint }}{{ health()?.weights ? ' · ' + health()!.weights![c.key] + '% of score' : '' }}</span></span>
                  <b>{{ health()?.components?.[c.key] ?? 0 }}</b>
                </div>
                <div class="bar" [class]="'bar ' + barTone(health()?.components?.[c.key])"><span [style.width.%]="health()?.components?.[c.key] ?? 0"></span></div>
              </div>
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h2>Data sharing</h2><p class="sub">Lenders only see your data with consent</p></div>
            <button class="btn small" (click)="grantOpen.set(true)"><app-icon name="plus" [size]="14" /> Share</button>
          </div>
          @for (c of consents(); track c.id) {
            <div class="consent" [class.revoked]="c.revoked_at">
              <div class="row" style="justify-content:space-between;align-items:flex-start">
                <div>
                  <b>{{ c.lender }}</b>
                  <p class="muted" style="margin:2px 0 0">
                    Granted {{ c.granted_at | date: 'd MMM y' }}{{ c.expires_at ? ' · expires ' + (c.expires_at | date: 'd MMM y') : '' }}
                  </p>
                </div>
                <span class="badge dot" [class]="c.revoked_at ? 'slate' : 'green'">{{ c.revoked_at ? 'Revoked' : 'Active' }}</span>
              </div>
              <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">
                @for (s of c.scope; track s) {
                  <span class="badge teal">{{ s | label }}</span>
                }
              </div>
              @if (!c.revoked_at) {
                <button class="btn danger-ghost small" style="margin-top:10px" (click)="revoke(c)" [disabled]="busy()">Revoke access</button>
              }
            </div>
          } @empty {
            <div class="empty"><app-icon name="lock" [size]="26" [stroke]="1.5" /><p>You haven't shared data with any lender.</p></div>
          }
        </div>
      </div>

      @if (grantOpen()) {
        <app-modal title="Share with a lender" subtitle="Read-only, revocable at any time" [width]="480" (closed)="grantOpen.set(false)">
          <form (ngSubmit)="grant()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="gl">Lender</label>
                <input id="gl" name="lender" [(ngModel)]="form.lender" placeholder="Bank or microfinance name" required />
              </div>
              <div class="full">
                <label class="field">What they can see</label>
                @for (s of scopes; track s.key) {
                  <label class="checkbox" style="padding:5px 0">
                    <input type="checkbox" [checked]="form.scope.includes(s.key)" (change)="toggleScope(s.key)" /> {{ s.label }}
                  </label>
                }
              </div>
              <div class="full">
                <label class="field" for="ge">Access expires</label>
                <input id="ge" type="date" name="expires" [(ngModel)]="form.expires_at" />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="grantOpen.set(false)">Cancel</button>
              <button class="btn" [disabled]="busy() || !form.lender || !form.scope.length">Grant access</button>
            </div>
          </form>
        </app-modal>
      }
    </div>
  `,
  styles: [
    `
      .health {
        display: flex;
        gap: 28px;
        flex-wrap: wrap;
        align-items: flex-start;
      }
      .h-score {
        flex: none;
        margin: 0 auto;
      }
      .comp {
        margin-bottom: 14px;
        font-size: 0.84rem;
      }
      .comp .bar {
        margin-top: 6px;
      }
      .consent {
        padding: 14px 0;
        border-bottom: 1px solid var(--border);
      }
      .consent:last-child {
        border-bottom: none;
      }
      .consent.revoked {
        opacity: 0.6;
      }
    `,
  ],
})
export class LoanComponent implements OnInit {
  private toast = inject(ToastService);
  readonly components = COMPONENTS;
  readonly scopes = SCOPES;

  health = signal<LoanHealth | null>(null);
  consents = signal<LoanConsent[]>([]);
  busy = signal(false);
  grantOpen = signal(false);
  form = this.blank();

  verdict = computed(() => {
    const s = this.health()?.score;
    if (s === undefined) return 'Calculating…';
    if (s >= 80) return 'Strong: lenders will like what they see';
    if (s >= 50) return 'Getting there, with a few gaps to close';
    return 'Not loan-ready yet';
  });

  ngOnInit(): void {
    this.load();
  }

  private blank() {
    return { lender: '', scope: ['sales', 'compliance'], expires_at: localDate(new Date(Date.now() + 90 * 864e5)) };
  }

  barTone(v: number | undefined): string {
    return { good: 'green', mid: 'amber', bad: 'red' }[scoreTone(v)];
  }

  toggleScope(k: string): void {
    this.form.scope = this.form.scope.includes(k) ? this.form.scope.filter((x) => x !== k) : [...this.form.scope, k];
  }

  async load(): Promise<void> {
    try {
      const [health, consents] = await Promise.all([
        api.get<LoanHealth>('/loan/health/'),
        api.get('/loan/consent/').catch(() => []),
      ]);
      this.health.set(health);
      this.consents.set(
        asList<LoanConsent>(consents).sort((a, b) => Number(!!a.revoked_at) - Number(!!b.revoked_at))
      );
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load loan readiness');
    }
  }

  async grant(): Promise<void> {
    this.busy.set(true);
    try {
      await api.post('/loan/consent/', { lender: this.form.lender, data_scope: this.form.scope, expires_at: this.form.expires_at });
      this.grantOpen.set(false);
      this.form = this.blank();
      this.toast.success('Access granted');
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Grant failed');
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(c: LoanConsent): Promise<void> {
    this.busy.set(true);
    try {
      await api.post(`/loan/consent/${c.id}/revoke/`);
      this.toast.success(`${c.lender} can no longer see your data`);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Revoke failed');
    } finally {
      this.busy.set(false);
    }
  }
}
