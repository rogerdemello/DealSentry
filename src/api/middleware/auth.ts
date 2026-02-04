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

/**
 * Verify JWT and load full user (including companyId) from DB. Attach to req.user.
 * Returns 401 if no token or invalid; does not call next() on failure.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email?: string; role?: string; companyId?: string };
    // Use select('*') so missing columns (e.g. company_id) don't cause the query to fail
    const { data: user, error } = await supabase
      .from('User')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      console.error('Auth middleware: user lookup failed', error?.message || 'no user');
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const u = user as { id: string; email: string; role: string; company_id?: string };
    (req as Request).user = {
      id: u.id,
      email: u.email,
      role: u.role,
      companyId: u.company_id ?? null,
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Invalid token' });
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
