import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pfuma Mbiri brand mark: three rising chevrons in a square tile, the
 * chevron frieze of Great Zimbabwe read as an upward growth arrow.
 * Monochrome and flat: the tile takes the text colour, the chevrons the
 * surface colour, so it inverts cleanly between light, dark and the black
 * sidebar. Wordmark: "Pfuma" medium, "Mbiri" bold.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="link()" class="logo" [class.light]="variant() === 'light'" aria-label="Pfuma Mbiri home">
      <svg class="mark" viewBox="0 0 40 40" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        <rect width="40" height="40" rx="11" class="tile" />
        <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.6" class="ink">
          <path d="M9 29 20 21l11 8" />
          <path d="M11.5 22.5 20 16l8.5 6.5" opacity="0.55" />
          <path d="M14 16 20 11l6 5" class="crown" />
        </g>
      </svg>
      @if (!markOnly()) {
        <span class="word">Pfuma <b>Mbiri</b></span>
        @if (tag()) {
          <span class="tag">{{ tag() }}</span>
        }
      }
    </a>
  `,
  styles: [
    `
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: var(--text);
      }
      .logo.light {
        color: #fff;
      }
      .mark {
        flex: none;
        display: block;
      }
      .tile {
        fill: var(--text);
      }
      .ink {
        stroke: var(--surface);
      }
      .light .tile {
        fill: #ffffff;
      }
      .light .ink {
        stroke: #0a0a0a;
      }
      /* top chevron carries the brand accent ("mbiri", glory) */
      .crown {
        stroke: var(--brand);
      }
      .word {
        font-weight: 500;
        font-size: 1.05rem;
        letter-spacing: -0.02em;
        white-space: nowrap;
      }
      .word b {
        font-weight: 800;
      }
      .tag {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 7px;
        border-radius: 99px;
        background: var(--primary-soft);
        color: var(--primary-ink);
      }
    `,
  ],
})
export class LogoComponent {
  variant = input<'default' | 'light'>('default');
  size = input<number>(32);
  markOnly = input<boolean>(false);
  tag = input<string>('');
  link = input<string>('/');
}
