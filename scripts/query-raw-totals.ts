import { createClient } from '@/lib/supabase/server';

async function queryRawTotals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get ALL transactions - no filters, no calculations
  const { data: allTransactions, count: totalCount } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      merchant_raw,
      source_file:source_files(id, filename, amount_sign_convention)
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .limit(100000);

  // Calculate raw totals - just sum the amounts as stored
  let rawTotal = 0;
  let rawPositiveTotal = 0;
  let rawNegativeTotal = 0;
  let zeroCount = 0;

  const byStatus: Record<string, { count: number; rawTotal: number; positiveTotal: number; negativeTotal: number }> = {};
  const byFile: Record<string, { count: number; rawTotal: number; positiveTotal: number; negativeTotal: number; convention: string | null }> = {};

  (allTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    rawTotal += amount;
    
    if (amount > 0) {
      rawPositiveTotal += amount;
    } else if (amount < 0) {
      rawNegativeTotal += amount;
    } else {
      zeroCount++;
    }

    // By status
    const status = t.status || 'unknown';
    if (!byStatus[status]) {
      byStatus[status] = { count: 0, rawTotal: 0, positiveTotal: 0, negativeTotal: 0 };
    }
    byStatus[status].count++;
    byStatus[status].rawTotal += amount;
    if (amount > 0) {
      byStatus[status].positiveTotal += amount;
    } else if (amount < 0) {
      byStatus[status].negativeTotal += amount;
    }

    // By file
    const filename = t.source_file?.filename || 'unknown';
    const convention = t.source_file?.amount_sign_convention || null;
    if (!byFile[filename]) {
      byFile[filename] = { count: 0, rawTotal: 0, positiveTotal: 0, negativeTotal: 0, convention };
    }
    byFile[filename].count++;
    byFile[filename].rawTotal += amount;
    if (amount > 0) {
      byFile[filename].positiveTotal += amount;
    } else if (amount < 0) {
      byFile[filename].negativeTotal += amount;
    }
  });

  console.log('=== RAW DATABASE TOTALS ===\n');
  console.log('Total Transactions:', totalCount || 0);
  console.log('Raw Total (sum of all amounts):', rawTotal.toFixed(2));
  console.log('Positive amounts only:', rawPositiveTotal.toFixed(2));
  console.log('Negative amounts only:', rawNegativeTotal.toFixed(2));
  console.log('Zero amounts:', zeroCount);
  console.log('\n=== BY STATUS ===');
  Object.entries(byStatus).forEach(([status, data]) => {
    console.log(`${status}: ${data.count} transactions = ${data.rawTotal.toFixed(2)}`);
    console.log(`  Positive: ${data.positiveTotal.toFixed(2)} | Negative: ${data.negativeTotal.toFixed(2)}`);
  });
  console.log('\n=== BY FILE ===');
  Object.entries(byFile)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([filename, data]) => {
      console.log(`${filename}:`);
      console.log(`  Convention: ${data.convention || 'null'}`);
      console.log(`  Count: ${data.count} transactions`);
      console.log(`  Raw Total: ${data.rawTotal.toFixed(2)}`);
      console.log(`  Positive: ${data.positiveTotal.toFixed(2)} | Negative: ${data.negativeTotal.toFixed(2)}`);
    });
}

queryRawTotals().catch(console.error);

