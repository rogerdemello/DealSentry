/**
 * Shared, company-scoped AuditLog querying used by both the audit page
 * (/api/audit) and the notifications bell (/api/notifications).
 *
 * Scoping: admins see everything; everyone else sees audit entries they are the
 * actor of, plus entries on proposals belonging to their company.
 */

import { Request } from 'express';
import { supabase } from '../../lib/supabase';
import { isAdmin } from '../middleware/auth';

export interface FormattedAuditLog {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
  actor: { name: string | null; email: string; role: string };
  proposalId: string | null;
  proposal: { title: string } | null;
}

interface AuditRow {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
  User: { name: string | null; email: string; role: string } | null;
  proposalId: string | null;
  Proposal: { title: string } | null;
}

function format(log: AuditRow): FormattedAuditLog {
  return {
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    actorId: log.actorId,
    actor: {
      name: log.User?.name ?? null,
      email: log.User?.email ?? '',
      role: log.User?.role ?? '',
    },
    proposalId: log.proposalId,
    proposal: log.Proposal ? { title: log.Proposal.title } : null,
  };
}

export async function getScopedAuditLogs(req: Request, limit = 100): Promise<FormattedAuditLog[]> {
  let query = supabase
    .from('AuditLog')
    .select(`
      *,
      User:actorId (name, email, role),
      Proposal:proposalId (title)
    `)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (!isAdmin(req)) {
    const uid = req.user?.id ?? '';
    const companyId = req.user?.companyId;

    if (companyId) {
      // Restrict to the user's own actions OR audit entries on their company's proposals.
      const { data: companyProposals } = await supabase
        .from('Proposal')
        .select('id')
        .eq('company_id', companyId);
      const ids = (companyProposals || []).map((p: { id: string }) => p.id);

      const orParts = [`actorId.eq.${uid}`];
      if (ids.length > 0) orParts.push(`proposalId.in.(${ids.join(',')})`);
      query = query.or(orParts.join(','));
    } else {
      // No company context: only the user's own actions.
      query = query.eq('actorId', uid);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(format);
}
