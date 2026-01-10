'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Check what the dashboard is actually querying vs what's in the database
 */
export async function checkDashboardQuery() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  // Query exactly as getSummaryMetrics does
  const { data: queryResult, error } = await supabase
    .from('transactions')
    .select(`
      amount,
      category_id,
      status,
      date,
      merchant_normalized,
      category:categories(id, name),
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) {
    throw new Error(`Query error: ${error.message}`);
  }

  // Calculate exactly as getSummaryMetrics does
  const transactionsWithConvention = (queryResult || []).map((t) => {
    const amount = Number(t.amount);
    const sourceFile = (t as any).source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    return {
      amount,
      convention,
      date: t.date,
      merchant: t.merchant_normalized,
      categoryId: t.category_id,
      filename: (sourceFile?.filename || 'unknown'),
    };
  });

  // Calculate totals
  let totalSpent = 0;
  let spendingCount = 0;
  let creditCount = 0;
  const spendingTransactions: any[] = [];
  const creditTransactions: any[] = [];

  transactionsWithConvention.forEach(t => {
    const spendingAmount = calculateSpendingAmount(t.amount, t.convention);
    if (spendingAmount > 0) {
      totalSpent += spendingAmount;
      spendingCount++;
      spendingTransactions.push({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        spendingAmount,
        convention: t.convention,
        filename: t.filename,
      });
    } else if (t.amount !== 0) {
      creditCount++;
      creditTransactions.push({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        convention: t.convention,
        filename: t.filename,
      });
    }
  });

  // Get ALL approved transactions (no date filter) for comparison
  const { data: allApproved } = await supabase
    .from('transactions')
    .select('amount, date, source_file:source_files(id, filename, amount_sign_convention)')
    .eq('user_id', user.id)
    .eq('status', 'approved');

  let allApprovedTotal = 0;
  (allApproved || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      allApprovedTotal += spendingAmount;
    }
  });

  // Check for transactions outside date range
  const outsideDateRange = (allApproved || []).filter((t: any) => {
    const transactionDate = new Date(t.date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return transactionDate < start || transactionDate > end;
  });

  let outsideDateRangeTotal = 0;
  outsideDateRange.forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      outsideDateRangeTotal += spendingAmount;
    }
  });

  return {
    query: {
      startDate,
      endDate,
      status: 'approved',
      filters: 'date range only',
    },
    results: {
      totalSpent,
      spendingCount,
      creditCount,
      totalTransactions: queryResult?.length || 0,
    },
    comparison: {
      allApprovedTotal,
      dateFilteredTotal: totalSpent,
      outsideDateRangeTotal,
      difference: allApprovedTotal - totalSpent,
    },
    breakdown: {
      spendingTransactions: spendingTransactions.slice(0, 50),
      creditTransactions: creditTransactions.slice(0, 20),
    },
  };
}

