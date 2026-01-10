'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Get raw totals from database - no calculations, just what's actually stored
 */
export async function getRawDbTotals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get ALL transactions - no filters, no calculations
  // Supabase defaults to 1000 rows, so we need to explicitly set a high limit
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
    .limit(100000); // Set high limit to get all transactions

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

  // Get date range
  const dates = (allTransactions || []).map(t => t.date).filter(Boolean).sort();
  const dateRange = dates.length > 0 ? {
    min: dates[0],
    max: dates[dates.length - 1],
  } : null;

  // Sample transactions
  const positiveSamples = (allTransactions || [])
    .filter((t: any) => Number(t.amount) > 0)
    .slice(0, 10)
    .map((t: any) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant_raw,
      amount: Number(t.amount),
      status: t.status,
      filename: t.source_file?.filename,
    }));

  const negativeSamples = (allTransactions || [])
    .filter((t: any) => Number(t.amount) < 0)
    .slice(0, 10)
    .map((t: any) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant_raw,
      amount: Number(t.amount),
      status: t.status,
      filename: t.source_file?.filename,
    }));

  return {
    summary: {
      totalTransactions: totalCount || 0,
      rawTotal,
      rawPositiveTotal,
      rawNegativeTotal,
      zeroCount,
      dateRange,
    },
    byStatus: Object.entries(byStatus).map(([status, data]) => ({
      status,
      ...data,
    })),
    byFile: Object.entries(byFile).map(([filename, data]) => ({
      filename,
      ...data,
    })),
    samples: {
      positive: positiveSamples,
      negative: negativeSamples,
    },
  };
}

