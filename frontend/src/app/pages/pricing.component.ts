import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-head" style="justify-content:center;text-align:center">
        <div>
          <h1>Plans &amp; pricing</h1>
          <p class="sub">Yearly licences for Zimbabwean SMEs — start free, upgrade when you grow</p>
        </div>
      </div>

      <div class="grid cols-3">
        <div class="card tier">
          <h3>Free</h3>
          <p class="price">$0<span class="per">/year</span></p>
          <p class="muted">For trying things out</p>
          <ul>
            <li>20 invoices / month</li>
            <li>1 user</li>
            <li>Monthly advisor summary</li>
          </ul>
          <a class="btn ghost" routerLink="/login">Start free</a>
        </div>

        <div class="card tier featured">
          <span class="badge amber">Popular</span>
          <h3>Starter</h3>
          <p class="price">$36<span class="per">/year</span></p>
          <p class="muted">about $3/month</p>
          <ul>
            <li>100 invoices / month</li>
            <li>3 users</li>
            <li>Weekly advisor insights</li>
          </ul>
          <button class="btn" (click)="upgrade('Starter')">Upgrade</button>
        </div>

        <div class="card tier">
          <h3>Business</h3>
          <p class="price">$120<span class="per">/year</span></p>
          <p class="muted">about $10/month</p>
          <ul>
            <li>Unlimited invoices</li>
            <li>10 users</li>
            <li>Daily insights + forecasts</li>
          </ul>
          <button class="btn" (click)="upgrade('Business')">Upgrade</button>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>Compare plans</h2>
        <div class="table-wrap">
          <table class="list">
            <thead>
              <tr><th>Feature</th><th>Free</th><th>Starter</th><th>Business</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Invoices per month</td>
                <td>20</td>
                <td>100</td>
                <td><span class="badge teal">unlimited</span></td>
              </tr>
              <tr>
                <td>Users</td>
                <td>1</td>
                <td>3</td>
                <td>10</td>
              </tr>
              <tr>
                <td>AI business advisor</td>
                <td>Monthly summary</td>
                <td>Weekly insights</td>
                <td>Daily insights + forecasts</td>
              </tr>
              <tr>
                <td>Report exports (CSV/PDF)</td>
                <td><span class="badge slate">none</span></td>
                <td><span class="badge green">yes</span></td>
                <td><span class="badge green">yes</span></td>
              </tr>
              <tr>
                <td>ZIMRA fiscal receipts</td>
                <td><span class="badge green">included</span></td>
                <td><span class="badge green">included</span></td>
                <td><span class="badge green">included</span></td>
              </tr>
              <tr>
                <td>Support</td>
                <td>Community</td>
                <td>Email</td>
                <td>Priority</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin-top:10px;text-align:center">
          Yearly licences — limits are configurable.
        </p>
      </div>

      <p class="muted" style="text-align:center;margin-top:14px">
        Plan limits are enforced by the API (HTTP 402) — you'll be prompted to upgrade when a limit
        is reached.
      </p>
      <footer class="foot">Pfuma Mbiri</footer>
    </div>
  `,
  styles: [
    `
      .tier {
        text-align: center;
        position: relative;
      }
      .tier ul {
        list-style: none;
        padding: 0;
        margin: 10px 0 16px;
        font-size: 0.86rem;
        color: #334155;
      }
      .tier li {
        padding: 4px 0;
      }
      .tier .price {
        font-size: 2rem;
        font-weight: 800;
        margin: 4px 0;
      }
      .tier .per {
        font-size: 0.85rem;
        font-weight: 400;
        color: #64748b;
      }
      .tier.featured {
        border: 2px solid #0f766e;
      }
      .tier .btn {
        width: 100%;
      }
      .foot {
        text-align: center;
        color: #64748b;
        font-size: 0.78rem;
        margin-top: 22px;
      }
    `,
  ],
})
export class PricingComponent {
  upgrade(tier: string): void {
    alert(
      `Upgrade to ${tier} — payment flow coming soon. Yearly licences: Free $0, Starter $36/year, Business $120/year.`
    );
  }
}
