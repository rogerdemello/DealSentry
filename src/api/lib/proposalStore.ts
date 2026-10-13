/**
 * Shared persistence for creating proposals, used by both the manual create
 * route and the AI generation route: insert, audit entry, best-effort embedding.
 */

import { supabase } from '../../lib/supabase';
import type { AuthUser } from '../middleware/auth';
import { generateEmbedding } from './embeddings';
import { logger } from './logger';

export interface ProposalRow {
  id: string;
  title: string;
  content: string;
  status: string;
  metadata: Record<string, unknown>;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Best-effort: compute and store a content embedding for semantic search.
 * Silently no-ops if embeddings or the pgvector column aren't available yet,
 * so it never breaks proposal create/generate. See docs/SEMANTIC_SEARCH.md.
 */
export async function storeProposalEmbedding(id: string, text: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(text);
    if (!embedding) return;
    const { error } = await supabase.from('Proposal').update({ embedding }).eq('id', id);
    if (error) {
      logger.warn('Embedding not stored (run the pgvector migration):', error.message);
    }
  } catch (err) {
    logger.warn('Embedding store skipped:', (err as Error).message);
  }
}

export interface NewProposalInput {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a PENDING proposal owned by `user` (and their company, if any), write
 * the audit entry, and queue its embedding. Throws if the insert fails.
 */
export async function createProposalRecord(
  user: AuthUser,
  input: NewProposalInput,
  audit: { action: string; after?: Record<string, unknown> }
): Promise<ProposalRow> {
  const insertPayload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    title: input.title,
    content: input.content,
    status: 'PENDING',
    metadata: input.metadata || {},
    lockedSections: [],
    userId: user.id,
    updatedAt: new Date().toISOString(),
  };
  if (user.companyId) insertPayload.company_id = user.companyId;

  const { data: proposal, error } = await supabase
    .from('Proposal')
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;

  const { error: auditError } = await supabase.from('AuditLog').insert({
    id: crypto.randomUUID(),
    actorId: user.id,
    proposalId: proposal.id,
    action: audit.action,
    after: audit.after ?? { title: input.title, status: 'PENDING' },
  });
  if (auditError) logger.warn('Audit entry not written:', auditError.message);

  await storeProposalEmbedding(proposal.id, `${proposal.title}\n\n${proposal.content}`);

  return proposal as ProposalRow;
}

/** The response shape the SPA expects for a freshly created proposal. */
export function toCreatedResponse(proposal: ProposalRow) {
  return {
    id: proposal.id,
    title: proposal.title,
    content: proposal.content,
    status: proposal.status,
    metadata: proposal.metadata,
    userId: proposal.userId,
    readinessScore: 0,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}
