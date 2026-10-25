import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
} from '@angular/core';
import { IconComponent } from './icon.component';

/** Centered dialog (or right-side drawer with `drawer`). Esc / backdrop closes. */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" [class.drawer]="drawer()" (click)="closed.emit()">
      <div
        class="panel"
        [style.max-width.px]="width()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <header>
          <div>
            <h2>{{ title() }}</h2>
            @if (subtitle()) {
              <p class="muted">{{ subtitle() }}</p>
            }
          </div>
          <button class="icon-btn" type="button" (click)="closed.emit()" aria-label="Close">
            <app-icon name="x" />
          </button>
        </header>
        <div class="body">
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        animation: fade 0.15s ease-out;
      }
      .panel {
        width: 100%;
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        animation: pop 0.18s ease-out;
      }
      header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 20px 0;
      }
      header p {
        margin: 2px 0 0;
      }
      .body {
        padding: 16px 20px 20px;
      }
      .drawer {
        justify-content: flex-end;
        padding: 0;
      }
      .drawer .panel {
        height: 100vh;
        max-height: none;
        border-radius: 0;
        border-width: 0 0 0 1px;
        animation: slide 0.22s ease-out;
      }
      @media (max-width: 560px) {
        .backdrop:not(.drawer) {
          align-items: flex-end;
          padding: 0;
        }
        .backdrop:not(.drawer) .panel {
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          max-height: 92vh;
        }
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }
      @keyframes slide {
        from {
          transform: translateX(24px);
          opacity: 0;
        }
      }
    `,
  ],
})
export class ModalComponent {
  title = input<string>('');
  subtitle = input<string>('');
  width = input<number>(520);
  drawer = input<boolean>(false);
  closed = output<void>();

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closed.emit();
  }
}
