import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly auth = inject(AuthService);

  /** Force a full reload of app data after switching businesses. */
  async switch(businessId: number): Promise<void> {
    localStorage.setItem('sme.business_id', String(businessId));
    this.auth.activeBusinessId.set(businessId);
    // Reload /auth/me so the session picks up the new tenancy context.
    await this.auth.loadMe();
    // Re-enter dashboard so page components re-fetch with the new header.
    location.assign('/dashboard');
  }
}
