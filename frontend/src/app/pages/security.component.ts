import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { api, asList } from '../core/api';
import type { CoachAnswer, SecurityAssessment, SecurityLesson, SecurityQuestion } from '../core/models';
import { IconComponent } from '../shared/icon.component';
import { ScoreRingComponent } from '../shared/score-ring.component';
import { ToastService } from '../shared/toast.service';

type Tab = 'check' | 'learn' | 'coach';

interface ChatTurn {
  q: string;
  a?: CoachAnswer;
}

const TOPIC_ICON: Record<string, string> = {
  phone: 'phone',
  mobile_money: 'wallet',
  passwords: 'lock',
  backups: 'upload',
  data: 'users',
  access: 'user',
  scams: 'alert',
  network: 'monitor',
  incident: 'flag',
};

const SUGGESTIONS = [
  'A customer showed me a payment SMS but my balance didn’t change',
  'Someone called saying they are from ZIMRA and I owe a penalty',
  'My supplier sent new bank details on WhatsApp',
  'How do I protect my WhatsApp business account?',
];

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent, ScoreRingComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Security</h1>
          <p class="sub">Check how well your money, phone and customer data are protected, and learn how to stay safe.</p>
        </div>
        <div class="page-actions">
          <a class="btn ghost small" [href]="templateUrl('consent-notice')" target="_blank" rel="noopener"><app-icon name="download" [size]="14" /> Consent notice</a>
          <a class="btn ghost small" [href]="templateUrl('data-policy')" target="_blank" rel="noopener"><app-icon name="download" [size]="14" /> Data policy</a>
        </div>
      </div>

      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'check'" (click)="tab.set('check')"><app-icon name="shield" [size]="16" /> Check-up</button>
        <button class="tab" [class.active]="tab() === 'learn'" (click)="tab.set('learn')"><app-icon name="star" [size]="16" /> Learn <span class="badge slate">{{ lessons().length }}</span></button>
        <button class="tab" [class.active]="tab() === 'coach'" (click)="tab.set('coach')"><app-icon name="sparkles" [size]="16" /> Ask the coach</button>
      </div>

      @switch (tab()) {
        @case ('check') {
          @if (result(); as r) {
            <div class="split">
              <div class="stack">
                <div class="card result">
                  <app-score-ring [score]="r.score" [size]="132" label="security" />
                  <div style="flex:1;min-width:220px">
                    <h2>{{ r.band === 'strong' ? 'Well protected' : r.band === 'fair' ? 'Some gaps to close' : 'Your business is exposed' }}</h2>
                    @if (r.taken_at) {
                      <p class="muted">Last checked {{ r.taken_at | date: 'd MMM y' }}</p>
                    }
                    @if (r.strengths.length) {
                      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:10px">
                        @for (s of r.strengths; track s) {
                          <span class="badge green"><app-icon name="check" [size]="11" /> {{ s }}</span>
                        }
                      </div>
                    }
                    <button class="btn ghost small" style="margin-top:14px" (click)="restart()"><app-icon name="refresh" [size]="14" /> Retake</button>
                  </div>
                </div>

                <div class="card coach-note">
                  <div class="row" style="margin-bottom:8px">
                    <span class="c-ico"><app-icon name="sparkles" [size]="16" /></span>
                    <h3>Your coach says</h3>
                    @if (coachingAi()) {
                      <span class="badge teal">AI · Gemma</span>
                    }
                  </div>
                  @if (coachingBusy()) {
                    <p class="muted thinking">Your AI coach is reviewing your answers…</p>
                    <div class="skeleton" style="height:12px;margin-top:8px"></div>
                    <div class="skeleton" style="height:12px;margin-top:8px;width:80%"></div>
                  } @else {
                    <p class="text-2" style="white-space:pre-line">{{ coaching() || r.coaching }}</p>
                  }
                </div>

                <div class="section-title" style="margin:8px 0 0"><h2>Fix these first</h2></div>
                @for (f of r.fixes; track f.question_id; let i = $index) {
                  <div class="card fix">
                    <span class="n" [class.high]="f.priority === 'high'">{{ i + 1 }}</span>
                    <div style="flex:1;min-width:0">
                      <div class="row" style="flex-wrap:wrap;gap:6px">
                        <b>{{ f.action }}</b>
                      </div>
                      <p class="why"><app-icon name="info" [size]="13" /> {{ f.why }}</p>
                      <div class="row" style="gap:6px;margin-top:6px">
                        <span class="badge" [class]="f.priority === 'high' ? 'red' : 'amber'">{{ f.priority === 'high' ? 'High priority' : 'Medium' }}</span>
                        <span class="badge slate">{{ f.topic_label }}</span>
                      </div>
                    </div>
                  </div>
                } @empty {
                  <div class="card empty"><app-icon name="shield" [size]="28" [stroke]="1.5" /><p>No gaps found. Keep these habits up.</p></div>
                }
              </div>

              <div class="stack">
                <h2>Learn next</h2>
                @for (l of r.lessons.slice(0, 4); track l.id) {
                  <button class="card lesson-mini interactive" (click)="openLesson(l)">
                    <span class="t-ico"><app-icon [name]="topicIcon(l.topic)" [size]="16" /></span>
                    <span style="flex:1;min-width:0;text-align:left">
                      <b>{{ l.title }}</b>
                      <small>{{ l.topic_label }}</small>
                    </span>
                    <app-icon name="chevron-right" [size]="16" />
                  </button>
                }
                <button class="btn soft block" (click)="tab.set('coach')"><app-icon name="sparkles" [size]="16" /> Ask the coach a question</button>
              </div>
            </div>
          } @else if (current(); as q) {
            <div class="card quiz">
              <div class="row" style="justify-content:space-between;margin-bottom:8px">
                <span class="eyebrow">{{ q.topic_label }} · {{ step() + 1 }} of {{ questions().length }}</span>
                <span class="muted">{{ answeredCount() }} answered</span>
              </div>
              <div class="bar"><span [style.width.%]="((step() + 1) / questions().length) * 100"></span></div>

              <h2 class="q">{{ q.q }}</h2>
              <div class="opts">
                @for (o of q.options; track o.v) {
                  <button class="opt" [class.active]="answers()[q.id] === o.v" (click)="answer(q.id, o.v)">
                    <span class="radio"></span> {{ o.t }}
                  </button>
                }
              </div>

              <div class="row" style="justify-content:space-between;margin-top:22px">
                <button class="btn plain" (click)="step.set(step() - 1)" [disabled]="step() === 0"><app-icon name="arrow-left" [size]="16" /> Back</button>
                @if (step() < questions().length - 1) {
                  <button class="btn ghost" (click)="step.set(step() + 1)">Skip <app-icon name="arrow-right" [size]="16" /></button>
                } @else {
                  <button class="btn" (click)="submit()" [disabled]="busy() || !answeredCount()">{{ busy() ? 'Scoring…' : 'See my results' }}</button>
                }
              </div>
            </div>
          } @else {
            <div class="skeleton" style="height:320px;border-radius:12px"></div>
          }
        }

        @case ('learn') {
          <div class="toolbar">
            <div class="seg">
              <button [class.active]="topic() === ''" (click)="topic.set('')">All</button>
              @for (t of topics(); track t.key) {
                <button [class.active]="topic() === t.key" (click)="topic.set(t.key)">{{ t.label }}</button>
              }
            </div>
          </div>
          <div class="grid cols-3">
            @for (l of shownLessons(); track l.id) {
              <article class="card lesson" [id]="'lesson-' + l.id" [class.focus]="focusLesson() === l.id">
                <div class="row" style="margin-bottom:10px">
                  <span class="t-ico"><app-icon [name]="topicIcon(l.topic)" [size]="16" /></span>
                  <span class="eyebrow" style="margin:0">{{ l.topic_label }}</span>
                </div>
                <h3>{{ l.title }}</h3>
                <p class="text-2" style="font-size:0.86rem">{{ l.body }}</p>
                <ol>
                  @for (s of l.steps; track $index) {
                    <li>{{ s }}</li>
                  }
                </ol>
              </article>
            }
          </div>
        }

        @case ('coach') {
          <div class="chat card">
            <div class="chat-log">
              <div class="msg bot">
                <span class="c-ico"><app-icon name="sparkles" [size]="15" /></span>
                <div class="bubble">
                  Hi! I'm your security coach. Ask me about scams, mobile money, WhatsApp, passwords, staff access or
                  protecting customer data. <b>Never share a PIN, password or code with anyone, including me.</b>
                </div>
              </div>
              @for (t of chat(); track $index) {
                <div class="msg me"><div class="bubble">{{ t.q }}</div></div>
                <div class="msg bot">
                  <span class="c-ico"><app-icon name="sparkles" [size]="15" /></span>
                  <div class="bubble">
                    @if (t.a; as a) {
                      <p style="white-space:pre-line;margin:0">{{ a.answer }}</p>
                      @if (a.related.length) {
                        <p class="eyebrow" style="margin:12px 0 6px">Related guides</p>
                        <div class="row" style="flex-wrap:wrap;gap:6px">
                          @for (l of a.related; track l.id) {
                            <button class="badge teal" style="border:none;cursor:pointer" (click)="openLesson(l)">{{ l.title }}</button>
                          }
                        </div>
                      }
                      <p class="muted" style="margin:10px 0 0;font-size:0.72rem">
                        {{ a.ai_generated ? 'AI-generated guidance (Gemma). Not legal advice.' : 'From the Pfuma Mbiri guide library.' }}
                      </p>
                    } @else {
                      <span class="dots"><i></i><i></i><i></i></span> <span class="muted">Thinking. This can take up to 30 seconds</span>
                    }
                  </div>
                </div>
              }
            </div>

            @if (!chat().length) {
              <div class="suggest">
                @for (s of suggestions; track s) {
                  <button class="chip" (click)="ask(s)">{{ s }}</button>
                }
              </div>
            }
            <form class="composer" (ngSubmit)="ask(draft)">
              <input name="q" [(ngModel)]="draft" placeholder="Ask about a scam, an account, a risky message…" maxlength="500" autocomplete="off" />
              <button class="btn" [disabled]="asking() || !draft.trim()" aria-label="Send"><app-icon name="send" [size]="16" /></button>
            </form>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .quiz {
        max-width: 760px;
        padding: 28px;
      }
      .q {
        font-size: 1.2rem;
        margin: 26px 0 18px;
        line-height: 1.4;
      }
      .opts {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .opt {
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
      }
      .opt:hover,
      .opt.active {
        border-color: var(--primary);
      }
      .opt.active {
        background: var(--primary-soft);
      }
      .radio {
        width: 18px;
        height: 18px;
        border-radius: 99px;
        border: 2px solid var(--border-strong);
        flex: none;
      }
      .opt.active .radio {
        border-color: var(--primary);
        box-shadow: inset 0 0 0 3px var(--surface);
        background: var(--primary);
      }
      .result {
        display: flex;
        gap: 24px;
        align-items: center;
        flex-wrap: wrap;
      }
      .coach-note {
        background: var(--surface-2);
      }
      .c-ico,
      .t-ico {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: var(--brand);
        color: #ffffff;
        flex: none;
      }
      .t-ico {
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .fix {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
      .why {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        font-size: 0.84rem;
        color: var(--text-2);
        margin: 6px 0 0;
      }
      .why app-icon {
        margin-top: 3px;
        color: var(--text-3);
      }
      .n {
        width: 30px;
        height: 30px;
        border-radius: 99px;
        display: grid;
        place-items: center;
        font-weight: 800;
        font-size: 0.8rem;
        background: var(--accent-soft);
        color: var(--accent-ink);
        flex: none;
      }
      .n.high {
        background: var(--danger-soft);
        color: var(--danger-ink);
      }
      .lesson-mini {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        font: inherit;
        color: var(--text);
        cursor: pointer;
        padding: 14px 16px;
      }
      .lesson-mini b {
        display: block;
        font-size: 0.875rem;
      }
      .lesson-mini small {
        color: var(--text-3);
        font-size: 0.76rem;
      }
      .lesson ol {
        margin: 10px 0 0;
        padding-left: 18px;
        font-size: 0.84rem;
      }
      .lesson li {
        margin-bottom: 4px;
      }
      .lesson.focus {
        border-color: var(--primary);
        box-shadow: var(--ring);
      }
      .chat {
        max-width: 820px;
        padding: 0;
        display: flex;
        flex-direction: column;
        min-height: 520px;
      }
      .chat-log {
        flex: 1;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .msg {
        display: flex;
        gap: 10px;
        align-items: flex-start;
      }
      .msg.me {
        justify-content: flex-end;
      }
      .bubble {
        max-width: 82%;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        font-size: 0.88rem;
      }
      .me .bubble {
        background: var(--primary);
        color: var(--on-primary);
        border-color: transparent;
      }
      .suggest {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 20px 14px;
      }
      .chip {
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text-2);
        border-radius: 99px;
        padding: 7px 12px;
        font: inherit;
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;
      }
      .chip:hover {
        border-color: var(--primary);
        color: var(--text);
      }
      .composer {
        display: flex;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--border);
      }
      .dots i {
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 3px;
        border-radius: 99px;
        background: var(--primary);
        animation: blink 1.2s infinite;
      }
      .dots i:nth-child(2) {
        animation-delay: 0.2s;
      }
      .dots i:nth-child(3) {
        animation-delay: 0.4s;
      }
      @keyframes blink {
        50% {
          opacity: 0.2;
        }
      }
    `,
  ],
})
export class SecurityComponent implements OnInit {
  private toast = inject(ToastService);
  readonly suggestions = SUGGESTIONS;

  tab = signal<Tab>('check');
  questions = signal<SecurityQuestion[]>([]);
  lessons = signal<SecurityLesson[]>([]);
  answers = signal<Record<string, string>>({});
  step = signal(0);
  result = signal<SecurityAssessment | null>(null);
  coaching = signal('');
  coachingAi = signal(false);
  coachingBusy = signal(false);
  busy = signal(false);
  topic = signal('');
  focusLesson = signal('');
  chat = signal<ChatTurn[]>([]);
  asking = signal(false);
  draft = '';

  current = computed(() => this.questions()[this.step()] ?? null);
  answeredCount = computed(() => Object.keys(this.answers()).length);
  topics = computed(() => {
    const seen = new Map<string, string>();
    for (const l of this.lessons()) seen.set(l.topic, l.topic_label);
    return [...seen].map(([key, label]) => ({ key, label }));
  });
  shownLessons = computed(() => this.lessons().filter((l) => !this.topic() || l.topic === this.topic()));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [qs, lessons, latest] = await Promise.all([
        api.get('/security/questions/'),
        api.get('/security/lessons/'),
        api.get<SecurityAssessment | undefined>('/security/assessment/').catch(() => undefined),
      ]);
      this.questions.set(asList<SecurityQuestion>(qs));
      this.lessons.set(asList<SecurityLesson>(lessons));
      if (latest && typeof latest === 'object') this.result.set(latest);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to load the security check');
    }
  }

  topicIcon(t: string): string {
    return TOPIC_ICON[t] ?? 'shield';
  }

  answer(id: string, v: string): void {
    this.answers.update((a) => ({ ...a, [id]: v }));
    if (this.step() < this.questions().length - 1) setTimeout(() => this.step.update((s) => s + 1), 180);
  }

  restart(): void {
    this.result.set(null);
    this.coaching.set('');
    this.coachingAi.set(false);
    this.answers.set({});
    this.step.set(0);
  }

  openLesson(l: SecurityLesson): void {
    this.topic.set('');
    this.tab.set('learn');
    this.focusLesson.set(l.id);
    setTimeout(() => document.getElementById('lesson-' + l.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  templateUrl(kind: 'consent-notice' | 'data-policy'): string {
    return api.url(`/security/templates/${kind}/`);
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      const answers = this.answers();
      this.result.set(await api.post<SecurityAssessment>('/security/assessment/', { answers }));
      this.loadCoaching(answers);
    } catch (e: any) {
      this.toast.error(e?.message || 'Submission failed');
    } finally {
      this.busy.set(false);
    }
  }

  /** the AI note is slow: show the instant template first, then swap it in */
  private async loadCoaching(answers: Record<string, string>): Promise<void> {
    this.coachingBusy.set(true);
    try {
      const r = await api.post<{ coaching: string; ai_generated: boolean }>('/security/coaching/', { answers });
      this.coaching.set(r.coaching);
      this.coachingAi.set(r.ai_generated);
    } catch {
      /* keep the template coaching from the assessment */
    } finally {
      this.coachingBusy.set(false);
    }
  }

  async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q || this.asking()) return;
    this.draft = '';
    this.asking.set(true);
    this.chat.update((c) => [...c, { q }]);
    const idx = this.chat().length - 1;
    try {
      const a = await api.post<CoachAnswer>('/security/coach/', { question: q });
      this.chat.update((c) => c.map((t, i) => (i === idx ? { ...t, a } : t)));
    } catch (e: any) {
      this.chat.update((c) =>
        c.map((t, i) => (i === idx ? { ...t, a: { answer: e?.message || 'Something went wrong.', ai_generated: false, related: [] } } : t))
      );
    } finally {
      this.asking.set(false);
    }
  }
}
