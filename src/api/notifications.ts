import { Router, Request, Response } from 'express';
import { requireAuth } from './middleware/auth';
import { getScopedAuditLogs } from './lib/auditQuery';

const router = Router();

// GET /api/notifications?since=<iso> — recent scoped activity + unread count.
// "Unread" = events newer than the `since` timestamp the client last saw.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since : undefined;
    const sinceMs = sinceRaw ? new Date(sinceRaw).getTime() : NaN;

    const items = await getScopedAuditLogs(req, 20);

    const unreadCount = Number.isNaN(sinceMs)
      ? items.length
      : items.filter((i) => new Date(i.timestamp).getTime() > sinceMs).length;

    res.json({ items, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;
