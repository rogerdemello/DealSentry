import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin } from './middleware/auth';

const router = Router();

// GET all rules (authenticated users: read-only)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data: rules, error } = await supabase
      .from('Rule')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json(rules || []);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST create rule (admin only)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can create compliance rules' });
    }

    const { name, type, description, logic, isActive } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const { data: rule, error } = await supabase
      .from('Rule')
      .insert({
        id: crypto.randomUUID(),
        name,
        type,
        description: description || '',
        logic: logic || {},
        isActive: isActive ?? true,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT update rule (admin only)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can update compliance rules' });
    }

    const { id } = req.params;
    const { name, type, description, logic, isActive } = req.body;

    const { data: rule, error } = await supabase
      .from('Rule')
      .update({
        name,
        type,
        description,
        logic,
        isActive,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE rule (admin only)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only administrators can delete compliance rules' });
    }

    const { id } = req.params;
    const { error } = await supabase.from('Rule').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
