/**
 * Root Cause Diagnosis Script
 * 
 * This script will:
 * 1. Query the database directly
 * 2. Simulate what getSummaryMetrics does
 * 3. Compare with what the charts do
 * 4. Identify the exact discrepancy
 */

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, isSpending, AmountSignConvention } from '@/lib/utils/amount-calculator';

async function diagnoseRootCause() {
  console.log('=== ROOT CAUSE DIAGNOSIS ===\n');
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    console.error('Not authenticated');
    process.exit(1);
  }

  // 1. Get ALL transactions (what getSummaryMetrics does now)
  const { data: allTransactions, error: allError } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      status,
      date,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id);

  if (allError) {
    console.error('Error:', allError);
    process.exit(1);
  }

  console.log(`1. DATABASE TOTALS:`);
  console.log(`   Total transactions in DB: ${allTransactions?.length || 0}\n`);

  // 2. Breakdown by status
  const approved = allTransactions?.filter(t => t.status === 'approved') || [];
  const pending = allTransactions?.filter(t => t.status === 'pending_review') || [];
  
  console.log(`2. BY STATUS:`);
  console.log(`   Approved: ${approved.length}`);
  console.log(`   Pending Review: ${pending.length}\n`);

  // 3. Process with conventions (simulate getSummaryMetrics)
  const transactionsWithConvention = (allTransactions || []).map((t: any) => {
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

  // 4. Count spending vs credits
  const spendingTransactions = transactionsWithConvention.filter(t => t.isSpending);
  const creditTransactions = transactionsWithConvention.filter(t => !t.isSpending);
  
  const approvedSpending = transactionsWithConvention.filter(t => t.status === 'approved' && t.isSpending);
  const pendingSpending = transactionsWithConvention.filter(t => t.status === 'pending_review' && t.isSpending);
  
  console.log(`3. BY TRANSACTION TYPE:`);
  console.log(`   Spending Transactions: ${spendingTransactions.length}`);
  console.log(`   Credit/Refund Transactions: ${creditTransactions.length}\n`);

  console.log(`4. SPENDING BY STATUS:`);
  console.log(`   Approved Spending: ${approvedSpending.length}`);
  console.log(`   Pending Spending: ${pendingSpending.length}\n`);

  // 5. Calculate totals
  const totalSpendingAmount = transactionsWithConvention.reduce((sum, t) => sum + t.spendingAmount, 0);
  const approvedSpendingTotal = approvedSpending.reduce((sum, t) => sum + t.spendingAmount, 0);
  const pendingSpendingTotal = pendingSpending.reduce((sum, t) => sum + t.spendingAmount, 0);

  console.log(`5. SPENDING TOTALS:`);
  console.log(`   All Spending: $${totalSpendingAmount.toFixed(2)}`);
  console.log(`   Approved Spending: $${approvedSpendingTotal.toFixed(2)}`);
  console.log(`   Pending Spending: $${pendingSpendingTotal.toFixed(2)}\n`);

  // 6. Simulate what getSummaryMetrics currently does
  const currentMetricsCount = allTransactions?.length || 0; // Line 415: data.length
  
  // 7. Simulate what charts do (they filter by approved)
  const { data: approvedOnly, error: approvedError } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved');

  const approvedWithConvention = (approvedOnly || []).map((t: any) => {
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
      isSpending: isSpending(amount, convention),
      spendingAmount: calculateSpendingAmount(amount, convention),
    };
  });

  const approvedSpendingOnly = approvedWithConvention.filter(t => t.isSpending);
  const approvedSpendingTotalOnly = approvedWithConvention.reduce((sum, t) => sum + t.spendingAmount, 0);

  console.log(`6. WHAT CHARTS SHOW (approved only):`);
  console.log(`   Approved Transactions: ${approvedOnly?.length || 0}`);
  console.log(`   Approved Spending Transactions: ${approvedSpendingOnly.length}`);
  console.log(`   Approved Spending Total: $${approvedSpendingTotalOnly.toFixed(2)}\n`);

  // 8. ROOT CAUSE ANALYSIS
  console.log(`=== ROOT CAUSE ANALYSIS ===\n`);
  console.log(`Current getSummaryMetrics returns:`);
  console.log(`  transactionCount: ${currentMetricsCount} (ALL transactions, no status filter)`);
  console.log(`  totalSpent: $${totalSpendingAmount.toFixed(2)} (ALL spending, includes pending)\n`);

  console.log(`Charts show (getMonthlySpendByCategory, etc.):`);
  console.log(`  Only approved transactions`);
  console.log(`  Approved spending total: $${approvedSpendingTotalOnly.toFixed(2)}\n`);

  console.log(`DISCREPANCY:`);
  console.log(`  Database has: ${allTransactions?.length || 0} total transactions`);
  console.log(`  getSummaryMetrics counts: ${currentMetricsCount} (should match database)`);
  console.log(`  Charts count: ${approvedOnly?.length || 0} approved transactions`);
  console.log(`  Difference: ${currentMetricsCount - (approvedOnly?.length || 0)} pending transactions\n`);

  console.log(`EXPECTED BEHAVIOR:`);
  console.log(`  If user expects 72,000: That's ALL transactions (approved + pending)`);
  console.log(`  If user expects 62,000: That's APPROVED spending transactions only`);
  console.log(`  Current app shows: ${currentMetricsCount} (all transactions)\n`);

  console.log(`RECOMMENDATION:`);
  if (currentMetricsCount !== (approvedOnly?.length || 0)) {
    console.log(`  The discrepancy is: getSummaryMetrics counts ALL transactions`);
    console.log(`  But charts only show APPROVED transactions`);
    console.log(`  To match charts, getSummaryMetrics should filter by status='approved'`);
    console.log(`  And count only spending transactions (exclude credits)`);
  }
}

// Note: This won't work as a standalone script due to Next.js server context
// But the logic shows what we need to check
console.log('This script needs to be run in a Next.js API route context.');
console.log('Please visit /diagnose-metrics page instead to see the breakdown.');

