/**
 * Migration script to add password field to User table
 * and update existing users with hashed passwords
 */

import { supabase } from '../src/lib/supabase';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'ChangeMe@123'; // Default password for existing users

async function runMigration() {
  console.log('🔄 Starting authentication migration...\n');

  try {
    // Fetch all existing users
    console.log('📋 Fetching existing users...');
    const { data: users, error: fetchError } = await supabase
      .from('User')
      .select('id, email, password, role');

    if (fetchError) {
      console.error('❌ Error fetching users:', fetchError);
      throw fetchError;
    }

    if (!users || users.length === 0) {
      console.log('ℹ️  No existing users found. Creating default admin...');
    } else {
      console.log(`✅ Found ${users.length} existing user(s)\n`);

      // Update existing users without passwords
      const usersWithoutPassword = users.filter(u => !u.password);
      
      if (usersWithoutPassword.length > 0) {
        console.log(`🔐 Updating ${usersWithoutPassword.length} user(s) with default passwords...\n`);
        
        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

        for (const user of usersWithoutPassword) {
          console.log(`   Updating: ${user.email} (${user.role})`);
          
          const { error: updateError } = await supabase
            .from('User')
            .update({ password: hashedPassword })
            .eq('id', user.id);

          if (updateError) {
            console.error(`   ❌ Failed to update ${user.email}:`, updateError);
          } else {
            console.log(`   ✅ Updated successfully`);
          }
        }

        console.log(`\n✅ Updated existing users with default password: ${DEFAULT_PASSWORD}`);
        console.log('⚠️  Users should change their passwords after first login!\n');
      } else {
        console.log('✅ All existing users already have passwords\n');
      }
    }

    // Check if admin exists
    const { data: existingAdmin } = await supabase
      .from('User')
      .select('id, email')
      .eq('role', 'ADMIN')
      .limit(1);

    if (!existingAdmin || existingAdmin.length === 0) {
      // Create default admin user
      console.log('📝 Creating default admin user...');

      const defaultEmail = 'admin@proposal-reviewer.com';
      const defaultPassword = 'Admin@123';
      const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);

      const { data: newAdmin, error: createError } = await supabase
        .from('User')
        .insert({
          id: crypto.randomUUID(),
          email: defaultEmail,
          password: hashedPassword,
          name: 'System Administrator',
          role: 'ADMIN',
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating admin user:', createError);
        throw createError;
      }

      console.log('✅ Admin user created successfully!\n');
      console.log('📋 Admin Credentials:');
      console.log(`   Email: ${defaultEmail}`);
      console.log(`   Password: ${defaultPassword}\n`);
    } else {
      console.log(`✅ Admin user already exists: ${existingAdmin[0].email}\n`);
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('━'.repeat(60));
    console.log('📝 SUMMARY:');
    console.log('━'.repeat(60));
    
    const { data: allUsers } = await supabase
      .from('User')
      .select('email, role, password')
      .order('role');

    if (allUsers && allUsers.length > 0) {
      console.log(`\nTotal users: ${allUsers.length}\n`);
      allUsers.forEach(u => {
        const hasPassword = !!u.password;
        console.log(`  ${hasPassword ? '🔐' : '⚠️ '} ${u.email} (${u.role})`);
      });
    }

    console.log('\n━'.repeat(60));
    console.log('⚠️  IMPORTANT: All users should change their passwords!');
    console.log('━'.repeat(60));
    console.log();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
