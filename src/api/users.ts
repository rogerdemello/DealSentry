import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin } from './middleware/auth';
import { isLoginMode } from './lib/authConfig';
import { logger } from './lib/logger';

const router = Router();

const SALT_ROUNDS = 10;
const VALID_ROLES = ['SALES_REP', 'SALES_MANAGER', 'LEGAL', 'REVOPS', 'ADMIN', 'AUDITOR'];
const MIN_PASSWORD_LENGTH = 8;

// select('*') tolerates schema drift (e.g. missing company_id), so strip
// sensitive columns here instead of relying on a column list.
function sanitizeUser<T extends { password?: unknown }>(user: T): Omit<T, 'password'> {
  const { password: _password, ...safe } = user;
  return safe;
}

/** Postgres unique-violation, surfaced by PostgREST as `code: "23505"`. */
const isDuplicateKey = (error: unknown): boolean => (error as { code?: string } | null)?.code === '23505';

/** Validation shared by create and update. Returns an error message, or null if fine. */
function validateUserInput(body: { role?: unknown; password?: unknown }): string | null {
  if (body.role !== undefined && (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role))) {
    return `Invalid role. Expected one of: ${VALID_ROLES.join(', ')}`;
  }
  if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  return null;
}

// GET all users. In login mode only administrators may list everyone.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (isLoginMode() && !isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can list users' });
    }

    const { data: users, error } = await supabase
      .from('User')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json((users || []).map(sanitizeUser));
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET single user. In login mode a non-admin may only read themselves.
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isLoginMode() && !isAdmin(req) && id !== req.user?.id) {
      return res.status(403).json({ error: 'You can only view your own user record' });
    }

    const { data: user, error } = await supabase
      .from('User')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(sanitizeUser(user));
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST create user (admin only — can assign roles, an initial password and a company)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can create users' });
    }

    const { name, role, password, companyId } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const invalid = validateUserInput({ role, password });
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const insertPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      email,
      name: name || null,
      role: role || 'SALES_REP',
      updatedAt: new Date().toISOString(),
    };
    if (password) insertPayload.password = await bcrypt.hash(password, SALT_ROUNDS);
    // Needs the User.company_id column (prisma/manual/multi_user.sql).
    if (companyId) insertPayload.company_id = companyId;

    const { data: user, error } = await supabase
      .from('User')
      .insert(insertPayload)
      .select()
      .single();

    if (isDuplicateKey(error)) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    if (error) throw error;

    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH update user (admin only — role/company changes are privilege changes)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can update users' });
    }

    const { id } = req.params;
    const { email, name, role, password, companyId } = req.body;

    const invalid = validateUserInput({ role, password });
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (email !== undefined) updates.email = typeof email === 'string' ? email.trim().toLowerCase() : email;
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (password !== undefined) updates.password = await bcrypt.hash(password, SALT_ROUNDS);
    if (companyId !== undefined) updates.company_id = companyId || null;

    const { data: user, error } = await supabase
      .from('User')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (isDuplicateKey(error)) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    if (error) throw error;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(sanitizeUser(user));
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE user (admin only)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can delete users' });
    }

    const { id } = req.params;

    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const { error } = await supabase
      .from('User')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
