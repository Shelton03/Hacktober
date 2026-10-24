import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { Lead, LeadStage, LeadsReport } from '../core/models';

const STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'won', 'lost'];

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Leads pipeline</h1>
          <p class="sub">
            Conversion {{ report()?.conversion_rate || '0' }} — move cards between stages
          </p>
        </div>
        <button class="btn" (click)="openNew()">+ Add lead</button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @if (editing(); as f) {
        <form class="card" style="margin-bottom:14px" (ngSubmit)="save()">
          <h2>{{ f.id ? 'Edit lead' : 'New lead' }}</h2>
          <div class="form-row">
            <div>
              <label class="field">Name *</label>
              <input [(ngModel)]="f.name" name="name" required />
            </div>
            <div>
              <label class="field">Phone</label>
              <input [(ngModel)]="f.phone" name="phone" />
            </div>
            <div>
              <label class="field">Source</label>
              <select [(ngModel)]="f.source" name="source">
                <option value="walk_in">Walk-in</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="facebook">Facebook</option>
                <option value="referral">Referral</option>
              </select>
            </div>
          </div>
          <div class="form-row" style="margin-top:8px">
            <div>
              <label class="field">Interest</label>
              <input [(ngModel)]="f.interest" name="interest" />
            </div>
            <div>
              <label class="field">Estimated value</label>
              <input type="text" [(ngModel)]="f.estimated_value" name="value" />
            </div>
            <div>
              <label class="field">Next follow-up</label>
              <input type="date" [(ngModel)]="f.next_followup" name="followup" />
            </div>
          </div>
          @if (formError()) {
            <div class="alert error">{{ formError() }}</div>
          }
          <div class="row-actions" style="margin-top:10px">
            <button class="btn" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn ghost" (click)="editing.set(null)">Cancel</button>
          </div>
        </form>
      }

      <div class="kanban">
        @for (stage of stages; track stage) {
          <div class="kanban-col">
            <h4>
              {{ stage }}
              <span>{{ byStage()[stage].length }}</span>
            </h4>
            @for (lead of byStage()[stage]; track lead.id) {
              <div class="lead-card">
                <b>{{ lead.name }}</b>
                <div class="muted">{{ lead.interest || lead.source }}</div>
                <div><b>{{ lead.estimated_value }}</b></div>
                @if (isDue(lead.next_followup)) {
                  <span class="badge red">follow-up due</span>
                } @else if (lead.next_followup) {
                  <span class="badge slate">follow-up {{ lead.next_followup | date: 'd MMM' }}</span>
                }
                <select
                  [ngModel]="lead.stage"
                  (ngModelChange)="move(lead, $event)"
                  class="stage-select"
                >
                  @for (s of stages; track s) {
                    <option [value]="s" [selected]="s === lead.stage">{{ s }}</option>
                  }
                </select>
                <div class="row-actions" style="margin-top:6px">
                  @if (lead.stage === 'quoted') {
                    <button class="btn small" (click)="convert(lead)">Convert →</button>
                  }
                  <button class="btn ghost small" (click)="openEdit(lead)">Edit</button>
                </div>
              </div>
            } @empty {
              <div class="muted" style="padding:8px;font-size:0.78rem">—</div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .stage-select {
        margin-top: 6px;
        padding: 4px 6px;
        font-size: 0.76rem;
      }
    `,
  ],
})
export class LeadsComponent {
  stages = STAGES;
  leads = signal<Lead[]>([]);
  report = signal<LeadsReport | null>(null);
  editing = signal<Lead | null>(null);
  error = signal('');
  formError = signal('');
  busy = signal(false);

  byStage = computed(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of STAGES) map[s] = [];
    for (const l of this.leads()) (map[l.stage] ??= []).push(l);
    return map;
  });

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [res, rep] = await Promise.all([
        api.get<Lead[]>('/leads/'),
        api.get<LeadsReport>('/leads/reports/').catch(() => null),
      ]);
      this.leads.set(Array.isArray(res) ? res : (res as any).results ?? []);
      this.report.set(rep);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load leads');
    }
  }

  isDue(date: string | null): boolean {
    if (!date) return false;
    return new Date(date).getTime() <= Date.now();
  }

  openNew(): void {
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
    this.editing.set({ ...l });
  }

  async save(): Promise<void> {
    const f = this.editing();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const body: any = {
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
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.message || 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  async move(lead: Lead, stage: LeadStage): Promise<void> {
    try {
      await api.patch(`/leads/${lead.id}/`, { stage });
      lead.stage = stage;
      this.leads.set([...this.leads()]);
    } catch (e: any) {
      this.error.set(e?.message || 'Move failed');
    }
  }

  async convert(lead: Lead): Promise<void> {
    try {
      await api.post(`/leads/${lead.id}/convert/`);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message || 'Convert failed');
    }
  }
}
