import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { Lead, LeadStage, LeadsReport } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { LabelPipe, MoneyPipe, today } from '../shared/format';
import { ToastService } from '../shared/toast.service';

const STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: 'new', label: 'New', tone: 'blue' },
  { key: 'contacted', label: 'Contacted', tone: 'teal' },
  { key: 'quoted', label: 'Quoted', tone: 'amber' },
  { key: 'won', label: 'Won', tone: 'green' },
  { key: 'lost', label: 'Lost', tone: 'slate' },
];

const SOURCE_ICON: Record<string, string> = {
  walk_in: 'store',
  whatsapp: 'whatsapp',
  facebook: 'users',
  referral: 'star',
};

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ModalComponent, MoneyPipe, LabelPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Leads</h1>
          <p class="sub">Drag cards between stages. Quoted leads convert straight into an invoice.</p>
        </div>
        <button class="btn" (click)="openNew()"><app-icon name="plus" [size]="16" /> Add lead</button>
      </div>

      <div class="grid cols-4" style="margin-bottom:20px">
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Open pipeline</p><span class="stat-icon"><app-icon name="target" [size]="17" /></span></div>
          <p class="stat-value">{{ pipelineValue() | money }}</p>
          <p class="stat-sub">{{ openCount() }} open lead(s)</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Conversion rate</p><span class="stat-icon green"><app-icon name="percent" [size]="17" /></span></div>
          <p class="stat-value">{{ report()?.conversion_rate ?? 0 }}%</p>
          <p class="stat-sub">{{ report()?.won ?? 0 }} won of {{ report()?.total_leads ?? leads().length }}</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Won value</p><span class="stat-icon green"><app-icon name="check-circle" [size]="17" /></span></div>
          <p class="stat-value">{{ wonValue() | money }}</p>
        </div>
        <div class="card stat">
          <div class="stat-top"><p class="stat-label">Follow-ups due</p><span class="stat-icon red"><app-icon name="clock" [size]="17" /></span></div>
          <p class="stat-value" [class.neg]="dueCount() > 0">{{ dueCount() }}</p>
          <p class="stat-sub">Today or overdue</p>
        </div>
      </div>

      <div class="kanban">
        @for (s of stages; track s.key) {
          <div
            class="kanban-col"
            [class.drop]="dropTarget() === s.key"
            (dragover)="$event.preventDefault(); dropTarget.set(s.key)"
            (dragleave)="dropTarget.set(null)"
            (drop)="onDrop(s.key)"
          >
            <div class="col-head">
              <span class="badge dot" [class]="s.tone">{{ s.label }}</span>
              <span class="muted">{{ byStage()[s.key].length }} · {{ stageValue(s.key) | money: 'USD' : 0 }}</span>
            </div>
            @for (lead of byStage()[s.key]; track lead.id) {
              <div class="lead" draggable="true" (dragstart)="dragging = lead" (dragend)="dragging = null; dropTarget.set(null)">
                <div class="row" style="justify-content:space-between;align-items:flex-start">
                  <b>{{ lead.name }}</b>
                  <button class="icon-btn small" (click)="openEdit(lead)" aria-label="Edit lead"><app-icon name="pencil" [size]="14" /></button>
                </div>
                <p class="interest">{{ lead.interest || 'No details' }}</p>
                <div class="row" style="justify-content:space-between">
                  <span class="src" [title]="lead.source | label"><app-icon [name]="srcIcon(lead.source)" [size]="13" /> {{ lead.source | label }}</span>
                  <b class="val">{{ lead.estimated_value | money: 'USD' : 0 }}</b>
                </div>
                @if (lead.next_followup && s.key !== 'won' && s.key !== 'lost') {
                  <span class="badge" [class]="isDue(lead.next_followup) ? 'red' : 'slate'" style="margin-top:8px">
                    <app-icon name="calendar" [size]="12" /> {{ isDue(lead.next_followup) ? 'Follow up now' : (lead.next_followup | date: 'd MMM') }}
                  </span>
                }
                <div class="foot">
                  <select [ngModel]="lead.stage" (ngModelChange)="move(lead, $event)" aria-label="Move to stage">
                    @for (o of stages; track o.key) {
                      <option [value]="o.key">{{ o.label }}</option>
                    }
                  </select>
                  @if (lead.stage === 'quoted') {
                    <button class="btn small" (click)="convert(lead)">Invoice <app-icon name="arrow-right" [size]="13" /></button>
                  }
                  @if (lead.phone) {
                    <a class="icon-btn small" [href]="waLink(lead.phone)" target="_blank" rel="noopener" title="WhatsApp"><app-icon name="whatsapp" [size]="14" /></a>
                  }
                </div>
              </div>
            } @empty {
              <div class="col-empty">Drop leads here</div>
            }
          </div>
        }
      </div>

      @if (editing(); as f) {
        <app-modal [title]="f.id ? 'Edit lead' : 'New lead'" [width]="540" (closed)="editing.set(null)">
          <form (ngSubmit)="save()">
            <div class="form-grid">
              <div class="full">
                <label class="field" for="ln">Name</label>
                <input id="ln" name="name" [(ngModel)]="f.name" required />
              </div>
              <div>
                <label class="field" for="lp">Phone</label>
                <input id="lp" name="phone" [(ngModel)]="f.phone" placeholder="+263…" />
              </div>
              <div>
                <label class="field" for="ls">Source</label>
                <select id="ls" name="source" [(ngModel)]="f.source">
                  <option value="walk_in">Walk-in</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="facebook">Facebook</option>
                  <option value="referral">Referral</option>
                </select>
              </div>
              <div class="full">
                <label class="field" for="li">What are they interested in?</label>
                <input id="li" name="interest" [(ngModel)]="f.interest" />
              </div>
              <div>
                <label class="field" for="lv">Estimated value (USD)</label>
                <input id="lv" name="value" inputmode="decimal" [(ngModel)]="f.estimated_value" />
              </div>
              <div>
                <label class="field" for="lf">Next follow-up</label>
                <input id="lf" type="date" name="followup" [(ngModel)]="f.next_followup" />
              </div>
              <div class="full">
                <label class="field" for="lst">Stage</label>
                <select id="lst" name="stage" [(ngModel)]="f.stage">
                  @for (o of stages; track o.key) {
                    <option [value]="o.key">{{ o.label }}</option>
                  }
                </select>
              </div>
            </div>
            @if (formError()) {
              <div class="alert error"><app-icon name="alert-circle" /> {{ formError() }}</div>
            }
            <div class="form-actions">
              <button type="button" class="btn ghost" (click)="editing.set(null)">Cancel</button>
              <button class="btn" [disabled]="busy() || !f.name">{{ busy() ? 'Saving…' : 'Save lead' }}</button>
            </div>
          </form>
        </app-modal>
      }
    </div>
  `,
  styles: [
    `
      .col-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 2px 10px;
      }
      .lead {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 8px;
        cursor: grab;
        box-shadow: var(--shadow-sm);
        transition: box-shadow 0.12s, border-color 0.12s;
      }
      .lead:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow);
      }
      .lead:active {
        cursor: grabbing;
      }
      .lead b {
        font-size: 0.875rem;
      }
      .interest {
        font-size: 0.8rem;
        color: var(--text-2);
        margin: 2px 0 8px;
      }
      .src {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        font-size: 0.74rem;
        color: var(--text-3);
      }
      .val {
        font-variant-numeric: tabular-nums;
      }
      .foot {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
      }
      .foot select {
        min-height: 30px;
        padding: 3px 26px 3px 8px;
        font-size: 0.76rem;
        flex: 1 1 96px;
      }
      .col-empty {
        border: 1.5px dashed var(--border-strong);
        border-radius: 10px;
        padding: 22px 8px;
        text-align: center;
        font-size: 0.78rem;
        color: var(--text-3);
      }
    `,
  ],
})
export class LeadsComponent implements OnInit {
  private toast = inject(ToastService);
  readonly stages = STAGES;

  leads = signal<Lead[]>([]);
  report = signal<LeadsReport | null>(null);
  editing = signal<Lead | null>(null);
  dropTarget = signal<LeadStage | null>(null);
  formError = signal('');
  busy = signal(false);
  dragging: Lead | null = null;

  byStage = computed(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.key, [] as Lead[]])) as Record<LeadStage, Lead[]>;
    for (const l of this.leads()) (map[l.stage] ??= []).push(l);
    return map;
  });
  private open = computed(() => this.leads().filter((l) => l.stage !== 'won' && l.stage !== 'lost'));
  openCount = computed(() => this.open().length);
  pipelineValue = computed(() => this.open().reduce((s, l) => s + Number(l.estimated_value || 0), 0));
  wonValue = computed(() => this.stageValue('won'));
  dueCount = computed(() => this.open().filter((l) => this.isDue(l.next_followup)).length);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [res, rep] = await Promise.all([
        api.get('/leads/'),
        api.get<LeadsReport>('/leads/reports/').catch(() => null),
      ]);
      this.leads.set(asList<Lead>(res));
      this.report.set(rep);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load leads');
    }
  }

  stageValue(stage: LeadStage): number {
    return (this.byStage()[stage] ?? []).reduce((s, l) => s + Number(l.estimated_value || 0), 0);
  }

  isDue(date: string | null): boolean {
    return !!date && date <= today();
  }

  srcIcon(s: string): string {
    return SOURCE_ICON[s] ?? 'user';
  }

  waLink(phone: string): string {
    return 'https://wa.me/' + phone.replace(/[^\d]/g, '');
  }

  openNew(): void {
    this.formError.set('');
    this.editing.set({
      id: 0,
      name: '',
      phone: '',
      source: 'walk_in',
      interest: '',
      estimated_value: '',
      stage: 'new',
      next_followup: null,
      assigned_to: null,
    });
  }

  openEdit(l: Lead): void {
    this.formError.set('');
    this.editing.set({ ...l });
  }

  async save(): Promise<void> {
    const f = this.editing();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const body = {
        name: f.name,
        phone: f.phone,
        source: f.source,
        interest: f.interest,
        estimated_value: String(f.estimated_value || '0'),
        stage: f.stage,
        next_followup: f.next_followup || null,
      };
      if (f.id) await api.patch(`/leads/${f.id}/`, body);
      else await api.post('/leads/', body);
      this.editing.set(null);
      this.toast.success(f.id ? 'Lead updated' : 'Lead added');
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  onDrop(stage: LeadStage): void {
    this.dropTarget.set(null);
    const lead = this.dragging;
    this.dragging = null;
    if (lead && lead.stage !== stage) this.move(lead, stage);
  }

  async move(lead: Lead, stage: LeadStage): Promise<void> {
    const prev = lead.stage;
    this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try {
      await api.patch(`/leads/${lead.id}/`, { stage });
      api.get<LeadsReport>('/leads/reports/').then((r) => this.report.set(r)).catch(() => {});
    } catch (e: any) {
      this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, stage: prev } : l)));
      this.toast.error(e?.message || 'Move failed');
    }
  }

  async convert(lead: Lead): Promise<void> {
    try {
      await api.post(`/leads/${lead.id}/convert/`);
      this.toast.success(`${lead.name} converted to an invoice`);
      await this.load();
    } catch (e: any) {
      this.toast.error(e?.message || 'Convert failed');
    }
  }
}
