/**
 * Script to clear all transactions from transactions_v2 table
 * 
 * Usage:
 *   npx tsx scripts/clear-transactions-v2.ts [--confirm]
 * 
 * WARNING: This will delete ALL transactions for the current user!
 */

import { createClient } from '../lib/supabase/server';

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');

  if (!confirmed) {
    console.log('⚠️  WARNING: This will delete ALL transactions from transactions_v2!');
    console.log('   Run with --confirm flag to proceed:');
    console.log('   npx tsx scripts/clear-transactions-v2.ts --confirm');
    process.exit(1);
  }

  console.log('🗑️  Clearing transactions_v2 table...\n');

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated. Please ensure you are logged in.');
    }

    console.log(`👤 User: ${user.email}\n`);

    // Get count before deletion
    const { count: beforeCount } = await supabase
      .from('transactions_v2')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    console.log(`📊 Current transaction count: ${beforeCount || 0}`);

    if (beforeCount === 0) {
      console.log('✅ Table is already empty. Nothing to delete.');
      return;
    }

    // Delete all transactions for this user
    const { error: deleteError } = await supabase
      .from('transactions_v2')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      throw new Error(`Failed to delete transactions: ${deleteError.message}`);
    }

    // Verify deletion
    const { count: afterCount } = await supabase
      .from('transactions_v2')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    console.log(`\n✅ Successfully deleted ${beforeCount} transactions`);
    console.log(`📊 Remaining transactions: ${afterCount || 0}`);
    console.log('\n✨ Done! You can now re-upload your files.');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

