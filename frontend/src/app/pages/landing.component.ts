import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicFooterComponent, PublicNavComponent } from '../layout/public-nav.component';
import { IconComponent } from '../shared/icon.component';
import { TIERS } from './pricing.component';

const FEATURES = [
  { icon: 'receipt', title: 'ZIMRA FDMS receipts', text: 'Every sale is fiscalised with a verifiable QR code, and queued offline when the network drops.' },
  { icon: 'invoice', title: 'Invoices on WhatsApp', text: 'Send fiscal invoices as a WhatsApp link, record EcoCash or cash payments, and chase what’s overdue.' },
  { icon: 'landmark', title: 'VAT & QPD, done for you', text: 'Live VAT position, Quarterly Payment Dates and a compliance score with plain-English fixes.' },
  { icon: 'sparkles', title: 'AI business advisor', text: 'Insights computed from your own ledger (margins, cash gaps, slow stock) with one clear next step.' },
  { icon: 'shield', title: 'Security coach', text: 'A check-up for your phone, mobile money and customer data, plus an AI coach for scams and fraud.' },
  { icon: 'banknote', title: 'Loan-ready books', text: 'A health score built from verified sales that you can share with lenders, only with your consent.' },
];

const STEPS = [
  { title: 'Register your fiscal device', text: 'Add your FDMS device once. Certificates and keys are encrypted per business.' },
  { title: 'Sell and fiscalise', text: 'Ring up sales on your phone. Receipts go to ZIMRA automatically, or sync later if offline.' },
  { title: 'Stay compliant, grow', text: 'Tax estimates, reports and advisor insights stay current, so month-end takes minutes.' },
];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, PublicNavComponent, PublicFooterComponent, IconComponent],
  template: `
    <app-public-nav />

    <section class="hero">
      <div class="hero-inner">
        <div class="copy">
          <span class="pill"><app-icon name="check-circle" [size]="14" /> Built for ZIMRA FDMS fiscalisation</span>
          <h1>Run your business.<br /><span class="grad">Stay ZIMRA-compliant.</span><br />From your pocket.</h1>
          <p class="lead">
            Sales, fiscal receipts, invoices, tax and an AI advisor in one simple app for Zimbabwean shops, salons,
            hardware stores and service businesses.
          </p>
          <div class="cta">
            <a class="btn large" routerLink="/login">Try the live demo <app-icon name="arrow-right" [size]="16" /></a>
            <a class="btn large ghost" routerLink="/plan">See pricing</a>
          </div>
          <div class="trust">
            <span><app-icon name="check" [size]="14" /> USD &amp; ZWG</span>
            <span><app-icon name="check" [size]="14" /> Works offline</span>
            <span><app-icon name="check" [size]="14" /> Free plan forever</span>
          </div>
        </div>

        <div class="preview" aria-hidden="true">
          <div class="win">
            <div class="win-bar"><i></i><i></i><i></i><span>Dashboard</span></div>
            <div class="win-body">
              <div class="kpis">
                <div><small>Today's sales</small><b>$412.80</b><em class="up">▲ 12%</em></div>
                <div><small>Month profit</small><b>$2,960</b><em class="up">▲ 8%</em></div>
                <div><small>VAT due 25 Nov</small><b>$318.40</b><em>on track</em></div>
              </div>
              <div class="mini-chart">
                @for (h of bars; track $index) {
                  <span [style.height.%]="h"></span>
                }
              </div>
              <div class="insight">
                <app-icon name="sparkles" [size]="14" />
                <span><b>Cooking oil is selling out.</b> Restock 20 units before Friday.</span>
              </div>
            </div>
          </div>
          <div class="receipt">
            <div class="r-head"><app-icon name="check-circle" [size]="16" /> Fiscalised</div>
            <div class="r-line"><span>Maize meal 10kg</span><span>$9.50</span></div>
            <div class="r-line"><span>Sugar 2kg × 2</span><span>$5.80</span></div>
            <div class="r-total"><span>Total</span><span>$15.30</span></div>
            <div class="r-qr"><app-icon name="qr" [size]="36" [stroke]="1.5" /><small>Receipt #166<br />Verify on ZIMRA</small></div>
          </div>
        </div>
      </div>
    </section>

    <section id="features" class="section">
      <p class="eyebrow center">Everything in one place</p>
      <h2 class="h2">Your books, your tax and your growth, sorted</h2>
      <div class="features">
        @for (f of features; track f.title) {
          <div class="card feat interactive">
            <span class="f-ico"><app-icon [name]="f.icon" [size]="20" /></span>
            <h3>{{ f.title }}</h3>
            <p class="text-2">{{ f.text }}</p>
          </div>
        }
      </div>
    </section>

    <section id="how" class="band">
      <div class="section">
        <p class="eyebrow center">How it works</p>
        <h2 class="h2">Up and running in an afternoon</h2>
        <div class="steps">
          @for (s of steps; track s.title; let i = $index) {
            <div class="step">
              <span class="n">{{ i + 1 }}</span>
              <h3>{{ s.title }}</h3>
              <p class="text-2">{{ s.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="section ai">
      <div class="ai-copy">
        <p class="eyebrow">Powered by your own numbers</p>
        <h2 class="h2 left">An advisor and a security coach that speak your language</h2>
        <p class="text-2">
          Every insight is computed from your ledger. No guesswork, no invented numbers. Gemma AI turns them into
          plain English, and the security coach answers questions about scams, EcoCash fraud and keeping customer data safe.
        </p>
        <ul>
          <li><app-icon name="check" [size]="16" /> “3 invoices worth $23.60 are overdue. Send a WhatsApp reminder.”</li>
          <li><app-icon name="check" [size]="16" /> “Turn on SIM lock so a thief can’t receive your mobile money codes.”</li>
          <li><app-icon name="check" [size]="16" /> “ZIMRA will never ask you to pay a penalty to a personal number.”</li>
        </ul>
      </div>
      <div class="chat-mock card" aria-hidden="true">
        <div class="cm me">Someone says they sent me EcoCash by mistake and wants it back</div>
        <div class="cm bot">
          <app-icon name="sparkles" [size]="14" />
          <span>Check your <b>real balance</b>, not the SMS. This is a common scam. Don't reverse anything yourself; ask them to contact the provider.</span>
        </div>
      </div>
    </section>

    <section class="section">
      <p class="eyebrow center">Pricing</p>
      <h2 class="h2">Simple yearly plans. Start free.</h2>
      <div class="grid cols-3" style="margin-top:32px">
        @for (t of tiers; track t.name) {
          <div class="card tier" [class.featured]="t.featured">
            <div class="tier-head">
              <h3>{{ t.name }}</h3>
              @if (t.featured) {
                <span class="badge teal">Most popular</span>
              }
            </div>
            <p class="price">{{ t.price }}<span>/year</span></p>
            <p class="muted">{{ t.blurb }}</p>
          </div>
        }
      </div>
      <p style="text-align:center;margin-top:20px"><a routerLink="/plan">Compare plans <app-icon name="arrow-right" [size]="14" /></a></p>
    </section>

    <section class="section">
      <div class="cta-band">
        <div>
          <h2>See it with real-looking data</h2>
          <p>Six demo accounts: a tuckshop, a hardware store, a salon, an accountant, staff and a lender.</p>
        </div>
        <a class="btn large" routerLink="/login">Open the demo <app-icon name="arrow-right" [size]="16" /></a>
      </div>
    </section>

    <app-public-footer />
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--bg);
      }
      .hero {
        position: relative;
        overflow: hidden;
        border-bottom: 1px solid var(--border);
      }
      .hero-inner {
        max-width: 1160px;
        margin: 0 auto;
        padding: 72px 24px 80px;
        display: grid;
        grid-template-columns: 1.15fr 1fr;
        gap: 48px;
        align-items: center;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 99px;
        font-size: 0.78rem;
        font-weight: 600;
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .hero h1 {
        font-size: clamp(2rem, 4.4vw, 3.15rem);
        line-height: 1.08;
        letter-spacing: -0.035em;
        margin: 18px 0;
        font-weight: 800;
      }
      .features {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 36px;
      }
      .grad {
        white-space: nowrap;
        color: var(--brand);
      }
      .lead {
        font-size: 1.08rem;
        color: var(--text-2);
        max-width: 520px;
      }
      .cta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 26px 0 20px;
      }
      .trust {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
        font-size: 0.84rem;
        color: var(--text-2);
      }
      .trust span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .trust app-icon {
        color: var(--success);
      }
      .preview {
        position: relative;
        min-height: 380px;
      }
      .win {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        transform: perspective(1400px) rotateY(-6deg) rotateX(2deg);
      }
      .win-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border);
        background: var(--surface-2);
        font-size: 0.75rem;
        color: var(--text-3);
      }
      .win-bar i {
        width: 9px;
        height: 9px;
        border-radius: 99px;
        background: var(--border-strong);
      }
      .win-bar span {
        margin-left: 8px;
      }
      .win-body {
        padding: 18px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .kpis div {
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
      }
      .kpis small {
        font-size: 0.68rem;
        color: var(--text-3);
      }
      .kpis b {
        font-size: 1.1rem;
        letter-spacing: -0.02em;
      }
      .kpis em {
        font-style: normal;
        font-size: 0.68rem;
        color: var(--text-3);
      }
      .kpis em.up {
        color: var(--success);
      }
      .mini-chart {
        display: flex;
        align-items: flex-end;
        gap: 6px;
        height: 120px;
        margin: 18px 0;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--border);
      }
      .mini-chart span {
        flex: 1;
        border-radius: 5px 5px 2px 2px;
        background: var(--brand);
        opacity: 0.3;
      }
      .mini-chart span:last-child {
        opacity: 1;
      }
      .insight {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--primary-soft);
        color: var(--primary-ink);
        font-size: 0.8rem;
      }
      .insight app-icon {
        margin-top: 2px;
      }
      .receipt {
        position: absolute;
        right: -10px;
        bottom: -28px;
        width: 210px;
        padding: 14px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow-lg);
        font-size: 0.76rem;
        animation: float 5s ease-in-out infinite;
      }
      @keyframes float {
        50% {
          transform: translateY(-8px);
        }
      }
      .r-head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        color: var(--success);
        margin-bottom: 8px;
      }
      .r-line,
      .r-total {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        color: var(--text-2);
      }
      .r-total {
        border-top: 1px dashed var(--border-strong);
        margin-top: 4px;
        padding-top: 6px;
        font-weight: 700;
        color: var(--text);
      }
      .r-qr {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-top: 10px;
        color: var(--text);
      }
      .r-qr small {
        color: var(--text-3);
        line-height: 1.35;
      }
      .section {
        max-width: 1160px;
        margin: 0 auto;
        padding: 80px 24px;
      }
      .center {
        text-align: center;
      }
      .h2 {
        font-size: clamp(1.6rem, 3.2vw, 2.25rem);
        letter-spacing: -0.03em;
        font-weight: 800;
        text-align: center;
        max-width: 720px;
        margin: 0 auto;
        line-height: 1.15;
      }
      .h2.left {
        text-align: left;
        margin: 0;
      }
      .feat h3 {
        margin: 14px 0 6px;
        font-size: 1rem;
      }
      .feat p {
        font-size: 0.9rem;
        margin: 0;
      }
      .f-ico {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
      .band {
        background: var(--surface);
        border-block: 1px solid var(--border);
      }
      .steps {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 28px;
        margin-top: 44px;
        counter-reset: s;
      }
      .step .n {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        font-weight: 800;
        background: var(--primary);
        color: var(--on-primary);
      }
      .step h3 {
        margin: 16px 0 6px;
        font-size: 1.02rem;
      }
      .ai {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        gap: 48px;
        align-items: center;
      }
      .ai ul {
        list-style: none;
        padding: 0;
        margin: 20px 0 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ai li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-size: 0.92rem;
      }
      .ai li app-icon {
        color: var(--success);
        margin-top: 3px;
      }
      .chat-mock {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 22px;
      }
      .cm {
        max-width: 88%;
        padding: 12px 14px;
        border-radius: 14px;
        font-size: 0.88rem;
      }
      .cm.me {
        align-self: flex-end;
        background: var(--primary);
        color: var(--on-primary);
      }
      .cm.bot {
        display: flex;
        gap: 8px;
        background: var(--surface-2);
        border: 1px solid var(--border);
      }
      .cm.bot app-icon {
        color: var(--primary);
        margin-top: 3px;
      }
      .tier {
        text-align: center;
        position: relative;
      }
      .tier.featured {
        border: 2px solid var(--primary);
      }
      .tier-head {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .price {
        font-size: 2.2rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin: 8px 0 2px;
      }
      .price span {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-3);
      }
      .cta-band {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        flex-wrap: wrap;
        padding: 40px;
        border-radius: 20px;
        background: #0a0a0a;
        color: #fff;
        border: 1px solid var(--border-strong);
      }
      .cta-band h2 {
        font-size: 1.6rem;
        letter-spacing: -0.02em;
      }
      .cta-band p {
        color: #a3a3a3;
        margin: 6px 0 0;
      }
      .cta-band .btn {
        background: #ffffff;
        color: #0a0a0a;
      }
      @media (max-width: 900px) {
        .hero-inner,
        .ai {
          grid-template-columns: 1fr;
        }
        .hero-inner {
          padding: 44px 16px 72px;
        }
        .steps,
        .features {
          grid-template-columns: 1fr;
        }
        .section {
          padding: 56px 16px;
        }
        .receipt {
          right: 8px;
        }
        .win {
          transform: none;
        }
      }
    `,
  ],
})
export class LandingComponent {
  readonly features = FEATURES;
  readonly steps = STEPS;
  readonly tiers = TIERS;
  readonly bars = [38, 52, 44, 61, 48, 70, 58, 76, 64, 82, 71, 92];
}
