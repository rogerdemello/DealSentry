/**
 * Auth middleware helpers for multi-tenant access.
 * Admin (Company A) = role ADMIN, sees all. Other users see only their company's data.
 *
 * Two modes (see lib/authConfig.ts):
 *  - demo  (default): a missing/unusable token is served as the default user.
 *  - login:           a valid token is required; there is no default identity.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../../lib/supabase';
import { getJwtSecret, isLoginMode } from '../lib/authConfig';
import { logger } from '../lib/logger';

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
 * Demo mode has no login screen: requests arrive without a token and are served
 * as a single default identity. Preference order: DEMO_USER_EMAIL, then any ADMIN
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
      logger.error('Default user lookup failed:', error.message);
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

/**
 * Resolve the user a session token points at. `user` is null when the token is
 * unusable (bad signature, expired, unknown user, or not a session token at all);
 * `dbError` is set only when the token itself was fine but the database could not
 * be reached.
 */
async function userFromToken(token: string): Promise<{ user: AuthUser | null; dbError: string | null }> {
  let decoded: { userId?: unknown };
  try {
    decoded = jwt.verify(token, getJwtSecret()) as { userId?: unknown };
  } catch (err) {
    logger.warn('Ignoring unusable token:', (err as Error).message);
    return { user: null, dbError: null };
  }

  // OAuth start/state tokens are signed with the same secret but carry no userId;
  // they must never be accepted as a session.
  if (typeof decoded.userId !== 'string' || !decoded.userId) {
    logger.warn('Ignoring token that is not a session token');
    return { user: null, dbError: null };
  }

  return loadUserById(decoded.userId);
}

/** Load a user row by id as an AuthUser. See userFromToken for the result shape. */
export async function loadUserById(id: string): Promise<{ user: AuthUser | null; dbError: string | null }> {
  // select('*') so missing columns (e.g. company_id) don't cause the query to fail.
  // Rejections are folded into `error` so an unreachable DB is reported cleanly
  // (demo mode then falls through to the default user, login mode to a 503).
  const { data: user, error } = await supabase
    .from('User')
    .select('*')
    .eq('id', id)
    .single()
    .then(
      (r) => r,
      (err: Error) => ({ data: null, error: { message: err.message } })
    );

  if (error || !user) {
    logger.warn('Token user lookup failed:', error?.message || 'no user');
    // PostgREST's "no rows" is a missing user (PGRST116); anything else is the database failing.
    const missing = !user && (!error || (error as { code?: string }).code === 'PGRST116');
    return { user: null, dbError: missing ? null : error?.message ?? null };
  }

  const u = user as { id: string; email: string; role: string; company_id?: string };
  return { user: { id: u.id, email: u.email, role: u.role, companyId: u.company_id ?? null }, dbError: null };
}

/**
 * Resolve who a request is acting as.
 *
 * Demo mode: a missing, expired, or otherwise unusable token is not an error —
 * the caller is served as the default user (see resolveDefaultUser). A valid
 * token still wins, so a real session keeps its own identity.
 *
 * Login mode: only a valid token resolves; there is no fallback identity.
 */
export async function resolveSessionUser(
  token?: string
): Promise<{ user: AuthUser | null; dbError: string | null }> {
  const fromToken = token ? await userFromToken(token) : { user: null, dbError: null };
  if (fromToken.user) return fromToken;
  if (isLoginMode()) return fromToken;
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
      if (isLoginMode() && !dbError) {
        res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        return;
      }
      res.status(503).json({ error: noSessionUserMessage(dbError), code: 'NO_SESSION_USER' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err);
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

/**
 * Stricter per-resource check that also considers ownership.
 *
 * A resource that belongs to a company is visible to that company's members (and
 * admins). A resource with no company is legacy single-tenant data: open to
 * everyone in demo mode (every visitor is the admin anyway), but in login mode
 * visible only to its owner — otherwise any signed-in user could read it by id.
 */
export function canAccessResource(
  resource: { companyId?: string | null; ownerId?: string | null },
  req: Request
): boolean {
  if (isAdmin(req)) return true;
  const companyId = resource.companyId ?? null;
  if (companyId !== null) return req.user?.companyId === companyId;
  if (!isLoginMode()) return true;
  return resource.ownerId != null && resource.ownerId === req.user?.id;
}

/**
 * How a non-admin's list queries must be narrowed: to their company, or — in
 * login mode, when they have no company — to rows they own. Returns null when no
 * narrowing applies (admins, and legacy demo behaviour).
 */
export function listScope(req: Request): { column: 'company_id' | 'userId'; value: string } | null {
  if (isAdmin(req)) return null;
  const user = req.user;
  if (user?.companyId) return { column: 'company_id', value: user.companyId };
  if (isLoginMode() && user) return { column: 'userId', value: user.id };
  return null;
}
