/**
 * Short-lived, single-purpose tokens for the OAuth redirect dance.
 *
 * OAuth steps are top-level browser navigations, so there is no Authorization
 * header — the identity has to travel in the URL. Putting the 7-day session token
 * there would leak it into server logs, browser history and Referer headers, so:
 *
 *  - "start" token: minted by an authenticated API call, valid ~2 minutes, only
 *    accepted by the /authorize redirect endpoints.
 *  - "state" token: round-tripped through the provider as the OAuth `state`
 *    parameter. It is signed, so a callback cannot be forged for someone else's
 *    user id (the old state was the raw user id), and it expires in 10 minutes.
 *
 * Each carries a `purpose` claim, and neither carries `userId`, so neither can be
 * replayed as a session token (or as each other).
 */

import jwt from 'jsonwebtoken';
import { getJwtSecret } from './authConfig';

type Purpose = 'oauth-start' | 'oauth-state';

function sign(purpose: Purpose, userId: string, expiresIn: jwt.SignOptions['expiresIn']): string {
  return jwt.sign({ purpose, uid: userId }, getJwtSecret(), { expiresIn });
}

function verify(purpose: Purpose, token: unknown): string | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { purpose?: string; uid?: unknown };
    return decoded.purpose === purpose && typeof decoded.uid === 'string' && decoded.uid ? decoded.uid : null;
  } catch {
    return null;
  }
}

export const signOAuthStart = (userId: string): string => sign('oauth-start', userId, '2m');
export const verifyOAuthStart = (token: unknown): string | null => verify('oauth-start', token);

export const signOAuthState = (userId: string): string => sign('oauth-state', userId, '10m');
export const verifyOAuthState = (state: unknown): string | null => verify('oauth-state', state);
