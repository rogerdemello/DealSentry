/**
 * Auth middleware helpers for multi-tenant access.
 * Admin (Company A) = role ADMIN, sees all. Other users see only their company's data.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../../lib/supabase';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Cached default session user — resolved once per process, see resolveDefaultUser(). */
let defaultUserCache: AuthUser | null = null;

/** Drop the cached default user so the next request re-resolves it (tests, re-seeding). */
export function resetDefaultUser(): void {
  defaultUserCache = null;
}

/**
 * The app has no login screen: requests arrive without a token and are served as
 * a single default identity. Preference order: DEMO_USER_EMAIL, then any ADMIN
 * (sees all companies), then the first user in the table.
 */
async function resolveDefaultUser(): Promise<{ user: AuthUser | null; dbError: string | null }> {
  if (defaultUserCache) return { user: defaultUserCache, dbError: null };

  const email = process.env.DEMO_USER_EMAIL;
  const lookups = [
    () => (email ? supabase.from('User').select('*').eq('email', email).limit(1) : null),
    () => supabase.from('User').select('*').eq('role', 'ADMIN').limit(1),
    () => supabase.from('User').select('*').limit(1),
  ];

  let dbError: string | null = null;

  for (const lookup of lookups) {
    const query = lookup();
    if (!query) continue;

    // A dead or misconfigured Supabase project rejects rather than resolving, so
    // catch here too — otherwise the whole request 500s with no useful message.
    const { data, error } = await query.then(
      (r) => r,
      (err: Error) => ({ data: null, error: { message: err.message } })
    );

    if (error) {
      dbError = error.message;
      console.error('Default user lookup failed:', error.message);
      continue;
    }

    const row = data?.[0] as { id: string; email: string; role: string; company_id?: string } | undefined;
    if (row) {
      defaultUserCache = {
        id: row.id,
        email: row.email,
        role: row.role,
        companyId: row.company_id ?? null,
      };
      return { user: defaultUserCache, dbError: null };
    }
  }

  return { user: null, dbError };
}

/** Resolve the user a bearer token points at, or null if the token is unusable. */
async function userFromToken(token: string): Promise<AuthUser | null> {
  let decoded: { userId: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch (err) {
    console.warn('Ignoring unusable token:', (err as Error).message);
    return null;
  }

  // select('*') so missing columns (e.g. company_id) don't cause the query to fail.
  // Rejections are folded into `error` so an unreachable DB falls through to the
  // default-user path (and its clearer 503) rather than throwing.
  const { data: user, error } = await supabase
    .from('User')
    .select('*')
    .eq('id', decoded.userId)
    .single()
    .then(
      (r) => r,
      (err: Error) => ({ data: null, error: { message: err.message } })
    );

  if (error || !user) {
    console.warn('Token user lookup failed:', error?.message || 'no user');
    return null;
  }

  const u = user as { id: string; email: string; role: string; company_id?: string };
  return { id: u.id, email: u.email, role: u.role, companyId: u.company_id ?? null };
}

/**
 * Resolve who a request is acting as.
 *
 * Login was removed from the product, so a missing, expired, or otherwise
 * unusable token is not an error — the caller is served as the default user
 * (see resolveDefaultUser). A valid token still wins, so any session issued
 * before login was removed keeps its own identity.
 */
export async function resolveSessionUser(
  token?: string
): Promise<{ user: AuthUser | null; dbError: string | null }> {
  const tokenUser = token ? await userFromToken(token) : null;
  if (tokenUser) return { user: tokenUser, dbError: null };
  return resolveDefaultUser();
}

/** Message explaining why no session user could be resolved. */
export function noSessionUserMessage(dbError: string | null): string {
  return dbError
    ? `Database unavailable: ${dbError}. Check SUPABASE_URL and SUPABASE_ANON_KEY.`
    : 'No user records found. Seed the database (npm run seed) or set DEMO_USER_EMAIL.';
}

/** Load the acting user onto req.user. See resolveSessionUser. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { user, dbError } = await resolveSessionUser(token);

    if (!user) {
      res.status(503).json({ error: noSessionUserMessage(dbError), code: 'NO_SESSION_USER' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Failed to resolve session' });
  }
}

/** True if current user is admin (Company A) and can see all deals and approve/reject. */
export function isAdmin(req: Request): boolean {
  return req.user?.role === 'ADMIN';
}

/** User can access a resource if admin or resource belongs to their company. */
export function canAccessCompany(companyId: string | null, req: Request): boolean {
  if (isAdmin(req)) return true;
  if (companyId == null) return true; // backward compat: no company = allow
  return req.user?.companyId === companyId;
}
