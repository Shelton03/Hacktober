import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartDataset,
  DoughnutController,
  Filler,
  ArcElement,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ThemeService } from '../core/theme.service';
import { compactMoney, formatMoney } from './format';

export type ChartKind = 'line' | 'bar' | 'doughnut';

export interface ChartSeries {
  label: string;
  data: number[];
  /** CSS colour or token name like 'chart-2' */
  color?: string;
  kind?: 'line' | 'bar';
}

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

/** chart.js wrapper: colours come from CSS tokens so it follows the theme. */
@Component({
  selector: 'app-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="chart-box" [style.height.px]="height()"><canvas #cv></canvas></div>`,
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private host = inject(ElementRef<HTMLElement>);
  private theme = inject(ThemeService);

  kind = input<ChartKind>('bar');
  labels = input<string[]>([]);
  /** single-series shorthand */
  data = input<number[]>([]);
  series = input<ChartSeries[]>([]);
  seriesLabel = input<string>('Value');
  money = input<boolean>(true);
  currency = input<string>('USD');
  height = input<number>(260);
  horizontal = input<boolean>(false);
  /** format x labels that are ISO dates as "12 Oct" */
  dateLabels = input<boolean>(false);
  stacked = input<boolean>(false);

  private chart: Chart | null = null;
  private ready = false;

  constructor() {
    effect(() => {
      // track every input + theme so any change re-renders
      this.kind();
      this.labels();
      this.data();
      this.series();
      this.theme.resolved();
      if (this.ready) queueMicrotask(() => this.render());
    });
  }

  ngAfterViewInit(): void {
    this.ready = true;
    this.render();
  }

  private token(name: string): string {
    if (!name.startsWith('chart-') && !name.startsWith('--')) return name;
    const v = getComputedStyle(this.host.nativeElement)
      .getPropertyValue(name.startsWith('--') ? name : '--' + name)
      .trim();
    return v || '#0a0a0a';
  }

  private alpha(color: string, a: number): string {
    const hex = color.replace('#', '');
    if (hex.length !== 6) return color;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  }

  private render(): void {
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (!ctx) return;
    this.chart?.destroy();

    const kind = this.kind();
    const palette = [1, 2, 3, 4, 5, 6].map((i) => this.token('chart-' + i));
    const text = this.token('--text-3');
    const grid = this.token('chart-grid');
    const series: ChartSeries[] = this.series().length
      ? this.series()
      : [{ label: this.seriesLabel(), data: this.data() }];

    const datasets: ChartDataset[] = series.map((s, i) => {
      const color = this.token(s.color ?? 'chart-' + (i + 1));
      const type = kind === 'doughnut' ? 'doughnut' : (s.kind ?? kind);
      if (type === 'doughnut') {
        return {
          type: 'doughnut',
          label: s.label,
          data: s.data,
          backgroundColor: palette,
          borderColor: this.token('--surface'),
          borderWidth: 2,
          hoverOffset: 6,
        } as ChartDataset;
      }
      if (type === 'line') {
        return {
          type: 'line',
          label: s.label,
          data: s.data,
          borderColor: color,
          backgroundColor: this.alpha(color, 0.08),
          borderWidth: 2.25,
          fill: series.length === 1,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: color,
        } as ChartDataset;
      }
      return {
        type: 'bar',
        label: s.label,
        data: s.data,
        backgroundColor: color,
        hoverBackgroundColor: this.alpha(color, 0.85),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 34,
      } as ChartDataset;
    });

    const fmt = (v: number) => (this.money() ? formatMoney(v, this.currency()) : String(v));
    const labels = this.dateLabels()
      ? this.labels().map((l) =>
          new Date(l + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        )
      : this.labels();

    const valueAxis = {
      beginAtZero: true,
      stacked: this.stacked(),
      grid: { color: grid, drawTicks: false },
      border: { display: false },
      ticks: {
        color: text,
        padding: 8,
        maxTicksLimit: 5,
        callback: (v: string | number) =>
          this.money() ? compactMoney(Number(v), this.currency()) : String(v),
      },
    };
    const categoryAxis = {
      stacked: this.stacked(),
      grid: { display: false },
      border: { display: false },
      ticks: { color: text, maxTicksLimit: 8, maxRotation: 0, autoSkipPadding: 12 },
    };

    this.chart = new Chart(ctx, {
      type: kind === 'doughnut' ? 'doughnut' : 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: this.horizontal() ? 'y' : 'x',
        interaction: { mode: kind === 'doughnut' ? 'nearest' : 'index', intersect: false },
        font: { family: getComputedStyle(document.body).fontFamily },
        cutout: kind === 'doughnut' ? '68%' : undefined,
        plugins: {
          legend: {
            display: kind === 'doughnut' || series.length > 1,
            position: kind === 'doughnut' ? 'right' : 'top',
            align: 'end',
            labels: { color: text, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 },
          },
          tooltip: {
            backgroundColor: '#0a0a0a',
            titleColor: '#f5f5f5',
            bodyColor: '#c4c4c4',
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: (c: any) => ` ${c.dataset.label ?? ''}: ${fmt(Number(c.raw))}`,
            },
          },
        },
        scales:
          kind === 'doughnut'
            ? {}
            : this.horizontal()
              ? { x: valueAxis, y: categoryAxis }
              : { x: categoryAxis, y: valueAxis },
      } as any,
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
