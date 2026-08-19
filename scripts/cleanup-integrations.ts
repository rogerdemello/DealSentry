/**
 * One-off maintenance: remove duplicate Integration rows (keep the newest per
 * userId+type) and ensure the three starter templates exist. Idempotent.
 *
 *   npx tsx scripts/cleanup-integrations.ts
 */
import 'dotenv/config';
import { supabase } from '../src/lib/supabase';

async function dedupeIntegrations() {
  const { data: rows, error } = await supabase
    .from('Integration')
    .select('id, type, userId, createdAt')
    .order('createdAt', { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const row of rows || []) {
    const key = `${row.userId}:${row.type}`;
    if (seen.has(key)) toDelete.push(row.id);
    else seen.add(key);
  }

  if (toDelete.length === 0) {
    console.log('No duplicate integrations found.');
    return;
  }

  // SyncLog rows reference Integration; remove children first.
  const { error: logErr } = await supabase.from('SyncLog').delete().in('integrationId', toDelete);
  if (logErr) throw logErr;
  const { error: delErr } = await supabase.from('Integration').delete().in('id', toDelete);
  if (delErr) throw delErr;
  console.log(`Deleted ${toDelete.length} duplicate integration(s):`, toDelete);
}

async function ensureTemplates() {
  const templates = [
    {
      id: 'standard-sales-proposal',
      name: 'Standard Sales Proposal',
      description: 'A comprehensive sales proposal template for enterprise deals',
      type: 'SALES_PROPOSAL',
      content:
        '# Sales Proposal\n\n## Executive Summary\n\n[Your executive summary here]\n\n## Scope of Work\n\n[Details of scope]\n\n## Pricing\n\n[Pricing details]\n\n## Terms & Conditions\n\n[Standard terms]',
    },
    {
      id: 'master-services-agreement',
      name: 'Master Services Agreement',
      description: 'Legal framework for ongoing service relationships',
      type: 'MSA',
      content:
        '# Master Services Agreement\n\n## Parties\n\n[Party details]\n\n## Services\n\n[Service descriptions]\n\n## Payment Terms\n\n[Payment terms]',
    },
    {
      id: 'statement-of-work',
      name: 'Statement of Work',
      description: 'Detailed project scope and deliverables template',
      type: 'SOW',
      content:
        '# Statement of Work\n\n## Project Overview\n\n[Overview]\n\n## Deliverables\n\n[List deliverables]\n\n## Timeline\n\n[Project timeline]',
    },
  ];

  for (const t of templates) {
    const { error } = await supabase
      .from('Template')
      .upsert({ ...t, metadata: {}, isActive: true, updatedAt: new Date().toISOString() });
    if (error) throw error;
  }
  console.log(`Ensured ${templates.length} starter templates exist.`);
}

async function main() {
  await dedupeIntegrations();
  await ensureTemplates();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
