import { Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';

export type ChartKind = 'line' | 'bar' | 'doughnut';

Chart.register(...registerables);

/** Small chart.js wrapper — teal/amber scheme, mobile-friendly canvases. */
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<div class="chart-box"><canvas #cv></canvas></div>`,
})
export class ChartComponent implements OnChanges, OnDestroy {
  @ViewChild('cv', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  @Input({ required: true }) kind: ChartKind = 'bar';
  @Input({ required: true }) labels: string[] = [];
  @Input({ required: true }) data: number[] = [];
  @Input() series: string = 'Series';
  @Input() colors: string[] = ['#0F766E'];
  private chart: Chart | null = null;

  ngOnChanges(): void {
    this.render();
  }

  private render(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.nativeElement.getContext('2d');
    if (!ctx) return;
    if (this.chart) this.chart.destroy();
    const colors = this.colors.length ? this.colors : ['#0F766E'];
    this.chart = new Chart(ctx, {
      type: this.kind,
      data: {
        labels: this.labels,
        datasets: [
          {
            label: this.series,
            data: this.data,
            backgroundColor: this.kind === 'line' ? 'rgba(15,118,110,0.15)' : colors,
            borderColor: this.kind === 'line' ? '#0F766E' : colors[0],
            borderWidth: 2,
            fill: this.kind === 'line',
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales:
          this.kind === 'doughnut'
            ? {}
            : {
                y: { beginAtZero: true, ticks: { maxTicksLimit: 6 } },
                x: { ticks: { maxTicksLimit: 8 } },
              },
      },
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
