import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { PublicFooterComponent, PublicNavComponent } from '../layout/public-nav.component';
import { IconComponent } from '../shared/icon.component';
import { ToastService } from '../shared/toast.service';

export const TIERS = [
  {
    name: 'Free',
    price: '$0',
    monthly: 'Free forever',
    blurb: '20 invoices a month · 1 user',
    featured: false,
    features: ['20 invoices / month', '1 user', 'ZIMRA FDMS fiscal receipts', 'Monthly advisor summary', 'Security check-up'],
  },
  {
    name: 'Starter',
    price: '$36',
    monthly: 'About $3 a month',
    blurb: '100 invoices · 3 users · weekly advisor',
    featured: true,
    features: ['100 invoices / month', '3 users with roles', 'Weekly AI advisor insights', 'CSV & PDF exports', 'Email support'],
  },
  {
    name: 'Business',
    price: '$120',
    monthly: 'About $10 a month',
    blurb: 'Unlimited invoices · 10 users · daily insights',
    featured: false,
    features: ['Unlimited invoices', '10 users with roles', 'Daily insights & forecasts', 'Lender data sharing', 'Priority support'],
  },
];

const COMPARE: { feature: string; values: (string | boolean)[] }[] = [
  { feature: 'Invoices per month', values: ['20', '100', 'Unlimited'] },
  { feature: 'Users', values: ['1', '3', '10'] },
  { feature: 'ZIMRA FDMS fiscal receipts', values: [true, true, true] },
  { feature: 'VAT & QPD estimates', values: [true, true, true] },
  { feature: 'AI business advisor', values: ['Monthly', 'Weekly', 'Daily + forecasts'] },
  { feature: 'AI security coach', values: [true, true, true] },
  { feature: 'Report exports (CSV / PDF)', values: [false, true, true] },
  { feature: 'Lender data sharing', values: [false, false, true] },
  { feature: 'Support', values: ['Community', 'Email', 'Priority'] },
];

const FAQ = [
  { q: 'Do I need a fiscal device?', a: 'You need a ZIMRA FDMS device registration (device ID, serial number and activation key). Pfuma Mbiri acts as your fiscal software, so most businesses need no extra hardware.' },
  { q: 'What happens when the network is down?', a: 'Sales still work. Receipts are stored offline and submitted to FDMS automatically when you are back online.' },
  { q: 'Can I bill in USD and ZWG?', a: 'Yes. Products, sales, invoices and expenses can each be in USD or ZWG.' },
  { q: 'What happens when I hit a plan limit?', a: "Nothing is lost. You'll be asked to upgrade before creating more invoices that month." },
];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink, PublicNavComponent, PublicFooterComponent, IconComponent],
  template: `
    <app-public-nav />

    <section class="head">
      <p class="eyebrow">Pricing</p>
      <h1>Simple yearly plans for every stage</h1>
      <p class="lead">Start free. Upgrade when you grow. Every plan includes ZIMRA fiscalisation.</p>
    </section>

    <section class="wrap">
      <div class="tiers">
        @for (t of tiers; track t.name) {
          <div class="card tier" [class.featured]="t.featured">
            <div class="tier-head">
              <h3>{{ t.name }}</h3>
              @if (t.featured) {
                <span class="badge teal">Most popular</span>
              }
            </div>
            <p class="price">{{ t.price }}<span>/year</span></p>
            <p class="muted">{{ t.monthly }}</p>
            <ul>
              @for (f of t.features; track f) {
                <li><app-icon name="check" [size]="16" /> {{ f }}</li>
              }
            </ul>
            @if (t.name === 'Free') {
              <a class="btn ghost block" [routerLink]="auth.user() ? auth.home() : '/login'">{{ auth.user() ? 'Open app' : 'Start free' }}</a>
            } @else {
              <button class="btn block" [class.ghost]="!t.featured" (click)="upgrade(t.name)">Choose {{ t.name }}</button>
            }
          </div>
        }
      </div>

      <h2 class="h2">Compare plans</h2>
      <div class="card flush">
        <div class="table-wrap">
          <table class="list compare">
            <thead><tr><th>Feature</th>@for (t of tiers; track t.name) { <th>{{ t.name }}</th> }</tr></thead>
            <tbody>
              @for (row of compare; track row.feature) {
                <tr>
                  <td class="cell-main">{{ row.feature }}</td>
                  @for (v of row.values; track $index) {
                    <td>
                      @if (v === true) { <app-icon name="check" [size]="18" class="yes" /> }
                      @else if (v === false) { <span class="muted">–</span> }
                      @else { {{ v }} }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <h2 class="h2">Questions</h2>
      <div class="faq">
        @for (f of faq; track f.q; let i = $index) {
          <div class="card q" [class.open]="openFaq() === i">
            <button (click)="openFaq.set(openFaq() === i ? -1 : i)">
              {{ f.q }} <app-icon [name]="openFaq() === i ? 'minus' : 'plus'" [size]="16" />
            </button>
            @if (openFaq() === i) {
              <p class="text-2">{{ f.a }}</p>
            }
          </div>
        }
      </div>

      <p class="muted" style="text-align:center;margin-top:28px">
        Prices in USD, billed yearly. <a routerLink="/">Back to home</a> · <a routerLink="/login">Try the demo</a>
      </p>
    </section>

    <app-public-footer />
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--bg);
      }
      .head {
        text-align: center;
        padding: 64px 24px 8px;
      }
      .head h1 {
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        letter-spacing: -0.03em;
        font-weight: 800;
      }
      .lead {
        color: var(--text-2);
        font-size: 1.05rem;
      }
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 24px 72px;
      }
      .tiers {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
        align-items: start;
      }
      .tier {
        position: relative;
        padding: 28px 24px;
      }
      .tier.featured {
        border: 2px solid var(--primary);
        box-shadow: var(--shadow-lg);
      }
      .tier-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .price {
        font-size: 2.6rem;
        font-weight: 800;
        letter-spacing: -0.04em;
        margin: 10px 0 0;
      }
      .price span {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-3);
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 20px 0 24px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 0.9rem;
      }
      li {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      li app-icon,
      .yes {
        color: var(--success);
      }
      .h2 {
        text-align: center;
        font-size: 1.5rem;
        letter-spacing: -0.02em;
        font-weight: 800;
        margin: 64px 0 20px;
      }
      .compare td:not(:first-child),
      .compare th:not(:first-child) {
        text-align: center;
      }
      .faq {
        display: grid;
        gap: 10px;
        max-width: 760px;
        margin: 0 auto;
      }
      .q {
        padding: 0;
      }
      .q button {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border: none;
        background: none;
        font: inherit;
        font-weight: 600;
        color: var(--text);
        cursor: pointer;
        text-align: left;
      }
      .q p {
        padding: 0 20px 16px;
        margin: 0;
        font-size: 0.9rem;
      }
      @media (max-width: 820px) {
        .tiers {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class PricingComponent {
  auth = inject(AuthService);
  private toast = inject(ToastService);
  readonly tiers = TIERS;
  readonly compare = COMPARE;
  readonly faq = FAQ;
  openFaq = signal(0);

  upgrade(tier: string): void {
    this.toast.info(`${tier} plan: online payments (EcoCash, card) are coming soon.`);
  }
}
