/**
 * Give users passwords so they can sign in when the server runs with
 * AUTH_MODE=login. (In the default demo mode nobody signs in, so this is not needed.)
 *
 *   npx tsx scripts/migrate-auth.ts                      # set a password for every user that has none
 *   npx tsx scripts/migrate-auth.ts --dry-run            # show who would get one, change nothing
 *   npx tsx scripts/migrate-auth.ts --reset user@x.com   # issue a fresh password for one user
 *
 * Every password is random and different per user. They are printed ONCE at the
 * end and never stored in clear text — copy them to a password manager or hand
 * them to the users, who should change them under Settings. If no ADMIN exists,
 * one (admin@dealsentry.ai) is created the same way.
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '../src/lib/supabase';

const SALT_ROUNDS = 10;
const DEFAULT_ADMIN_EMAIL = 'admin@dealsentry.ai';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const resetIndex = args.indexOf('--reset');
const resetEmail = resetIndex >= 0 ? args[resetIndex + 1]?.trim().toLowerCase() : undefined;

/** 16 URL-safe characters from a CSPRNG. */
const generatePassword = () => randomBytes(12).toString('base64url');

interface Issued {
  email: string;
  role: string;
  password: string;
  note: string;
}

async function issuePassword(userId: string): Promise<{ password: string; error: string | null }> {
  const password = generatePassword();
  const { error } = await supabase
    .from('User')
    .update({ password: await bcrypt.hash(password, SALT_ROUNDS), updatedAt: new Date().toISOString() })
    .eq('id', userId);
  return { password, error: error?.message ?? null };
}

async function main() {
  if (resetIndex >= 0 && !resetEmail) {
    throw new Error('--reset needs an email address');
  }

  const { data: users, error: fetchError } = await supabase.from('User').select('id, email, role, password');
  if (fetchError) throw fetchError;

  const issued: Issued[] = [];
  const failed: string[] = [];

  if (resetEmail) {
    const user = (users || []).find((u) => u.email.toLowerCase() === resetEmail);
    if (!user) throw new Error(`No user with email ${resetEmail}`);
    if (dryRun) {
      console.log(`[dry run] would issue a new password for ${user.email}`);
      return;
    }
    const { password, error } = await issuePassword(user.id);
    if (error) throw new Error(`Could not update ${user.email}: ${error}`);
    issued.push({ email: user.email, role: user.role, password, note: 'reset' });
  } else {
    const needPassword = (users || []).filter((u) => !u.password);
    console.log(`${users?.length ?? 0} user(s); ${needPassword.length} without a password.`);

    for (const user of needPassword) {
      if (dryRun) {
        console.log(`[dry run] would issue a password for ${user.email} (${user.role})`);
        continue;
      }
      const { password, error } = await issuePassword(user.id);
      if (error) {
        failed.push(`${user.email}: ${error}`);
      } else {
        issued.push({ email: user.email, role: user.role, password, note: 'new' });
      }
    }

    const hasAdmin = (users || []).some((u) => u.role === 'ADMIN');
    if (!hasAdmin) {
      if (dryRun) {
        console.log(`[dry run] would create an ADMIN ${DEFAULT_ADMIN_EMAIL}`);
      } else {
        const password = generatePassword();
        const { error } = await supabase.from('User').insert({
          id: crypto.randomUUID(),
          email: DEFAULT_ADMIN_EMAIL,
          password: await bcrypt.hash(password, SALT_ROUNDS),
          name: 'System Administrator',
          role: 'ADMIN',
          updatedAt: new Date().toISOString(),
        });
        if (error) failed.push(`${DEFAULT_ADMIN_EMAIL}: ${error.message}`);
        else issued.push({ email: DEFAULT_ADMIN_EMAIL, role: 'ADMIN', password, note: 'created' });
      }
    }
  }

  if (dryRun) return;

  if (issued.length > 0) {
    console.log('\nPasswords issued — shown once, not stored anywhere in clear text:\n');
    console.table(issued.map(({ email, role, password, note }) => ({ email, role, password, note })));
    console.log('Ask each user to change theirs in Settings after the first sign-in.');
  } else if (failed.length === 0) {
    console.log('Nothing to do: every user already has a password.');
  }

  if (failed.length > 0) {
    console.error('\nFailed:');
    for (const line of failed) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
