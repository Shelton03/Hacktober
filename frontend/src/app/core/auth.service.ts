import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { api } from './api';
import type { User, LoginResponse } from './models';

/** Where a user belongs after sign-in: lenders without a business → /lender. */
export function homeFor(user: User | null | undefined): string {
  if (!user) return '/login';
  return user.is_lender && !user.businesses?.length ? '/lender' : '/dashboard';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly loggedIn = computed(() => this._user() !== null);
  readonly businesses = computed(() => this._user()?.businesses ?? []);
  readonly isLender = computed(() => this._user()?.is_lender === true);
  readonly home = computed(() => homeFor(this._user()));
  readonly activeRole = computed(
    () => this.businesses().find((b) => b.id === this.activeBusinessId())?.role ?? ''
  );
  readonly activeBusinessName = computed(
    () => this.businesses().find((b) => b.id === this.activeBusinessId())?.name ?? ''
  );

  readonly activeBusinessId = signal<number | null>(this.storedBusinessId());

  private static storedBusinessId(): number | null {
    const v = localStorage.getItem('sme.business_id');
    return v ? Number(v) : null;
  }
  private storedBusinessId(): number | null {
    return AuthService.storedBusinessId();
  }

  constructor(private router: Router) {}

  async login(emailOrPhone: string, password: string): Promise<void> {
    // make sure the csrftoken cookie exists before the POST (cross-origin dev)
    try { await api.get('/auth/csrf/'); } catch { /* ignore */ }
    const res = await api.post<LoginResponse>('/auth/login/', {
      email_or_phone: emailOrPhone,
      password,
    });
    const bid = res.business_id ?? res.user?.business_id ?? res.businesses?.[0]?.id ?? null;
    if (bid) localStorage.setItem('sme.business_id', String(bid));
    this.activeBusinessId.set(bid);
    // the login payload carries businesses at the top level, not on the user
    const user: User = { ...res.user, businesses: res.businesses ?? res.user?.businesses ?? [] };
    this._user.set(user);
    await this.router.navigateByUrl(homeFor(user));
  }

  async loadMe(): Promise<User | null> {
    try {
      const me = await api.get<User>('/auth/me/');
      this._user.set(me);
      let bid = this.activeBusinessId();
      if (!bid || !me.businesses?.some((b) => b.id === bid)) {
        bid = me.business_id ?? me.businesses?.[0]?.id ?? null;
        if (bid) {
          localStorage.setItem('sme.business_id', String(bid));
          this.activeBusinessId.set(bid);
        }
      }
      return me;
    } catch {
      this._user.set(null);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout/');
    } catch {
      /* session may already be gone */
    }
    localStorage.removeItem('sme.business_id');
    this.activeBusinessId.set(null);
    this._user.set(null);
    await this.router.navigateByUrl('/login');
  }
}
