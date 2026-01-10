'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Check the status of Chase2861 transactions
 */
export async function checkChase2861Status() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Find the most recent Chase2861 source file
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename, amount_sign_convention')
    .eq('user_id', user.id)
    .ilike('filename', '%Chase2861_Activity20250101_20260101_20260109%')
    .order('uploaded_at', { ascending: false })
    .limit(1);

  if (!sourceFiles || sourceFiles.length === 0) {
    return { error: 'No Chase2861 file found' };
  }

  const file = sourceFiles[0];
  const convention = (file.amount_sign_convention || 'negative') as AmountSignConvention;

  // Get all transactions for this file
  const { data: transactions, count } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      merchant_normalized,
      amount,
      status,
      category_id,
      confidence_score
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .eq('source_file_id', file.id)
    .order('date', { ascending: false });

  // Calculate totals by status
  let approvedTotal = 0;
  let approvedCount = 0;
  let pendingTotal = 0;
  let pendingCount = 0;
  
  const statusBreakdown: Record<string, { count: number; total: number }> = {};
  
  (transactions || []).forEach((t: any) => {
    const spendingAmount = calculateSpendingAmount(Number(t.amount), convention);
    if (spendingAmount > 0) {
      const status = t.status || 'unknown';
      if (!statusBreakdown[status]) {
        statusBreakdown[status] = { count: 0, total: 0 };
      }
      statusBreakdown[status].count++;
      statusBreakdown[status].total += spendingAmount;
      
      if (t.status === 'approved') {
        approvedTotal += spendingAmount;
        approvedCount++;
      } else {
        pendingTotal += spendingAmount;
        pendingCount++;
      }
    }
  });

  // Sample transactions by status
  const approvedSamples = (transactions || []).filter((t: any) => t.status === 'approved').slice(0, 5);
  const pendingSamples = (transactions || []).filter((t: any) => t.status === 'pending_review').slice(0, 5);

  return {
    sourceFile: {
      id: file.id,
      filename: file.filename,
      convention: file.amount_sign_convention,
    },
    totalTransactions: count || 0,
    statusBreakdown,
    summary: {
      approvedCount,
      approvedTotal,
      pendingCount,
      pendingTotal,
    },
    approvedSamples: approvedSamples.map((t: any) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant_normalized,
      amount: Number(t.amount),
      spendingAmount: calculateSpendingAmount(Number(t.amount), convention),
      confidence: t.confidence_score,
    })),
    pendingSamples: pendingSamples.map((t: any) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant_normalized,
      amount: Number(t.amount),
      spendingAmount: calculateSpendingAmount(Number(t.amount), convention),
      confidence: t.confidence_score,
    })),
  };
}
