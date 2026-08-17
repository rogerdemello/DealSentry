import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// No hardcoded project fallback: pointing at a stale/deleted project makes every
// query fail with an opaque DNS error instead of naming the missing config.
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    `Warning: ${!supabaseUrl ? 'SUPABASE_URL' : ''}${!supabaseUrl && !supabaseKey ? ' and ' : ''}${!supabaseKey ? 'SUPABASE_ANON_KEY' : ''} not set. ` +
      'Database operations will fail — set them in .env (local) or the Render dashboard.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
