'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export type DiscrepancyTransaction = {
  date: string;
  merchant: string;
  amount: number;
  csvAmount: number;
  dbAmount: number | null;
  status: 'missing' | 'pending' | 'credit_mismatch' | 'date_filtered';
  reason: string;
  rawRow: any;
};

export async function findDiscrepancyTransactions(): Promise<{
  byFile: Array<{
    filename: string;
    csvExpenseTotal: number;
    dbApprovedTotal: number;
    dbPendingTotal: number;
    discrepancy: number;
    missingTransactions: DiscrepancyTransaction[];
    pendingTransactions: DiscrepancyTransaction[];
    creditMismatchTransactions: DiscrepancyTransaction[];
  }>;
  summary: {
    totalCsvExpenses: number;
    totalDbApproved: number;
    totalDbPending: number;
    totalDiscrepancy: number;
    missingCount: number;
    pendingCount: number;
    creditMismatchCount: number;
  };
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const csvFiles = [
    { path: '/Users/joshgold/Downloads/Chase2861_Activity20250101_20260101_20260109.CSV', filename: 'Chase2861_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase3126_Activity20250101_20260101_20260109.CSV', filename: 'Chase3126_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase1462_Activity20250101_20260101_20260109.CSV', filename: 'Chase1462_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/activity.csv', filename: 'activity.csv' },
  ];

  const results = [];

  for (const file of csvFiles) {
    if (!existsSync(file.path)) {
      continue;
    }

    // Parse CSV
    const content = readFileSync(file.path, 'utf-8');
    const result = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRows = result.data as any[];
    const columns = detectColumns(csvRows);
    const normalizationResult = normalizeTransactions(csvRows, columns);
    
    // Calculate CSV totals
    const isChase = file.filename.toLowerCase().includes('chase');
    const convention: AmountSignConvention = isChase ? 'negative' : 'positive';
    
    // Get CSV expense transactions
    const csvExpenseTransactions: Array<{
      date: string;
      merchant: string;
      amount: number;
      spendingAmount: number;
      rawRow: any;
    }> = [];
    
    let csvExpenseTotal = 0;
    
    normalizationResult.transactions.forEach((t, index) => {
      const spendingAmount = calculateSpendingAmount(t.amount, convention);
      if (spendingAmount > 0) {
        csvExpenseTransactions.push({
          date: t.date.toISOString().split('T')[0],
          merchant: t.merchant,
          amount: t.amount,
          spendingAmount,
          rawRow: csvRows[index],
        });
        csvExpenseTotal += spendingAmount;
      }
    });

    // Get database transactions for this file
    const { data: sourceFiles } = await supabase
      .from('source_files')
      .select('id, filename, amount_sign_convention')
      .eq('filename', file.filename)
      .eq('user_id', user.id);

    if (!sourceFiles || sourceFiles.length === 0) {
      // All CSV transactions are missing
      results.push({
        filename: file.filename,
        csvExpenseTotal,
        dbApprovedTotal: 0,
        dbPendingTotal: 0,
        discrepancy: csvExpenseTotal,
        missingTransactions: csvExpenseTransactions.map(t => ({
          date: t.date,
          merchant: t.merchant,
          amount: t.amount,
          csvAmount: t.spendingAmount,
          dbAmount: null,
          status: 'missing' as const,
          reason: 'File not found in database',
          rawRow: t.rawRow,
        })),
        pendingTransactions: [],
        creditMismatchTransactions: [],
      });
      continue;
    }

    const sourceFileIds = sourceFiles.map(f => f.id);
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select('id, date, amount, status, merchant_normalized, source_file:source_files(id, filename, amount_sign_convention)')
      .in('source_file_id', sourceFileIds)
      .eq('user_id', user.id);

    // Create map of DB transactions
    const dbMap = new Map<string, Array<{
      id: string;
      amount: number;
      status: string;
      convention: AmountSignConvention;
    }>>();

    (dbTransactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const sourceFile = t.source_file;
      let dbConvention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
      
      if (!dbConvention) {
        const filename = (sourceFile?.filename || '').toLowerCase();
        dbConvention = filename.includes('chase') ? 'negative' : 'positive';
      }
      
      const key = `${t.date}|${t.merchant_normalized}|${Math.abs(amount).toFixed(2)}`;
      if (!dbMap.has(key)) {
        dbMap.set(key, []);
      }
      dbMap.get(key)!.push({
        id: t.id,
        amount,
        status: t.status,
        convention: dbConvention,
      });
    });

    // Find discrepancies
    const missingTransactions: DiscrepancyTransaction[] = [];
    const pendingTransactions: DiscrepancyTransaction[] = [];
    const creditMismatchTransactions: DiscrepancyTransaction[] = [];

    let dbApprovedTotal = 0;
    let dbPendingTotal = 0;

    csvExpenseTransactions.forEach(csvT => {
      const key = `${csvT.date}|${csvT.merchant}|${Math.abs(csvT.amount).toFixed(2)}`;
      const dbMatches = dbMap.get(key) || [];
      
      if (dbMatches.length === 0) {
        // Transaction is missing from database
        missingTransactions.push({
          date: csvT.date,
          merchant: csvT.merchant,
          amount: csvT.amount,
          csvAmount: csvT.spendingAmount,
          dbAmount: null,
          status: 'missing',
          reason: 'Not found in database',
          rawRow: csvT.rawRow,
        });
      } else {
        // Transaction exists, check status
        const dbMatch = dbMatches[0];
        const dbSpendingAmount = calculateSpendingAmount(dbMatch.amount, dbMatch.convention);
        
        if (dbMatch.status === 'pending_review') {
          pendingTransactions.push({
            date: csvT.date,
            merchant: csvT.merchant,
            amount: csvT.amount,
            csvAmount: csvT.spendingAmount,
            dbAmount: dbSpendingAmount,
            status: 'pending',
            reason: 'Pending review (filtered out by app)',
            rawRow: csvT.rawRow,
          });
          dbPendingTotal += dbSpendingAmount;
        } else if (dbSpendingAmount === 0) {
          // This is a credit in DB but expense in CSV
          creditMismatchTransactions.push({
            date: csvT.date,
            merchant: csvT.merchant,
            amount: csvT.amount,
            csvAmount: csvT.spendingAmount,
            dbAmount: 0,
            status: 'credit_mismatch',
            reason: 'Counted as credit in database but expense in CSV',
            rawRow: csvT.rawRow,
          });
        } else {
          dbApprovedTotal += dbSpendingAmount;
        }
        
        // Remove from map to track duplicates
        dbMatches.shift();
      }
    });

    results.push({
      filename: file.filename,
      csvExpenseTotal,
      dbApprovedTotal,
      dbPendingTotal,
      discrepancy: csvExpenseTotal - dbApprovedTotal,
      missingTransactions,
      pendingTransactions,
      creditMismatchTransactions,
    });
  }

  const summary = {
    totalCsvExpenses: results.reduce((sum, r) => sum + r.csvExpenseTotal, 0),
    totalDbApproved: results.reduce((sum, r) => sum + r.dbApprovedTotal, 0),
    totalDbPending: results.reduce((sum, r) => sum + r.dbPendingTotal, 0),
    totalDiscrepancy: results.reduce((sum, r) => sum + r.discrepancy, 0),
    missingCount: results.reduce((sum, r) => sum + r.missingTransactions.length, 0),
    pendingCount: results.reduce((sum, r) => sum + r.pendingTransactions.length, 0),
    creditMismatchCount: results.reduce((sum, r) => sum + r.creditMismatchTransactions.length, 0),
  };

  return { byFile: results, summary };
}

