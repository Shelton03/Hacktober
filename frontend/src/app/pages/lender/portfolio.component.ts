import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { api } from '../../core/api';
import type { LenderSme } from '../../core/models';

@Component({
  selector: 'app-lender-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="demo-banner">DEMO — sample data</div>
      <div class="page-head">
        <div>
          <h1>Lender portfolio</h1>
          <p class="sub">SME borrowers overview — risk bands A–E</p>
        </div>
        <input
          type="search"
          placeholder="Filter by name / sector / location…"
          [(ngModel)]="q"
          name="q"
          style="max-width:260px"
        />
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="table-wrap">
        <table class="list">
          <thead>
            <tr>
              <th>SME</th><th>Sector</th><th>Location</th><th>Health</th><th>Risk band</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (s of filtered(); track s.id) {
              <tr>
                <td><b>{{ s.name || 'SME #' + s.id }}</b></td>
                <td>{{ s.sector }}</td>
                <td>{{ s.location }}</td>
                <td>
                  <span class="badge teal">{{ s.health_score }}</span>
                </td>
                <td>
                  <span class="badge" [class]="bandClass(s.risk_band)">{{ s.risk_band }}</span>
                </td>
                <td>
                  <a class="btn ghost small" [routerLink]="['/lender', 'smes', s.id]">View</a>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">No SMEs match</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      .demo-banner {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 8px 12px;
        font-weight: 700;
        font-size: 0.85rem;
        margin-bottom: 12px;
        text-align: center;
      }
    `,
  ],
})
export class LenderPortfolioComponent {
  smes = signal<LenderSme[]>([]);
  q = '';
  error = signal('');

  filtered(): LenderSme[] {
    const needle = this.q.toLowerCase();
    if (!needle) return this.smes();
    return this.smes().filter((s) =>
      [s.name, s.sector, s.location, s.risk_band]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const res = await api.get<LenderSme[]>('/lender/portfolio/');
      this.smes.set(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load portfolio');
    }
  }

  bandClass(band: string): string {
    if (band === 'A' || band === 'B') return 'green';
    if (band === 'C') return 'amber';
    return 'red';
  }
}
