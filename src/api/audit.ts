import { Router, Request, Response } from 'express';
import { requireAuth } from './middleware/auth';
import { getScopedAuditLogs } from './lib/auditQuery';

const router = Router();

// GET audit logs (auth required; admins see all, others see own + company)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const logs = await getScopedAuditLogs(req, 100);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
