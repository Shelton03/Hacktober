import { Injectable, computed, signal } from '@angular/core';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'pm.theme';

/** Light/dark preference; index.html applies it before first paint. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly pref = signal<ThemePref>(this.read());
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  readonly resolved = computed<'light' | 'dark'>(() => {
    const p = this.pref();
    return p === 'system' ? (this.systemDark() ? 'dark' : 'light') : p;
  });

  constructor() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.systemDark.set(e.matches);
      this.apply();
    });
    this.apply();
  }

  set(pref: ThemePref): void {
    this.pref.set(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage blocked: preference lasts this session only */
    }
    this.apply();
  }

  cycle(): void {
    const order: ThemePref[] = ['light', 'dark', 'system'];
    this.set(order[(order.indexOf(this.pref()) + 1) % order.length]);
  }

  private apply(): void {
    document.documentElement.dataset['theme'] = this.resolved();
  }

  private read(): ThemePref {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
}
