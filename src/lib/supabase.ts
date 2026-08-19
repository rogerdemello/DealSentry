import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL || '';

// This client only ever runs server-side (Express), so prefer the service-role
// key when it is configured: it keeps working after RLS is enabled on the
// tables, whereas the anon key then loses access. Fall back to the anon key so
// existing setups keep working. NEVER expose the service-role key to the SPA.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseKey = serviceRoleKey || anonKey;

// No hardcoded project fallback: pointing at a stale/deleted project makes every
// query fail with an opaque DNS error instead of naming the missing config.
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    `Warning: ${!supabaseUrl ? 'SUPABASE_URL' : ''}${!supabaseUrl && !supabaseKey ? ' and ' : ''}${!supabaseKey ? 'SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)' : ''} not set. ` +
      'Database operations will fail — set them in .env (local) or the Render dashboard.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export default supabase;
