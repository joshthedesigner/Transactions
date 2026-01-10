'use server';

import { createClient } from '@/lib/supabase/server';
import { getSummaryMetrics } from './analytics';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Debug what getSummaryMetrics is actually returning vs what's in the database
 */
export async function debugSummaryMetrics() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  // Call getSummaryMetrics exactly as the dashboard does
  const metrics = await getSummaryMetrics(startDate, endDate);

  // Get all approved transactions in the date range (EXACT same query as getSummaryMetrics)
  const { data: allApproved } = await supabase
    .from('transactions')
    .select(`
      amount,
      category_id,
      status,
      category:categories(id, name),
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate);

  // Also get with date for debugging
  const { data: allApprovedWithDate } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      merchant_normalized,
      status,
      category_id,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  // Calculate manually using EXACT same data structure as getSummaryMetrics
  let manualTotalExact = 0;
  let manualCountExact = 0;
  
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
      manualTotalExact += spendingAmount;
      manualCountExact++;
    }
  });

  // Calculate manually with date info for debugging
  let manualTotal = 0;
  let manualCount = 0;
  const byFile = new Map<string, { count: number; total: number; transactions: any[] }>();

  (allApprovedWithDate || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      manualTotal += spendingAmount;
      manualCount++;
      
      const filename = sourceFile?.filename || 'unknown';
      if (!byFile.has(filename)) {
        byFile.set(filename, { count: 0, total: 0, transactions: [] });
      }
      const fileData = byFile.get(filename)!;
      fileData.count++;
      fileData.total += spendingAmount;
      fileData.transactions.push({
        id: t.id,
        date: t.date,
        merchant: t.merchant_normalized,
        amount,
        spendingAmount,
        convention,
      });
    }
  });

  // Check for transactions with missing source_file
  const transactionsWithoutSourceFile = (allApproved || []).filter((t: any) => !t.source_file);
  const transactionsWithNullConvention = (allApproved || []).filter((t: any) => {
    const sourceFile = t.source_file;
    const convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      return !filename.includes('chase') && !filename.includes('activity');
    }
    return false;
  });

  // Find Chase2861 transactions specifically
  const chase2861Transactions = (allApprovedWithDate || []).filter((t: any) => {
    const filename = (t.source_file?.filename || '').toLowerCase();
    return filename.includes('chase2861');
  });

  let chase2861Total = 0;
  let chase2861Count = 0;
  chase2861Transactions.forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      convention = 'negative'; // Chase files default to negative
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      chase2861Total += spendingAmount;
      chase2861Count++;
    }
  });

  return {
    getSummaryMetricsResult: {
      totalSpent: metrics.totalSpent,
      transactionCount: metrics.transactionCount,
    },
    manualCalculationExact: {
      totalSpent: manualTotalExact,
      transactionCount: manualCountExact,
      queryCount: allApproved?.length || 0,
    },
    manualCalculation: {
      totalSpent: manualTotal,
      transactionCount: manualCount,
    },
    chase2861: {
      count: chase2861Count,
      total: chase2861Total,
      transactions: chase2861Transactions.slice(0, 10).map((t: any) => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant_normalized,
        amount: Number(t.amount),
        filename: t.source_file?.filename,
        convention: t.source_file?.amount_sign_convention,
      })),
    },
    byFile: Array.from(byFile.entries()).map(([filename, data]) => ({
      filename,
      count: data.count,
      total: data.total,
      sampleTransactions: data.transactions.slice(0, 3),
    })),
    discrepancy: {
      totalDifference: metrics.totalSpent - manualTotal,
      countDifference: metrics.transactionCount - manualCount,
    },
    queryInfo: {
      startDate,
      endDate,
      totalApprovedTransactions: allApproved?.length || 0,
      transactionsWithoutSourceFile: transactionsWithoutSourceFile.length,
      transactionsWithNullConvention: transactionsWithNullConvention.length,
      sampleWithoutSourceFile: transactionsWithoutSourceFile.slice(0, 5).map((t: any) => ({
        amount: Number(t.amount),
        status: t.status,
      })),
    },
  };
}

