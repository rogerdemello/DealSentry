/**
 * Safety check around enabling Row Level Security (prisma/manual/enable_rls.sql).
 *
 *   npm run check:rls              # BEFORE enabling RLS: is the API's service-role key good?
 *   npm run check:rls -- --verify  # AFTER enabling RLS: is the public anon key now locked out?
 *
 * Enabling RLS with a missing or wrong service-role key would cut the API off from
 * its own database, so run the first form and only proceed if it prints "ready".
 * Keys are never printed.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const verifyMode = process.argv.includes('--verify');

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';

let failures = 0;
const pass = (msg: string) => console.log(`  ok    ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};

/** The unverified claims of a Supabase API key (a JWT): enough to tell anon from service_role. */
function claimsOf(key: string): { role?: string; ref?: string } | null {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const projectRef = (() => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return '';
  }
})();

async function main() {
  console.log(verifyMode ? 'Verifying RLS is enforced...' : 'Checking the service-role key is ready...');

  if (!url) fail('SUPABASE_URL is not set');

  // --- the service-role key (used by the API) ---------------------------------
  if (!serviceKey) {
    fail('SUPABASE_SERVICE_ROLE_KEY is not set (get it from Supabase → Project Settings → API)');
  } else {
    const claims = claimsOf(serviceKey);
    if (!claims) fail('SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase key (expected a JWT)');
    else if (claims.role !== 'service_role') fail(`SUPABASE_SERVICE_ROLE_KEY has role "${claims.role}", expected "service_role" (did you paste the anon key?)`);
    else if (projectRef && claims.ref && claims.ref !== projectRef) fail('SUPABASE_SERVICE_ROLE_KEY belongs to a different project than SUPABASE_URL');
    else pass('service-role key is well-formed and matches this project');

    if (url) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { error } = await admin.from('User').select('id', { count: 'exact', head: true });
      if (error) fail(`the service-role key could not read the User table: ${error.message}`);
      else pass('the service-role key can read the database');
    }
  }

  // --- the anon key (public by design) ---------------------------------------
  if (verifyMode) {
    if (!anonKey) {
      fail('SUPABASE_ANON_KEY is not set, so the lock-out cannot be tested');
    } else if (url) {
      // Read-only probes (a write probe would insert a real row if RLS were off).
      // With RLS on and no policies, a read returns no rows rather than an error.
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      for (const table of ['User', 'Integration', 'Proposal']) {
        const { data, error } = await anon.from(table).select('id').limit(1);
        if (!error && data && data.length > 0) fail(`the anon key can STILL read the ${table} table — RLS is not enabled`);
        else pass(`the anon key cannot read the ${table} table`);
      }
    }
  }

  console.log();
  if (failures > 0) {
    console.log(verifyMode ? 'NOT locked down.' : 'NOT ready — do not run enable_rls.sql yet.');
    process.exit(1);
  }
  console.log(
    verifyMode
      ? 'Locked down: only the API (service role) can reach the data.'
      : 'ready — set the same key on Render, redeploy, then run prisma/manual/enable_rls.sql.'
  );
}

main().catch((err) => {
  console.error('Check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
