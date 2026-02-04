import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dbtresabyjoskapqkkun.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseKey) {
  console.warn('Warning: SUPABASE_ANON_KEY not set. Database operations will fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
