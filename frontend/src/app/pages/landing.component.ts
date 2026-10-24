import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../shared/logo.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  template: `
    <!-- top nav -->
    <header class="lnav">
      <app-logo />
      <nav class="lnav-links">
        <a href="#features">Features</a>
        <a routerLink="/plan">Pricing</a>
        <a routerLink="/login" class="btn small">Sign in</a>
      </nav>
    </header>

    <!-- hero -->
    <section class="hero">
      <h1>Pfuma Mbiri — run your business, ZIMRA-compliant, from your pocket</h1>
      <p class="sub">
        Bookkeeping, fiscal receipts, tax estimates and an AI business advisor for Zimbabwean SMEs
      </p>
      <div class="cta-row">
        <a routerLink="/login" class="btn">Sign in</a>
        <a routerLink="/plan" class="btn ghost">See pricing</a>
      </div>
    </section>

    <!-- what we do -->
    <section id="features" class="section">
      <h2>What we do</h2>
      <div class="grid cols-3">
        <div class="card feat">
          <div class="icon">🧾</div>
          <h3>ZIMRA FDMS fiscal receipts</h3>
          <p class="muted">
            Every sale produces a fiscal receipt with QR code, stored IDs and offline sync.
          </p>
        </div>
        <div class="card feat">
          <div class="icon">💳</div>
          <h3>Invoices &amp; payments</h3>
          <p class="muted">
            Send invoices over WhatsApp, record payments, track receivables automatically.
          </p>
        </div>
        <div class="card feat">
          <div class="icon">📊</div>
          <h3>Tax estimates (VAT / QPD)</h3>
          <p class="muted">
            Live VAT summaries, quarterly payment dates and a compliance score with fixes.
          </p>
        </div>
        <div class="card feat">
          <div class="icon">🤖</div>
          <h3>AI business advisor</h3>
          <p class="muted">
            Rule-based insights from your ledger, phrased plainly, with recommended actions.
          </p>
        </div>
        <div class="card feat">
          <div class="icon">📇</div>
          <h3>Leads &amp; follow-ups</h3>
          <p class="muted">
            A simple pipeline from enquiry to quote to invoice — never miss a follow-up.
          </p>
        </div>
        <div class="card feat">
          <div class="icon">🏦</div>
          <h3>Lender-ready business health</h3>
          <p class="muted">
            A loan readiness score you can consent-share with lenders — verified data, no paperwork.
          </p>
        </div>
      </div>
    </section>

    <!-- how it works -->
    <section class="section alt">
      <h2>How it works</h2>
      <div class="grid cols-3">
        <div class="step">
          <div class="step-n">1</div>
          <h3>Register your fiscal device</h3>
          <p class="muted">
            Add your FDMS device once — certificates and keys are stored encrypted, per business.
          </p>
        </div>
        <div class="step">
          <div class="step-n">2</div>
          <h3>Sell &amp; fiscalise daily</h3>
          <p class="muted">
            Quick sales create fiscal receipts automatically; open and close the fiscal day in one
            tap.
          </p>
        </div>
        <div class="step">
          <div class="step-n">3</div>
          <h3>See tax, insights and reports</h3>
          <p class="muted">
            VAT, QPD, P&amp;L, cash flow and advisor insights — always current, always on your
            phone.
          </p>
        </div>
      </div>
    </section>

    <!-- pricing teaser -->
    <section class="section">
      <h2>Simple yearly pricing</h2>
      <div class="grid cols-3">
        <div class="card tier">
          <h3>Free</h3>
          <p class="price">$0<span class="per">/year</span></p>
          <p class="muted">20 invoices/mo · 1 user</p>
        </div>
        <div class="card tier featured">
          <span class="badge amber">Popular</span>
          <h3>Starter</h3>
          <p class="price">$36<span class="per">/year</span></p>
          <p class="muted">100 invoices/mo · 3 users · weekly advisor</p>
        </div>
        <div class="card tier">
          <h3>Business</h3>
          <p class="price">$120<span class="per">/year</span></p>
          <p class="muted">Unlimited invoices · 10 users · daily insights</p>
        </div>
      </div>
      <p style="text-align:center;margin-top:12px">
        <a routerLink="/plan">Full comparison →</a>
      </p>
    </section>

    <footer class="lfoot">
      <p><b>Pfuma Mbiri</b> — Shona for Wealth &amp; Glory</p>
      <p class="muted">
        <a href="#features">Features</a> · <a routerLink="/plan">Pricing</a> ·
        <a routerLink="/login">Sign in</a>
      </p>
    </footer>
  `,
  styles: [
    `
      .lnav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        position: sticky;
        top: 0;
        z-index: 30;
      }
      .lnav-links {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .lnav-links a {
        font-size: 0.88rem;
        color: #334155;
      }
      .hero {
        text-align: center;
        padding: 48px 18px 36px;
        background: linear-gradient(160deg, #f0fdfa 0%, #f8fafc 60%, #fffbeb 100%);
      }
      .hero h1 {
        max-width: 720px;
        margin: 0 auto 10px;
        font-size: clamp(1.3rem, 4vw, 2rem);
      }
      .hero .sub {
        color: #475569;
        max-width: 560px;
        margin: 0 auto 18px;
      }
      .cta-row {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      .section {
        max-width: 1080px;
        margin: 0 auto;
        padding: 28px 18px;
      }
      .section.alt {
        background: #f1f5f9;
        max-width: none;
      }
      .section.alt > * {
        max-width: 1080px;
        margin-left: auto;
        margin-right: auto;
      }
      .feat .icon {
        font-size: 1.5rem;
        margin-bottom: 6px;
      }
      .step {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 14px 16px;
      }
      .step-n {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: #0f766e;
        color: #fff;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        margin-bottom: 8px;
      }
      .tier {
        text-align: center;
        position: relative;
      }
      .tier .price {
        font-size: 1.7rem;
        font-weight: 800;
        margin: 4px 0;
      }
      .tier .per {
        font-size: 0.8rem;
        font-weight: 400;
        color: #64748b;
      }
      .tier.featured {
        border: 2px solid #0f766e;
      }
      .lfoot {
        text-align: center;
        padding: 22px 18px 30px;
        border-top: 1px solid #e2e8f0;
        background: #fff;
      }
      @media (max-width: 640px) {
        .lnav-links a:not(.btn) {
          display: none;
        }
      }
    `,
  ],
})
export class LandingComponent {}
