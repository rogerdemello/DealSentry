import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin } from './middleware/auth';

const router = Router();

/** Normalize rule from DB (supports snake_case or camelCase) to frontend shape. */
function toRuleShape(r: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!r || !r.id) return null;
  return {
    id: r.id,
    name: r.name ?? '',
    type: r.type ?? 'STRUCTURAL',
    description: r.description ?? '',
    logic: r.logic ?? {},
    isActive: (r as any).isActive ?? (r as any).is_active ?? true,
    createdAt: (r as any).createdAt ?? (r as any).created_at ?? new Date().toISOString(),
    updatedAt: (r as any).updatedAt ?? (r as any).updated_at ?? new Date().toISOString(),
  };
}

// GET all rules (authenticated users: read-only)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    let result = await supabase.from('Rule').select('*').order('updatedAt', { ascending: false });
    if (result.error && result.error.message?.toLowerCase().includes('column')) {
      result = await supabase.from('Rule').select('*').order('updated_at', { ascending: false });
    }
    if (result.error && result.error.message?.toLowerCase().includes('column')) {
      result = await supabase.from('Rule').select('*');
    }
    const { data: rules, error } = result;
    if (error) throw error;

    const normalized = (rules || []).map((r) => toRuleShape(r)).filter(Boolean);
    res.json(normalized);
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

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const camelPayload = {
      id,
      name,
      type,
      description: description || '',
      logic: logic || {},
      isActive: isActive ?? true,
      updatedAt: now,
    };
    let result = await supabase.from('Rule').insert(camelPayload).select().single();
    if (result.error && result.error.message?.includes('column')) {
      const snakePayload = {
        id,
        name,
        type,
        description: description || '',
        logic: logic || {},
        is_active: isActive ?? true,
        updated_at: now,
      };
      result = await supabase.from('Rule').insert(snakePayload).select().single();
    }
    const { data: rule, error } = result;
    if (error) throw error;

    const body = toRuleShape(rule);
    if (!body) {
      console.error('Create rule: insert did not return a row');
      return res.status(500).json({ error: 'Failed to create rule' });
    }
    res.status(201).json(body);
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

    res.json(toRuleShape(rule));
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
