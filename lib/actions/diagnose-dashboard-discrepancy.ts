'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function diagnoseDashboardDiscrepancy() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get actual dashboard total
  const { getSummaryMetrics } = await import('./analytics');
  const dashboardMetrics = await getSummaryMetrics('2020-01-01', new Date().toISOString().split('T')[0]);
  const dashboardShows = dashboardMetrics.totalSpent;
  
  // Expected CSV files and their totals
  const expectedFiles = [
    { filename: 'activity.csv', total: 45647.76 },
    { filename: 'Chase2861_Activity20250101_20260101_20260109.CSV', total: 15774.72 },
    { filename: 'Chase2909_Activity20250101_20251231_20260109.CSV', total: 10151.31 },
    { filename: 'Chase3887_Activity20250101_20251231_20260109.CSV', total: 19606.22 },
  ];
  const csvTotal = 91180.01; // Sum of all 4 files
  const portalTotal = 68624.15; // User's portal total

  // Get all source files to see what's uploaded
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  // Check which expected files are missing
  const uploadedFilenames = (sourceFiles || []).map(f => f.filename.toLowerCase());
  const missingFiles = expectedFiles.filter(expected => {
    const expectedLower = expected.filename.toLowerCase();
    // Check for exact match or partial match (filename might be sanitized)
    return !uploadedFilenames.some(uploaded => {
      const uploadedBase = uploaded.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
      const expectedBase = expectedLower.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
      return uploaded === expectedLower || 
             uploaded.includes(expectedBase) || 
             expectedBase.includes(uploadedBase);
    });
  });

  // Get ALL transactions (no filters)
  const { data: allTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id);

  // Get APPROVED transactions only (what dashboard shows)
  const { data: approvedTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved');

  // Calculate totals
  let allSpendingTotal = 0;
  let allPendingTotal = 0;
  let allCreditTotal = 0;
  let allPendingCount = 0;
  let allCreditCount = 0;

  let approvedSpendingTotal = 0;
  let approvedCreditTotal = 0;
  let approvedSpendingCount = 0;
  let approvedCreditCount = 0;

  (allTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    
    if (spendingAmount > 0) {
      if (t.status === 'approved') {
        allSpendingTotal += spendingAmount;
        approvedSpendingTotal += spendingAmount;
        approvedSpendingCount++;
      } else {
        allPendingTotal += spendingAmount;
        allPendingCount++;
      }
    } else {
      allCreditTotal += Math.abs(amount);
      allCreditCount++;
      if (t.status === 'approved') {
        approvedCreditTotal += Math.abs(amount);
        approvedCreditCount++;
      }
    }
  });

  // Get transactions filtered by date (dashboard default: 2020-01-01 to today)
  const today = new Date().toISOString().split('T')[0];
  const { data: dateFilteredTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', '2020-01-01')
    .lte('date', today);

  let dateFilteredTotal = 0;
  let dateFilteredCount = 0;
  const outsideDateRange: Array<{ date: string; amount: number; merchant: string }> = [];

  (dateFilteredTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      dateFilteredTotal += spendingAmount;
      dateFilteredCount++;
    }
  });

  // Find transactions outside date range
  (approvedTransactions || []).forEach((t: any) => {
    const transactionDate = new Date(t.date);
    const startDate = new Date('2020-01-01');
    const endDate = new Date(today);
    
    if (transactionDate < startDate || transactionDate > endDate) {
      const amount = Number(t.amount);
      const sourceFile = t.source_file;
      let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
      
      if (!convention) {
        const filename = (sourceFile?.filename || '').toLowerCase();
        convention = filename.includes('chase') ? 'negative' : 'positive';
      }
      
      const spendingAmount = calculateSpendingAmount(amount, convention);
      if (spendingAmount > 0) {
        outsideDateRange.push({
          date: t.date,
          amount: spendingAmount,
          merchant: (t as any).merchant_raw || 'Unknown',
        });
      }
    }
  });

  const outsideDateRangeTotal = outsideDateRange.reduce((sum, t) => sum + t.amount, 0);

  // Count transactions by source file
  const bySourceFile = new Map<string, {
    filename: string;
    total: number;
    approved: number;
    pending: number;
    totalAmount: number;
    approvedAmount: number;
    pendingAmount: number;
  }>();

  (allTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    const filename = sourceFile?.filename || 'unknown';
    
    if (!bySourceFile.has(filename)) {
      bySourceFile.set(filename, {
        filename,
        total: 0,
        approved: 0,
        pending: 0,
        totalAmount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
      });
    }

    const fileData = bySourceFile.get(filename)!;
    fileData.total++;
    fileData.totalAmount += Math.abs(amount);

    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    if (!convention) {
      const fn = filename.toLowerCase();
      convention = fn.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    
    if (spendingAmount > 0) {
      if (t.status === 'approved') {
        fileData.approved++;
        fileData.approvedAmount += spendingAmount;
      } else {
        fileData.pending++;
        fileData.pendingAmount += spendingAmount;
      }
    }
  });

  // Calculate missing file totals
  const missingFilesTotal = missingFiles.reduce((sum, f) => sum + f.total, 0);
  const uploadedFilesTotal = expectedFiles
    .filter(f => !missingFiles.some(m => m.filename === f.filename))
    .reduce((sum, f) => sum + f.total, 0);

  return {
    csvTotal,
    portalTotal,
    dashboardShows,
    expectedFiles,
    sourceFiles: sourceFiles || [],
    missingFiles: missingFiles.map(f => ({
      filename: f.filename,
      expectedTotal: f.total,
    })),
    missingFilesTotal,
    uploadedFilesTotal,
    database: {
      allSpendingTotal,
      allPendingTotal,
      allCreditTotal,
      allPendingCount,
      allCreditCount,
    },
    dashboard: {
      approvedSpendingTotal,
      approvedSpendingCount,
      dateFilteredTotal,
      dateFilteredCount,
    },
    discrepancies: {
      csvVsDb: csvTotal - (allSpendingTotal + allPendingTotal),
      csvVsDashboard: csvTotal - dashboardShows,
      missingFromDB: portalTotal - (allSpendingTotal + allPendingTotal),
      filteredByStatus: allPendingTotal,
      filteredByDate: outsideDateRangeTotal,
      totalMissingFromDashboard: portalTotal - dashboardShows,
    },
    bySourceFile: Array.from(bySourceFile.values()),
    outsideDateRange: {
      count: outsideDateRange.length,
      total: outsideDateRangeTotal,
      transactions: outsideDateRange.slice(0, 50), // First 50
    },
  };
}

