/**
 * Find-or-create an OAuth integration for a user. Used by every connect/callback
 * flow, which previously each carried their own copy of this block.
 */

import { supabase } from '../../lib/supabase';

export type OAuthProvider = 'SALESFORCE' | 'HUBSPOT' | 'GMAIL';

export interface UpsertIntegrationOptions {
  userId: string;
  type: OAuthProvider;
  name: string;
  /** Build the credentials to store; receives the existing ones (empty on first connect). */
  credentials: (existing: Record<string, unknown>) => Record<string, unknown>;
  /** Also reset the display name on reconnect (demo flows do; real flows keep the user's name). */
  resetName?: boolean;
}

/**
 * Store credentials for the user's integration of this type, reactivating it if
 * it already exists. Tolerates duplicate rows from before this upsert existed:
 * `.single()` errors on more than one row, which made every reconnect insert yet
 * another copy, so it picks the newest instead. Throws if the database write fails.
 */
export async function upsertIntegration(opts: UpsertIntegrationOptions): Promise<void> {
  const { userId, type, name } = opts;

  const { data: existing } = await supabase
    .from('Integration')
    .select('*')
    .eq('type', type)
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  const credentials = opts.credentials((existing?.credentials ?? {}) as Record<string, unknown>);

  if (existing) {
    const { error } = await supabase
      .from('Integration')
      .update({
        ...(opts.resetName ? { name } : {}),
        credentials,
        isActive: true,
        updatedAt: now,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('Integration').insert({
    id: crypto.randomUUID(),
    type,
    name,
    credentials,
    config: {},
    isActive: true,
    userId,
    updatedAt: now,
  });
  if (error) throw error;
}
