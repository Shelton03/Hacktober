import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { IconComponent } from './icon.component';

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: ToastKind = 'info', ms = 3800): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, text }].slice(-4));
    setTimeout(() => this.dismiss(id), ms);
  }
  success(text: string): void {
    this.show(text, 'success');
  }
  info(text: string): void {
    this.show(text, 'info');
  }
  error(text: string): void {
    this.show(text, 'error', 6000);
  }
  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}

@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of svc.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" role="status">
          <app-icon
            [name]="t.kind === 'success' ? 'check-circle' : t.kind === 'error' ? 'alert-circle' : 'info'"
          />
          <span>{{ t.text }}</span>
          <button class="icon-btn small" (click)="svc.dismiss(t.id)" aria-label="Dismiss">
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toasts {
        position: fixed;
        z-index: 200;
        right: 20px;
        bottom: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(380px, calc(100vw - 32px));
      }
      @media (max-width: 720px) {
        .toasts {
          right: 16px;
          bottom: 84px;
        }
      }
      .toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 8px 10px 14px;
        border-radius: 12px;
        background: #0a0a0a;
        color: #f5f5f5;
        font-size: 0.86rem;
        box-shadow: var(--shadow-lg);
        animation: toast-in 0.22s ease-out;
      }
      .toast span {
        flex: 1;
      }
      .toast.success app-icon {
        color: #4ade80;
      }
      .toast.error app-icon {
        color: #f87171;
      }
      .toast.info app-icon {
        color: #5eead4;
      }
      .toast .icon-btn {
        color: #8a8a8a;
      }
      .toast .icon-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }
    `,
  ],
})
export class ToastsComponent {
  svc = inject(ToastService);
}
