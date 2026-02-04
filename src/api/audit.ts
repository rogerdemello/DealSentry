import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET audit logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data: logs, error } = await supabase
      .from('AuditLog')
      .select(`
        *,
        User:actorId (name, email, role),
        Proposal:proposalId (title)
      `)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    const formatted = (logs || []).map((log: {
      id: string;
      action: string;
      timestamp: string;
      actorId: string;
      User: { name: string | null; email: string; role: string };
      proposalId: string | null;
      Proposal: { title: string } | null;
    }) => ({
      id: log.id,
      action: log.action,
      timestamp: log.timestamp,
      actorId: log.actorId,
      actor: {
        name: log.User?.name,
        email: log.User?.email,
        role: log.User?.role,
      },
      proposalId: log.proposalId,
      proposal: log.Proposal ? { title: log.Proposal.title } : null,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
