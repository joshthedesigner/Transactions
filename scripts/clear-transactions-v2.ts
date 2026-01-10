/**
 * Script to clear all transactions from transactions_v2 table
 * 
 * EASIEST METHOD: Use the SQL script instead!
 * Run scripts/clear-transactions-v2.sql in Supabase SQL Editor
 * 
 * Alternative: This TypeScript script (requires service role key)
 */

console.log('📝 EASIEST METHOD: Use SQL script!');
console.log('\n   1. Open Supabase SQL Editor');
console.log('   2. Open file: scripts/clear-transactions-v2.sql');
console.log('   3. Follow the instructions in that file');
console.log('\n   OR use the SQL directly:');
console.log('\n   -- Get your user ID:');
console.log('   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;');
console.log('\n   -- Delete transactions (replace YOUR_USER_ID_HERE):');
console.log('   DELETE FROM transactions_v2 WHERE user_id = \'YOUR_USER_ID_HERE\';');
console.log('\n✨ See scripts/clear-transactions-v2.sql for complete instructions');

process.exit(0);

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

