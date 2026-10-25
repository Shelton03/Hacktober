import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tiny dependency-free trend line (tables, KPI tiles). */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [attr.width]="width()" [attr.height]="height()" aria-hidden="true">
      <path [attr.d]="area()" class="area" [class.down]="down()" />
      <path [attr.d]="line()" class="line" [class.down]="down()" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-block;
        line-height: 0;
      }
      .line {
        fill: none;
        stroke: var(--brand);
        stroke-width: 1.75;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .area {
        fill: var(--brand);
        opacity: 0.12;
      }
      .line.down {
        stroke: var(--danger);
      }
      .area.down {
        fill: var(--danger);
      }
    `,
  ],
})
export class SparklineComponent {
  data = input<number[]>([]);
  width = input<number>(96);
  height = input<number>(28);

  private points = computed(() => {
    const d = this.data();
    if (d.length < 2) return [] as [number, number][];
    const min = Math.min(...d);
    const max = Math.max(...d);
    const span = max - min || 1;
    const w = this.width();
    const h = this.height() - 3;
    return d.map((v, i) => [(i / (d.length - 1)) * w, 1.5 + h - ((v - min) / span) * h] as [number, number]);
  });

  down = computed(() => {
    const d = this.data();
    return d.length > 1 && d[d.length - 1] < d[0];
  });

  line = computed(() =>
    this.points()
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ')
  );

  area = computed(() => {
    const p = this.points();
    if (!p.length) return '';
    return `${this.line()} L${this.width()} ${this.height()} L0 ${this.height()} Z`;
  });
}
