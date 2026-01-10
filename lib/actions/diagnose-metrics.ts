'use server';

import { createClient } from '@/lib/supabase/server';

export async function diagnoseMetricsDiscrepancy(
  startDate?: string,
  endDate?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all transactions with source file info
  let query = supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      merchant_raw,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: true });

  if (startDate) {
    query = query.gte('date', startDate);
  }

  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { data: transactions, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  if (!transactions) {
    return {
      totalTransactions: 0,
      approvedCount: 0,
      pendingCount: 0,
      spendingCount: 0,
      creditCount: 0,
      byMonth: [],
      bySourceFile: [],
      calculation: {
        chaseTotal: 0,
        otherTotal: 0,
        grandTotal: 0,
      },
    };
  }

  // Count by status
  const approvedCount = transactions.filter((t: any) => t.status === 'approved').length;
  const pendingCount = transactions.filter((t: any) => t.status === 'pending_review').length;

  // Group by month
  const byMonth = new Map<string, {
    count: number;
    chaseTotal: number;
    otherTotal: number;
    total: number;
  }>();

  // Group by source file
  const bySourceFile = new Map<string, {
    count: number;
    positiveCount: number;
    negativeCount: number;
    positiveTotal: number;
    negativeTotal: number;
    calculatedTotal: number;
  }>();

  let chaseTotal = 0;
  let otherTotal = 0;
  let spendingCount = 0;
  let creditCount = 0;

  transactions.forEach((t: any) => {
    const amount = Number(t.amount);
    const filename = t.source_file?.filename?.toLowerCase() || 'unknown';
    const isChase = filename.includes('chase');
    const date = new Date(t.date);
    const month = date.getMonth() + 1;
    const monthKey = `${date.getFullYear()}-${month < 10 ? '0' : ''}${month}`;

    // Monthly breakdown
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, { count: 0, chaseTotal: 0, otherTotal: 0, total: 0 });
    }
    const monthData = byMonth.get(monthKey)!;
    monthData.count++;

    // Source file breakdown
    const fileKey = t.source_file?.filename || 'unknown';
    if (!bySourceFile.has(fileKey)) {
      bySourceFile.set(fileKey, {
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        positiveTotal: 0,
        negativeTotal: 0,
        calculatedTotal: 0,
      });
    }
    const fileData = bySourceFile.get(fileKey)!;
    fileData.count++;

    // Calculate spending based on file type
    if (isChase) {
      // Chase: negative = spending
      if (amount < 0) {
        const spending = Math.abs(amount);
        chaseTotal += spending;
        monthData.chaseTotal += spending;
        monthData.total += spending;
        fileData.negativeCount++;
        fileData.negativeTotal += spending;
        fileData.calculatedTotal += spending;
        spendingCount++;
      } else {
        fileData.positiveCount++;
        fileData.positiveTotal += amount;
        creditCount++;
      }
    } else {
      // Other files: positive = spending
      if (amount > 0) {
        otherTotal += amount;
        monthData.otherTotal += amount;
        monthData.total += amount;
        fileData.positiveCount++;
        fileData.positiveTotal += amount;
        fileData.calculatedTotal += amount;
        spendingCount++;
      } else {
        fileData.negativeCount++;
        fileData.negativeTotal += Math.abs(amount);
        creditCount++;
      }
    }
  });

  return {
    dateRange: {
      start: startDate || 'all',
      end: endDate || 'all',
    },
    totalTransactions: transactions.length,
    approvedCount,
    pendingCount,
    spendingCount,
    creditCount,
    byMonth: Array.from(byMonth.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    bySourceFile: Array.from(bySourceFile.entries())
      .map(([filename, data]) => ({ filename, ...data })),
    calculation: {
      chaseTotal,
      otherTotal,
      grandTotal: chaseTotal + otherTotal,
    },
    sampleTransactions: transactions.slice(0, 20).map((t: any) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant_raw,
      amount: Number(t.amount),
      filename: t.source_file?.filename || 'unknown',
      isChase: (t.source_file?.filename?.toLowerCase() || '').includes('chase'),
    })),
  };
}

