'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns, normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';
import { getSummaryMetrics } from './analytics';

/**
 * Compare CSV file totals with what's actually in the database and what the dashboard shows
 */
export async function compareCsvVsDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // CSV files to check
  const csvFiles = [
    { 
      path: '/Users/joshgold/Desktop/transactions/activity.csv', 
      filename: 'activity.csv',
      convention: 'positive' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase2861_Activity20250101_20260101_20260109.CSV', 
      filename: 'Chase2861_Activity20250101_20260101_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase2909_Activity20250101_20251231_20260109.CSV', 
      filename: 'Chase2909_Activity20250101_20251231_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase3887_Activity20250101_20251231_20260109.CSV', 
      filename: 'Chase3887_Activity20250101_20251231_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
  ];

  const results = [];

  // 1. Calculate CSV totals
  let csvTotal = 0;
  let csvTransactionCount = 0;

  for (const file of csvFiles) {
    if (!existsSync(file.path)) {
      continue;
    }

    const content = readFileSync(file.path, 'utf-8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRows = parsed.data as any[];
    const columns = detectColumns(csvRows);
    const normalizationResult = normalizeTransactions(csvRows, columns);

    let fileTotal = 0;
    let fileCount = 0;

    normalizationResult.transactions.forEach((t) => {
      const spendingAmount = calculateSpendingAmount(t.amount, file.convention);
      if (spendingAmount > 0) {
        fileTotal += spendingAmount;
        fileCount++;
      }
    });

    csvTotal += fileTotal;
    csvTransactionCount += fileCount;

    results.push({
      filename: file.filename,
      csvTotal: fileTotal,
      csvCount: fileCount,
    });
  }

  // 2. Get what's in the database (all transactions)
  const { data: allTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false });

  // Calculate database totals
  let dbTotalAll = 0;
  let dbTotalApproved = 0;
  let dbTotalPending = 0;
  let dbCountAll = 0;
  let dbCountApproved = 0;
  let dbCountPending = 0;

  const byFile = new Map<string, {
    filename: string;
    convention: AmountSignConvention | null;
    allTotal: number;
    approvedTotal: number;
    pendingTotal: number;
    allCount: number;
    approvedCount: number;
    pendingCount: number;
  }>();

  allTransactions?.forEach((t: any) => {
    const rawAmount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }

    const spendingAmount = calculateSpendingAmount(rawAmount, convention);
    
    if (spendingAmount > 0) {
      dbTotalAll += spendingAmount;
      dbCountAll++;

      if (t.status === 'approved') {
        dbTotalApproved += spendingAmount;
        dbCountApproved++;
      } else {
        dbTotalPending += spendingAmount;
        dbCountPending++;
      }

      // Track by file
      const filename = sourceFile?.filename || 'unknown';
      if (!byFile.has(filename)) {
        byFile.set(filename, {
          filename,
          convention,
          allTotal: 0,
          approvedTotal: 0,
          pendingTotal: 0,
          allCount: 0,
          approvedCount: 0,
          pendingCount: 0,
        });
      }

      const fileData = byFile.get(filename)!;
      fileData.allTotal += spendingAmount;
      fileData.allCount++;

      if (t.status === 'approved') {
        fileData.approvedTotal += spendingAmount;
        fileData.approvedCount++;
      } else {
        fileData.pendingTotal += spendingAmount;
        fileData.pendingCount++;
      }
    }
  });

  // 3. Get what the dashboard shows (using getSummaryMetrics with default date range)
  const dashboardStartDate = '2020-01-01';
  const dashboardEndDate = new Date().toISOString().split('T')[0];
  
  const dashboardMetrics = await getSummaryMetrics(
    dashboardStartDate,
    dashboardEndDate,
    undefined, // no category filter
    undefined  // no merchant filter
  );

  // 4. Check date ranges
  const { data: dateRange } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .limit(1);

  const { data: dateRangeEnd } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(1);

  const minDate = dateRange?.[0]?.date || null;
  const maxDate = dateRangeEnd?.[0]?.date || null;

  // Count transactions outside dashboard date range
  const { count: outsideDateRangeCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .or(`date.lt.${dashboardStartDate},date.gt.${dashboardEndDate}`);

  return {
    csvTotals: {
      total: csvTotal,
      transactionCount: csvTransactionCount,
      byFile: results,
    },
    databaseTotals: {
      all: {
        total: dbTotalAll,
        count: dbCountAll,
      },
      approved: {
        total: dbTotalApproved,
        count: dbCountApproved,
      },
      pending: {
        total: dbTotalPending,
        count: dbCountPending,
      },
      byFile: Array.from(byFile.values()),
    },
    dashboardMetrics: {
      totalSpent: dashboardMetrics.totalSpent,
      transactionCount: dashboardMetrics.transactionCount,
      dateRange: {
        start: dashboardStartDate,
        end: dashboardEndDate,
      },
    },
    dateInfo: {
      minDateInDb: minDate,
      maxDateInDb: maxDate,
      outsideDateRangeCount: outsideDateRangeCount || 0,
    },
    discrepancies: {
      csvVsDbAll: csvTotal - dbTotalAll,
      csvVsDbApproved: csvTotal - dbTotalApproved,
      csvVsDashboard: csvTotal - dashboardMetrics.totalSpent,
      dbApprovedVsDashboard: dbTotalApproved - dashboardMetrics.totalSpent,
    },
  };
}

