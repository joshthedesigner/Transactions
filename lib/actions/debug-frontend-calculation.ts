'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, calculateTotalSpending, isSpending, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function debugFrontendCalculation() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  // Get transactions exactly as getSummaryMetrics does
  const { data, error } = await supabase
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

  if (error) {
    throw new Error(`Failed to fetch: ${error.message}`);
  }

  // Process exactly as getSummaryMetrics does
  const transactionsWithConvention = (data || []).map((t) => {
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
      filename: (sourceFile?.filename || 'unknown'),
    };
  });

  // Calculate totalSpent exactly as getSummaryMetrics does
  const totalSpent = calculateTotalSpending(transactionsWithConvention);
  
  // Count spending transactions
  const spendingTransactions = transactionsWithConvention.filter(t => 
    isSpending(t.amount, t.convention)
  );
  
  // Check for issues
  const issues: Array<{ type: string; count: number; total: number; transactions: any[] }> = [];
  
  // Check for transactions with null/undefined convention
  const nullConvention = transactionsWithConvention.filter(t => !t.convention);
  if (nullConvention.length > 0) {
    issues.push({
      type: 'null_convention',
      count: nullConvention.length,
      total: calculateTotalSpending(nullConvention),
      transactions: nullConvention.slice(0, 10),
    });
  }
  
  // Check for transactions that might be credits but counted as spending
  const potentialCredits = transactionsWithConvention.filter(t => {
    const spendingAmount = calculateSpendingAmount(t.amount, t.convention);
    return spendingAmount === 0 && t.amount !== 0;
  });
  if (potentialCredits.length > 0) {
    issues.push({
      type: 'credits_included',
      count: potentialCredits.length,
      total: potentialCredits.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      transactions: potentialCredits.slice(0, 10),
    });
  }
  
  // Check for transactions with wrong convention detection
  const wrongConvention: any[] = [];
  transactionsWithConvention.forEach(t => {
    const filename = t.filename.toLowerCase();
    const detectedConvention = filename.includes('chase') ? 'negative' : 'positive';
    if (t.convention !== detectedConvention && t.filename !== 'unknown') {
      wrongConvention.push(t);
    }
  });
  if (wrongConvention.length > 0) {
    issues.push({
      type: 'wrong_convention',
      count: wrongConvention.length,
      total: calculateTotalSpending(wrongConvention),
      transactions: wrongConvention.slice(0, 10),
    });
  }

  // Calculate breakdown by file
  const byFile = new Map<string, { count: number; total: number; spendingCount: number }>();
  transactionsWithConvention.forEach(t => {
    const filename = t.filename || 'unknown';
    if (!byFile.has(filename)) {
      byFile.set(filename, { count: 0, total: 0, spendingCount: 0 });
    }
    const fileData = byFile.get(filename)!;
    fileData.count++;
    const spendingAmount = calculateSpendingAmount(t.amount, t.convention);
    fileData.total += spendingAmount;
    if (spendingAmount > 0) {
      fileData.spendingCount++;
    }
  });

  // Get raw database totals for comparison
  const { data: rawData } = await supabase
    .from('transactions')
    .select('amount, source_file:source_files(id, filename, amount_sign_convention)')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate);

  let rawTotal = 0;
  (rawData || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    const spendingAmount = calculateSpendingAmount(amount, convention);
    rawTotal += spendingAmount;
  });

  return {
    calculation: {
      totalSpent,
      transactionCount: spendingTransactions.length,
      spendingCount: spendingTransactions.length,
      totalTransactions: transactionsWithConvention.length,
    },
    rawTotal,
    difference: Math.abs(totalSpent - rawTotal),
    byFile: Array.from(byFile.entries()).map(([filename, data]) => ({
      filename,
      ...data,
    })),
    issues,
    sampleTransactions: transactionsWithConvention.slice(0, 20).map(t => ({
      amount: t.amount,
      convention: t.convention,
      filename: t.filename,
      spendingAmount: calculateSpendingAmount(t.amount, t.convention),
      isSpending: isSpending(t.amount, t.convention),
    })),
  };
}

