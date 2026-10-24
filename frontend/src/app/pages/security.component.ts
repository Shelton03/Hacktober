import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api } from '../core/api';
import type { SecurityQuestion, SecurityAssessment } from '../core/models';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Security check</h1>
          <p class="sub">12-question assessment of your business data practices</p>
        </div>
        <div class="row-actions">
          <a
            class="btn ghost small"
            [href]="templateUrl('consent-notice')"
            target="_blank"
          >Consent notice template</a>
          <a
            class="btn ghost small"
            [href]="templateUrl('data-policy')"
            target="_blank"
          >Data policy template</a>
        </div>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      @if (assessment(); as a) {
        <div class="grid cols-2">
          <div class="card" style="text-align:center">
            <p class="stat-label">Security score</p>
            <p class="score-ring" [class]="scoreClass(a.score)">{{ a.score }}</p>
          </div>
          <div class="card">
            <h3>Fixes, in priority order</h3>
            @for (f of a.fixes; track $index) {
              <p><span class="badge teal">#{{ f.priority }}</span> {{ f.action }}</p>
            } @empty {
              <p class="muted">No fixes needed — well done.</p>
            }
            <button class="btn ghost small" style="margin-top:8px" (click)="assessment.set(null)">
              Retake assessment
            </button>
          </div>
        </div>
      } @else {
        <form class="card" (ngSubmit)="submit()">
          @for (q of questions(); track q.id; let n = $index) {
            <div class="q-block">
              <p class="q-text">{{ n + 1 }}. {{ q.question }}</p>
              <div class="form-row">
                @for (opt of q.options; track opt.key) {
                  <label class="checkbox">
                    <input
                      type="radio"
                      [name]="'q' + q.id"
                      [value]="opt.key"
                      [(ngModel)]="answers[q.id]"
                    />
                    {{ opt.label }}
                  </label>
                }
              </div>
            </div>
          }
          <p class="muted">
            {{ answeredCount() }} of {{ questions().length }} answered
          </p>
          @if (formError()) {
            <div class="alert error">{{ formError() }}</div>
          }
          <button class="btn" [disabled]="busy()">
            {{ busy() ? 'Scoring…' : 'Submit assessment' }}
          </button>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .q-block {
        border-bottom: 1px solid #f1f5f9;
        padding: 10px 0;
      }
      .q-text {
        font-weight: 600;
        margin: 0 0 6px;
      }
    `,
  ],
})
export class SecurityComponent {
  questions = signal<SecurityQuestion[]>([]);
  answers: Record<number, string> = {};
  assessment = signal<SecurityAssessment | null>(null);
  error = signal('');
  formError = signal('');
  busy = signal(false);

  answeredCount = computed(
    () => this.questions().filter((q) => this.answers[q.id]).length
  );

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<SecurityQuestion[]>('/security/questions/');
      this.questions.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load questions');
    }
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-mid';
    return 'score-bad';
  }

  templateUrl(kind: 'consent-notice' | 'data-policy'): string {
    return api.url(`/security/templates/${kind}/`);
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.formError.set('');
    try {
      const answers: Record<string, string> = {};
      for (const [k, v] of Object.entries(this.answers)) answers[String(k)] = v;
      this.assessment.set(await api.post<SecurityAssessment>('/security/assessment/', { answers }));
    } catch (e: any) {
      this.formError.set(e?.message || 'Submission failed');
    } finally {
      this.busy.set(false);
    }
  }
}
