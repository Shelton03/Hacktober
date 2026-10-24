import { Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/** Blocks routes until the session is confirmed; unauthenticated → /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.user()) return true;
  const me = await auth.loadMe();
  return me ? true : router.createUrlTree(['/login']);
};
