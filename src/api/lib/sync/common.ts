/**
 * Types and helpers shared by the CRM sync connectors.
 */

import { supabase } from '../../../lib/supabase';

export interface IntegrationRow {
  id: string;
  type: string;
  name: string;
  userId: string;
  credentials: Record<string, unknown> | null;
  isActive?: boolean;
}

export interface SyncContext {
  integration: IntegrationRow;
  /** The integration's owner: imported records belong to them. */
  userId: string;
  /** The owner's company; imported records inherit it for tenant scoping. */
  companyId: string | null;
}

export interface SyncResult {
  recordsAffected: number;
  failed: boolean;
  /** The connection is unusable (revoked/expired/missing token): mark it inactive. */
  deactivate: boolean;
  details: { message: string; error?: string } & Record<string, unknown>;
}

/** Give up on a CRM that does not answer rather than hanging the request. */
export const SYNC_TIMEOUT_MS = 20_000;
export const timeoutSignal = (): AbortSignal => AbortSignal.timeout(SYNC_TIMEOUT_MS);

/** Error text that means "the user must reconnect", not "try again later". */
const RECONNECT_HINTS = ['No access token', 'No instance URL', 'expired', 'revoked', 'reconnect'];

/** Build the result for a connector that threw. */
export function failureResult(err: unknown, fallbackMessage: string): SyncResult {
  const message = (err as Error | undefined)?.message || fallbackMessage;
  return {
    recordsAffected: 0,
    failed: true,
    deactivate: RECONNECT_HINTS.some((hint) => message.includes(hint)),
    details: { error: message, message: 'Sync failed' },
  };
}

export const successResult = (
  recordsAffected: number,
  details: SyncResult['details']
): SyncResult => ({ recordsAffected, failed: false, deactivate: false, details });

/** A money amount from a CRM field ("50000", "9,500.50", "$1,200"); 0 when it is not a number. */
export function parseMoney(value: unknown): number {
  const n = Number.parseFloat(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Read an OAuth token field that may be stored camelCase or snake_case. */
export function credentialField(credentials: Record<string, unknown> | null, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = credentials?.[name];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/**
 * Identifiers (stored under `metadata.<key>`) of records this user has already
 * imported, so a re-sync only adds what is new.
 */
export async function importedIds(userId: string, key: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('Proposal')
    .select('metadata')
    .eq('userId', userId)
    .not(`metadata->${key}`, 'is', null);

  const ids = new Set<string>();
  for (const row of (data || []) as Array<{ metadata?: Record<string, unknown> | null }>) {
    const value = row.metadata?.[key];
    if (value !== undefined && value !== null && value !== '') ids.add(String(value));
  }
  return ids;
}

/** Insert imported proposals and return how many were stored. Throws on failure. */
export async function insertProposals(rows: Array<Record<string, unknown>>): Promise<number> {
  const { data, error } = await supabase.from('Proposal').insert(rows).select();
  if (error) throw error;
  return data?.length || 0;
}

/** Persist refreshed OAuth credentials on the integration. */
export async function saveCredentials(integrationId: string, credentials: Record<string, unknown>): Promise<void> {
  await supabase
    .from('Integration')
    .update({ credentials, updatedAt: new Date().toISOString() })
    .eq('id', integrationId);
}

/** Fields every imported proposal shares. */
export function baseProposal(ctx: SyncContext) {
  return {
    status: 'PENDING' as const,
    userId: ctx.userId,
    lockedSections: [],
    updatedAt: new Date().toISOString(),
    ...(ctx.companyId ? { company_id: ctx.companyId } : {}),
  };
}
