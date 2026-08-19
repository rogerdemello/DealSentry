import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth } from './middleware/auth';

const router = Router();

// GET all templates
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data: templates, error } = await supabase
      .from('Template')
      .select('*')
      .eq('isActive', true)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json(templates || []);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST create template
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, type, content } = req.body;

    if (!name || !type || !content) {
      return res.status(400).json({ error: 'Name, type, and content are required' });
    }

    const { data: template, error } = await supabase
      .from('Template')
      .insert({
        id: crypto.randomUUID(),
        name,
        description: description || '',
        type,
        content,
        metadata: {},
        isActive: true,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

export default router;
