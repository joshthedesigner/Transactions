import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function checkFiles() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all source files
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .order('uploaded_at', { ascending: false });

  if (filesError) {
    console.error('Error fetching files:', filesError);
    return;
  }

  console.log('\n📁 ALL FILES IN DATABASE:\n');
  console.log(`Total files: ${sourceFiles?.length || 0}\n`);

  // Get all transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, source_file_id, status, amount');

  if (transactionsError) {
    console.error('Error fetching transactions:', transactionsError);
    return;
  }

  // Show breakdown for each file
  sourceFiles?.forEach((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    const approved = fileTransactions.filter((t) => t.status === 'approved');
    const pending = fileTransactions.filter((t) => t.status === 'pending_review');

    console.log(`📄 ${file.filename}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Convention: ${file.amount_sign_convention || 'null'}`);
    console.log(`   Uploaded: ${file.uploaded_at}`);
    console.log(`   Total Transactions: ${fileTransactions.length}`);
    console.log(`   ✅ Approved: ${approved.length}`);
    console.log(`   ⏳ Pending: ${pending.length}`);
    console.log(`   Visible on dashboard? ${approved.length > 0 ? '✓ YES' : '✗ NO'}`);
    console.log('');
  });

  // Summary
  const filesWithApproved = sourceFiles?.filter((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    const approved = fileTransactions.filter((t) => t.status === 'approved');
    return approved.length > 0;
  });

  console.log('\n📊 SUMMARY:');
  console.log(`Total files in DB: ${sourceFiles?.length || 0}`);
  console.log(`Files visible on dashboard: ${filesWithApproved?.length || 0}`);
  console.log(`Files hidden (only pending): ${(sourceFiles?.length || 0) - (filesWithApproved?.length || 0)}`);
  
  // Total transaction counts
  const totalApproved = transactions?.filter((t) => t.status === 'approved').length || 0;
  const totalPending = transactions?.filter((t) => t.status === 'pending_review').length || 0;
  
  console.log(`\nTotal approved transactions: ${totalApproved}`);
  console.log(`Total pending transactions: ${totalPending}`);
}

checkFiles().catch(console.error);

