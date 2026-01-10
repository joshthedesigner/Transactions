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

