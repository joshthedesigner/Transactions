import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, isSpending, AmountSignConvention } from '@/lib/utils/amount-calculator';

async function checkDatabaseTotals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    console.error('Not authenticated');
    process.exit(1);
  }

  // Get ALL transactions with source file info
  const { data: allTransactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching transactions:', error);
    process.exit(1);
  }

  if (!allTransactions || allTransactions.length === 0) {
    console.log('No transactions found in database');
    return;
  }

  console.log(`\n=== DATABASE TOTALS ===\n`);
  console.log(`Total Transactions in DB: ${allTransactions.length}\n`);

  // Breakdown by status
  const approved = allTransactions.filter(t => t.status === 'approved');
  const pending = allTransactions.filter(t => t.status === 'pending_review');
  
  console.log(`By Status:`);
  console.log(`  Approved: ${approved.length}`);
  console.log(`  Pending Review: ${pending.length}\n`);

  // Process transactions with conventions
  const transactionsWithConvention = allTransactions.map((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    return {
      amount,
      convention,
      status: t.status,
      isSpending: isSpending(amount, convention),
      spendingAmount: calculateSpendingAmount(amount, convention),
    };
  });

  // Count spending vs credits
  const spendingTransactions = transactionsWithConvention.filter(t => t.isSpending);
  const creditTransactions = transactionsWithConvention.filter(t => !t.isSpending);
  
  // Calculate totals
  const totalSpendingAmount = transactionsWithConvention.reduce((sum, t) => sum + t.spendingAmount, 0);
  
  // Breakdown by status
  const approvedSpending = transactionsWithConvention.filter(t => t.status === 'approved' && t.isSpending);
  const pendingSpending = transactionsWithConvention.filter(t => t.status === 'pending_review' && t.isSpending);
  
  const approvedSpendingTotal = approvedSpending.reduce((sum, t) => sum + t.spendingAmount, 0);
  const pendingSpendingTotal = pendingSpending.reduce((sum, t) => sum + t.spendingAmount, 0);

  console.log(`By Transaction Type:`);
  console.log(`  Spending Transactions: ${spendingTransactions.length}`);
  console.log(`  Credit/Refund Transactions: ${creditTransactions.length}\n`);

  console.log(`Spending Breakdown:`);
  console.log(`  All Spending Transactions: ${spendingTransactions.length}`);
  console.log(`  All Spending Total: $${totalSpendingAmount.toFixed(2)}\n`);

  console.log(`Spending by Status:`);
  console.log(`  Approved Spending: ${approvedSpending.length} = $${approvedSpendingTotal.toFixed(2)}`);
  console.log(`  Pending Spending: ${pendingSpending.length} = $${pendingSpendingTotal.toFixed(2)}\n`);

  // Group by source file
  const bySourceFile = new Map<string, {
    count: number;
    spendingCount: number;
    total: number;
  }>();

  allTransactions.forEach((t: any) => {
    const filename = t.source_file?.filename || 'Unknown';
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const fn = (sourceFile?.filename || '').toLowerCase();
      convention = fn.includes('chase') ? 'negative' : 'positive';
    }
    
    const isSpendingTxn = isSpending(amount, convention);
    const spendingAmount = calculateSpendingAmount(amount, convention);

    if (!bySourceFile.has(filename)) {
      bySourceFile.set(filename, { count: 0, spendingCount: 0, total: 0 });
    }
    
    const fileData = bySourceFile.get(filename)!;
    fileData.count++;
    if (isSpendingTxn) {
      fileData.spendingCount++;
      fileData.total += spendingAmount;
    }
  });

  console.log(`\n=== BY SOURCE FILE (Top 10) ===\n`);
  const sortedFiles = Array.from(bySourceFile.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  sortedFiles.forEach(([filename, data]) => {
    console.log(`${filename}:`);
    console.log(`  Total Transactions: ${data.count}`);
    console.log(`  Spending Transactions: ${data.spendingCount}`);
    console.log(`  Spending Total: $${data.total.toFixed(2)}\n`);
  });

  console.log(`\n=== SUMMARY ===`);
  console.log(`Database has ${allTransactions.length} total transactions`);
  console.log(`Of which ${spendingTransactions.length} are spending transactions`);
  console.log(`Total spending amount: $${totalSpendingAmount.toFixed(2)}`);
  console.log(`\nApp should show:`);
  console.log(`  - All transactions: ${allTransactions.length}`);
  console.log(`  - Approved spending: ${approvedSpending.length}`);
  console.log(`  - All spending: ${spendingTransactions.length}`);
}

checkDatabaseTotals().catch(console.error);

