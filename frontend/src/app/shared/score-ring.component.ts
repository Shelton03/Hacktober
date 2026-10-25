import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { scoreTone } from './format';

/** Radial gauge for 0–100 scores (compliance, security, loan health). */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ring" [style.width.px]="size()" [style.height.px]="size()">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" class="track" />
        <circle
          cx="60"
          cy="60"
          r="52"
          class="value"
          [class]="'value ' + tone()"
          [attr.stroke-dasharray]="C"
          [attr.stroke-dashoffset]="offset()"
        />
      </svg>
      <div class="center">
        <span class="n">{{ score() ?? '–' }}</span>
        @if (label()) {
          <span class="l">{{ label() }}</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .ring {
        position: relative;
        display: inline-block;
      }
      svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      circle {
        fill: none;
        stroke-width: 10;
      }
      .track {
        stroke: var(--surface-hover);
      }
      .value {
        stroke-linecap: round;
        transition: stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .good {
        stroke: var(--success);
      }
      .mid {
        stroke: var(--warn);
      }
      .bad {
        stroke: var(--danger);
      }
      .center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .n {
        font-size: 1.9em;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .l {
        font-size: 0.72em;
        color: var(--text-3);
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
      }
    `,
  ],
})
export class ScoreRingComponent {
  score = input<number | null | undefined>(null);
  /** value range max (e.g. 850 for credit scores) */
  max = input<number>(100);
  size = input<number>(132);
  label = input<string>('');

  readonly C = 2 * Math.PI * 52;
  tone = computed(() => scoreTone(((this.score() ?? 0) / this.max()) * 100));
  offset = computed(() => {
    const pct = Math.max(0, Math.min(1, (this.score() ?? 0) / this.max()));
    return this.C * (1 - pct);
  });
}
