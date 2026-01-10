'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function diagnoseAmountDiscrepancy() {
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
    
    let csvExpenseTotal = 0;
    let csvExpenseCount = 0;
    let csvCreditTotal = 0;
    let csvCreditCount = 0;
    
    normalizationResult.transactions.forEach(t => {
      const spendingAmount = calculateSpendingAmount(t.amount, convention);
      if (spendingAmount > 0) {
        csvExpenseTotal += spendingAmount;
        csvExpenseCount++;
      } else {
        csvCreditTotal += Math.abs(t.amount);
        csvCreditCount++;
      }
    });

    // Get database transactions for this file
    const { data: sourceFiles } = await supabase
      .from('source_files')
      .select('id, filename, amount_sign_convention')
      .eq('filename', file.filename)
      .eq('user_id', user.id);

    if (!sourceFiles || sourceFiles.length === 0) {
      results.push({
        filename: file.filename,
        csvExpenseTotal,
        csvExpenseCount,
        dbExpenseTotal: 0,
        dbExpenseCount: 0,
        difference: csvExpenseTotal,
        error: 'File not found in database',
      });
      continue;
    }

    const sourceFileIds = sourceFiles.map(f => f.id);
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select('amount, status, source_file:source_files(id, filename, amount_sign_convention)')
      .in('source_file_id', sourceFileIds)
      .eq('user_id', user.id);

    // Calculate DB totals
    let dbExpenseTotal = 0;
    let dbExpenseCount = 0;
    let dbPendingTotal = 0;
    let dbPendingCount = 0;
    let dbCreditTotal = 0;
    let dbCreditCount = 0;

    (dbTransactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const sourceFile = t.source_file;
      let dbConvention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
      
      if (!dbConvention) {
        const filename = (sourceFile?.filename || '').toLowerCase();
        dbConvention = filename.includes('chase') ? 'negative' : 'positive';
      }
      
      const spendingAmount = calculateSpendingAmount(amount, dbConvention);
      
      if (spendingAmount > 0) {
        if (t.status === 'approved') {
          dbExpenseTotal += spendingAmount;
          dbExpenseCount++;
        } else {
          dbPendingTotal += spendingAmount;
          dbPendingCount++;
        }
      } else {
        dbCreditTotal += Math.abs(amount);
        dbCreditCount++;
      }
    });

    results.push({
      filename: file.filename,
      csvExpenseTotal,
      csvExpenseCount,
      dbExpenseTotal,
      dbExpenseCount,
      dbPendingTotal,
      dbPendingCount,
      dbCreditTotal,
      dbCreditCount,
      difference: csvExpenseTotal - dbExpenseTotal,
      totalInDB: (dbTransactions || []).length,
    });
  }

  const totalCsv = results.reduce((sum, r) => sum + r.csvExpenseTotal, 0);
  const totalDbApproved = results.reduce((sum, r) => sum + r.dbExpenseTotal, 0);
  const totalDbPending = results.reduce((sum, r) => sum + r.dbPendingTotal, 0);
  const totalDbAll = totalDbApproved + totalDbPending;

  return {
    byFile: results,
    summary: {
      csvTotal: totalCsv,
      dbApprovedTotal: totalDbApproved,
      dbPendingTotal: totalDbPending,
      dbAllTotal: totalDbAll,
      missingFromDB: totalCsv - totalDbAll,
      filteredByStatus: totalDbPending,
      totalMissingFromApp: totalCsv - totalDbApproved,
    },
  };
}

