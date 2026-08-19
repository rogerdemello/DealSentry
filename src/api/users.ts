import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin } from './middleware/auth';

const router = Router();

// select('*') tolerates schema drift (e.g. missing company_id), so strip
// sensitive columns here instead of relying on a column list.
function sanitizeUser<T extends { password?: unknown }>(user: T): Omit<T, 'password'> {
  const { password: _password, ...safe } = user;
  return safe;
}

// GET all users
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data: users, error } = await supabase
      .from('User')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json((users || []).map(sanitizeUser));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET single user
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST create user (admin only — can assign roles)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can create users' });
    }

    const { email, name, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { data: user, error } = await supabase
      .from('User')
      .insert({
        id: crypto.randomUUID(),
        email,
        name: name || null,
        role: role || 'SALES_REP',
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH update user (admin only — role changes are privilege changes)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can update users' });
    }

    const { id } = req.params;
    const { email, name, role } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (email !== undefined) updates.email = email;
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;

    const { data: user, error } = await supabase
      .from('User')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('Error updating user:', error);
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

    const { error } = await supabase
      .from('User')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
