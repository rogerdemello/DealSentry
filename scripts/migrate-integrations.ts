/**
 * Migration script to assign existing integrations to users
 * This ensures each integration has an owner (userId)
 */

import { supabase } from '../src/lib/supabase';

async function runMigration() {
  console.log('🔄 Starting integration ownership migration...\n');

  try {
    // Fetch all integrations without a userId
    console.log('📋 Fetching integrations without owners...');
    const { data: integrations, error: fetchError } = await supabase
      .from('Integration')
      .select('*')
      .is('userId', null);

    if (fetchError) {
      console.error('❌ Error fetching integrations:', fetchError);
      throw fetchError;
    }

    if (!integrations || integrations.length === 0) {
      console.log('✅ All integrations already have owners!\n');
      return;
    }

    console.log(`📌 Found ${integrations.length} integration(s) without owners\n`);

    // Get the first admin user to assign orphaned integrations
    const { data: adminUser, error: adminError } = await supabase
      .from('User')
      .select('id, email')
      .eq('role', 'ADMIN')
      .limit(1)
      .single();

    if (adminError || !adminUser) {
      console.error('❌ No admin user found. Cannot assign integrations.');
      console.log('ℹ️  Please create an admin user first, or manually delete these integrations.\n');
      
      // List the orphaned integrations
      integrations.forEach(int => {
        console.log(`   - ${int.type}: ${int.name} (ID: ${int.id})`);
      });
      
      console.log('\n💡 To delete these integrations, run:');
      console.log('   DELETE FROM "Integration" WHERE "userId" IS NULL;\n');
      
      return;
    }

    console.log(`👤 Assigning orphaned integrations to admin: ${adminUser.email}\n`);

    // Update each integration to belong to the admin
    for (const integration of integrations) {
      console.log(`   Updating: ${integration.type} - ${integration.name}`);
      
      const { error: updateError } = await supabase
        .from('Integration')
        .update({ userId: adminUser.id })
        .eq('id', integration.id);

      if (updateError) {
        console.error(`   ❌ Failed:`, updateError.message);
      } else {
        console.log(`   ✅ Success`);
      }
    }

    console.log('\n✅ Migration completed successfully!\n');
    console.log('━'.repeat(60));
    console.log('📝 SUMMARY:');
    console.log('━'.repeat(60));
    
    const { data: allIntegrations } = await supabase
      .from('Integration')
      .select('id, type, name, userId')
      .order('createdAt');

    if (allIntegrations && allIntegrations.length > 0) {
      console.log(`\nTotal integrations: ${allIntegrations.length}\n`);
      
      // Group by user
      const byUser: { [key: string]: any[] } = {};
      allIntegrations.forEach(int => {
        const userId = int.userId || 'unassigned';
        if (!byUser[userId]) byUser[userId] = [];
        byUser[userId].push(int);
      });

      for (const userId in byUser) {
        if (userId === 'unassigned') {
          console.log(`⚠️  Unassigned (${byUser[userId].length}):`);
        } else {
          const { data: user } = await supabase
            .from('User')
            .select('email')
            .eq('id', userId)
            .single();
          console.log(`\n👤 ${user?.email || userId} (${byUser[userId].length}):`);
        }
        byUser[userId].forEach(int => {
          console.log(`   - ${int.type}: ${int.name}`);
        });
      }
    }

    console.log('\n━'.repeat(60));
    console.log('ℹ️  Each user can now only see and manage their own integrations.');
    console.log('━'.repeat(60));
    console.log();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
