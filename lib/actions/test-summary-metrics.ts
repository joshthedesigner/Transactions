'use server';

import { getSummaryMetrics } from './analytics';
import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function testSummaryMetrics() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  // Call getSummaryMetrics exactly as the frontend does
  const metrics = await getSummaryMetrics(startDate, endDate);

  // Get raw database data to compare
  const { data: dbData } = await supabase
    .from('transactions')
    .select(`
      amount,
      status,
      date,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate);

  // Calculate manually
  let manualTotal = 0;
  let manualCount = 0;
  const byFile = new Map<string, { count: number; total: number }>();

  (dbData || []).forEach((t: any) => {
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
        byFile.set(filename, { count: 0, total: 0 });
      }
      const fileData = byFile.get(filename)!;
      fileData.count++;
      fileData.total += spendingAmount;
    }
  });

  return {
    getSummaryMetricsResult: {
      totalSpent: metrics.totalSpent,
      transactionCount: metrics.transactionCount,
    },
    manualCalculation: {
      totalSpent: manualTotal,
      transactionCount: manualCount,
    },
    difference: {
      totalSpent: Math.abs(metrics.totalSpent - manualTotal),
      transactionCount: Math.abs(metrics.transactionCount - manualCount),
    },
    byFile: Array.from(byFile.entries()).map(([filename, data]) => ({
      filename,
      ...data,
    })),
    dbTransactionCount: dbData?.length || 0,
  };
}

