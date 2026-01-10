/**
 * Diagnostic script to analyze transaction data discrepancies
 * Run with: npx tsx scripts/diagnose-discrepancy.ts
 */

import { createClient } from '../lib/supabase/server';

async function diagnose() {
  console.log('\n' + '='.repeat(70));
  console.log('TRANSACTION DATA DIAGNOSIS');
  console.log('='.repeat(70) + '\n');

  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('❌ Not authenticated');
    process.exit(1);
  }

  console.log(`✅ Authenticated as user: ${user.id}\n`);

  // 1. Get date range of all transactions
  console.log('📅 DATE RANGE ANALYSIS');
  console.log('-'.repeat(70));
  
  const { data: dateRange, error: dateError } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .limit(1);

  const { data: latestDate, error: latestError } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(1);

  if (dateError || latestError) {
    console.error('❌ Error fetching date range:', dateError || latestError);
  } else {
    const earliest = dateRange?.[0]?.date;
    const latest = latestDate?.[0]?.date;
    console.log(`  Earliest transaction: ${earliest}`);
    console.log(`  Latest transaction: ${latest}`);
    
    if (earliest && latest) {
      const earliestDate = new Date(earliest);
      const latestDate = new Date(latest);
      const monthsDiff = (latestDate.getFullYear() - earliestDate.getFullYear()) * 12 + 
                        (latestDate.getMonth() - earliestDate.getMonth());
      console.log(`  Date range: ${monthsDiff} months\n`);
    }
  }

  // 2. Get transaction counts and totals by source file
  console.log('📊 TRANSACTION BREAKDOWN BY SOURCE FILE');
  console.log('-'.repeat(70));

  const { data: transactions, error: transError } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      merchant_raw,
      source_file:source_files(id, filename)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: true });

  if (transError) {
    console.error('❌ Error fetching transactions:', transError);
    process.exit(1);
  }

  if (!transactions || transactions.length === 0) {
    console.log('  No transactions found');
    process.exit(0);
  }

  // Group by source file
  const byFile = new Map<string, {
    count: number;
    positiveCount: number;
    negativeCount: number;
    positiveTotal: number;
    negativeTotal: number;
    absoluteTotal: number;
    dates: { min: string; max: string };
  }>();

  transactions.forEach((t: any) => {
    const filename = t.source_file?.filename || 'NO_FILENAME';
    const amount = Number(t.amount);
    
    if (!byFile.has(filename)) {
      byFile.set(filename, {
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        positiveTotal: 0,
        negativeTotal: 0,
        absoluteTotal: 0,
        dates: { min: t.date, max: t.date },
      });
    }

    const fileData = byFile.get(filename)!;
    fileData.count++;
    fileData.absoluteTotal += Math.abs(amount);
    
    if (amount > 0) {
      fileData.positiveCount++;
      fileData.positiveTotal += amount;
    } else {
      fileData.negativeCount++;
      fileData.negativeTotal += Math.abs(amount);
    }

    if (t.date < fileData.dates.min) fileData.dates.min = t.date;
    if (t.date > fileData.dates.max) fileData.dates.max = t.date;
  });

  // Print breakdown
  let grandTotal = 0;
  let grandCount = 0;

  byFile.forEach((data, filename) => {
    console.log(`\n  📄 ${filename}`);
    console.log(`     Transactions: ${data.count}`);
    console.log(`     Date range: ${data.dates.min} to ${data.dates.max}`);
    console.log(`     Positive: ${data.positiveCount} transactions = $${data.positiveTotal.toFixed(2)}`);
    console.log(`     Negative: ${data.negativeCount} transactions = $${data.negativeTotal.toFixed(2)}`);
    console.log(`     Absolute total: $${data.absoluteTotal.toFixed(2)}`);
    
    // Determine expected spending based on file type
    if (filename.toLowerCase().includes('chase')) {
      console.log(`     Expected spending (Chase): $${data.negativeTotal.toFixed(2)} (negative amounts)`);
      grandTotal += data.negativeTotal;
    } else {
      console.log(`     Expected spending (Other): $${data.positiveTotal.toFixed(2)} (positive amounts)`);
      grandTotal += data.positiveTotal;
    }
    
    grandCount += data.count;
  });

  console.log('\n' + '-'.repeat(70));
  console.log(`  TOTAL: ${grandCount} transactions, $${grandTotal.toFixed(2)} expected spending\n`);

  // 3. Analyze activity.csv negative amounts specifically
  console.log('🔍 ACTIVITY.CSV NEGATIVE AMOUNTS ANALYSIS');
  console.log('-'.repeat(70));

  const activityTransactions = transactions.filter((t: any) => 
    t.source_file?.filename?.toLowerCase().includes('activity.csv')
  );

  const negativeActivity = activityTransactions.filter((t: any) => Number(t.amount) < 0);
  
  if (negativeActivity.length > 0) {
    console.log(`  Found ${negativeActivity.length} negative transactions in activity.csv`);
    console.log(`  Total negative amount: $${negativeActivity.reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0).toFixed(2)}`);
    
    // Sample some negative transactions
    console.log('\n  Sample negative transactions (first 10):');
    negativeActivity.slice(0, 10).forEach((t: any) => {
      console.log(`    ${t.date} | ${t.merchant_raw} | $${Number(t.amount).toFixed(2)}`);
    });
    
    // Check if they look like credits/refunds
    const creditKeywords = ['refund', 'credit', 'return', 'payment', 'deposit', 'transfer'];
    const creditCount = negativeActivity.filter((t: any) => 
      creditKeywords.some(keyword => t.merchant_raw.toLowerCase().includes(keyword))
    ).length;
    
    console.log(`\n  Transactions with credit/refund keywords: ${creditCount}/${negativeActivity.length}`);
  } else {
    console.log('  No negative transactions found in activity.csv');
  }

  // 4. Compare with expected totals
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total transactions in database: ${grandCount}`);
  console.log(`  Expected total spending: $${grandTotal.toFixed(2)}`);
  console.log(`  Current calculation (from metrics): Check app for current value`);
  console.log('\n  💡 Next steps:');
  console.log('     1. Verify date range in Analytics component covers all transactions');
  console.log('     2. Check if negative amounts in activity.csv are credits (should exclude)');
  console.log('     3. Verify Chase transactions are all negative (as expected)');
  console.log('='.repeat(70) + '\n');
}

diagnose().catch(console.error);




