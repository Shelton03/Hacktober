import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, homeFor } from './auth.service';

/** Resolve the session once; unauthenticated → /login. */
async function sessionUser() {
  const auth = inject(AuthService);
  return auth.user() ?? (await auth.loadMe());
}

/** SME portal: needs a business membership. Lender-only users go to /lender. */
export const smeGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await sessionUser();
  if (!user) return router.createUrlTree(['/login']);
  return user.businesses?.length ? true : router.parseUrl(homeFor(user));
};

/** Lender portal: is_lender only. Everyone else goes back to their home. */
export const lenderGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await sessionUser();
  if (!user) return router.createUrlTree(['/login']);
  return user.is_lender ? true : router.parseUrl(homeFor(user));
};
