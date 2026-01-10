'use server';

import { createClient } from '@/lib/supabase/server';

export type DiagnosisResult = {
  dateRange: {
    earliest: string | null;
    latest: string | null;
    monthsDiff: number | null;
  };
  byFile: Array<{
    filename: string;
    count: number;
    positiveCount: number;
    negativeCount: number;
    positiveTotal: number;
    negativeTotal: number;
    absoluteTotal: number;
    dates: { min: string; max: string };
  }>;
  grandTotal: number;
  grandCount: number;
  activityNegative: {
    count: number;
    total: number;
    samples: Array<{ date: string; merchant: string; amount: number }>;
    creditKeywordCount: number;
  };
};

export async function diagnoseTransactions(): Promise<DiagnosisResult> {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // 1. Get date range
  const { data: dateRange } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .limit(1);

  const { data: latestDate } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(1);

  const earliest = dateRange?.[0]?.date || null;
  const latest = latestDate?.[0]?.date || null;
  let monthsDiff: number | null = null;
  
  if (earliest && latest) {
    const earliestDate = new Date(earliest);
    const latestDate = new Date(latest);
    monthsDiff = (latestDate.getFullYear() - earliestDate.getFullYear()) * 12 + 
                 (latestDate.getMonth() - earliestDate.getMonth());
  }

  // 2. Get all transactions with source files
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

  if (transError || !transactions) {
    throw new Error(`Failed to fetch transactions: ${transError?.message}`);
  }

  // Group by source file
  const byFileMap = new Map<string, {
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
    
    if (!byFileMap.has(filename)) {
      byFileMap.set(filename, {
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        positiveTotal: 0,
        negativeTotal: 0,
        absoluteTotal: 0,
        dates: { min: t.date, max: t.date },
      });
    }

    const fileData = byFileMap.get(filename)!;
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

  // Convert to array
  const byFile = Array.from(byFileMap.entries()).map(([filename, data]) => ({
    filename,
    ...data,
  }));

  // Calculate grand total (Chase = negative, Other = positive)
  let grandTotal = 0;
  byFile.forEach((file) => {
    if (file.filename.toLowerCase().includes('chase')) {
      grandTotal += file.negativeTotal;
    } else {
      grandTotal += file.positiveTotal;
    }
  });

  // 3. Analyze activity.csv negative amounts
  const activityTransactions = transactions.filter((t: any) => 
    t.source_file?.filename?.toLowerCase().includes('activity.csv')
  );

  const negativeActivity = activityTransactions.filter((t: any) => Number(t.amount) < 0);
  
  const creditKeywords = ['refund', 'credit', 'return', 'payment', 'deposit', 'transfer'];
  const creditKeywordCount = negativeActivity.filter((t: any) => 
    creditKeywords.some(keyword => t.merchant_raw.toLowerCase().includes(keyword))
  ).length;

  const activityNegative = {
    count: negativeActivity.length,
    total: negativeActivity.reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0),
    samples: negativeActivity.slice(0, 10).map((t: any) => ({
      date: t.date,
      merchant: t.merchant_raw,
      amount: Number(t.amount),
    })),
    creditKeywordCount,
  };

  return {
    dateRange: {
      earliest,
      latest,
      monthsDiff,
    },
    byFile,
    grandTotal,
    grandCount: transactions.length,
    activityNegative,
  };
}




