'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Diagnose what happened during upload - compare CSV with database
 */
export async function diagnoseMissingAfterUpload() {
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

    const isChase = file.filename.toLowerCase().includes('chase');
    const convention: AmountSignConvention = isChase ? 'negative' : 'positive';

    // Get all CSV transactions (successful + errors)
    const allCSVTransactions: Array<{
      date: string;
      merchant: string;
      amount: number;
      spendingAmount: number;
      status: 'normalized' | 'failed';
      errorReason?: string;
      errorMessage?: string;
    }> = [];

    // Add normalized transactions
    normalizationResult.transactions.forEach(t => {
      const spendingAmount = calculateSpendingAmount(t.amount, convention);
      if (spendingAmount > 0) {
        allCSVTransactions.push({
          date: t.date.toISOString().split('T')[0],
          merchant: t.merchant,
          amount: t.amount,
          spendingAmount,
          status: 'normalized',
        });
      }
    });

    // Add failed transactions (fixable errors only)
    const fixableErrors = normalizationResult.errors.filter(
      e => e.reason !== 'payment' && e.reason !== 'credit_card_payment'
    );

    fixableErrors.forEach(err => {
      const dateCol = Object.keys(err.row).find(k => /date/i.test(k));
      const merchantCol = Object.keys(err.row).find(k => /description|merchant/i.test(k));
      const amountCol = Object.keys(err.row).find(k => /amount/i.test(k));

      let date: string | null = null;
      let merchant: string | null = null;
      let amount: number | null = null;

      if (dateCol && err.row[dateCol]) {
        try {
          const dateValue = err.row[dateCol];
          if (typeof dateValue === 'string') {
            const parsed = new Date(dateValue);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toISOString().split('T')[0];
            }
          }
        } catch {
          // Keep as null
        }
      }

      if (merchantCol && err.row[merchantCol]) {
        merchant = String(err.row[merchantCol]).trim().substring(0, 255) || null;
      }

      if (amountCol && err.row[amountCol]) {
        try {
          const amountStr = String(err.row[amountCol]).replace(/[$,\s]/g, '');
          const parsed = parseFloat(amountStr);
          if (!isNaN(parsed)) {
            amount = parsed;
          }
        } catch {
          // Keep as null
        }
      }

      if (date || merchant || amount !== null) {
        const spendingAmount = amount ? calculateSpendingAmount(amount, convention) : 0;
        if (spendingAmount > 0) {
          allCSVTransactions.push({
            date: date || 'UNKNOWN',
            merchant: merchant || 'UNKNOWN MERCHANT',
            amount: amount || 0,
            spendingAmount,
            status: 'failed',
            errorReason: err.reason,
            errorMessage: err.error,
          });
        }
      }
    });

    // Get database transactions
    const { data: sourceFiles } = await supabase
      .from('source_files')
      .select('id, filename')
      .eq('filename', file.filename)
      .eq('user_id', user.id);

    if (!sourceFiles || sourceFiles.length === 0) {
      results.push({
        filename: file.filename,
        csvTotal: allCSVTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
        csvCount: allCSVTransactions.length,
        dbTotal: 0,
        dbCount: 0,
        missing: allCSVTransactions.length,
        missingTotal: allCSVTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
        normalizedCount: normalizationResult.transactions.length,
        failedCount: fixableErrors.length,
        error: 'File not found in database',
      });
      continue;
    }

    const sourceFileIds = sourceFiles.map(f => f.id);
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select('date, merchant_normalized, amount, status, import_error_reason')
      .in('source_file_id', sourceFileIds)
      .eq('user_id', user.id);

    // Calculate DB totals
    let dbApprovedTotal = 0;
    let dbPendingTotal = 0;
    let dbFailedTotal = 0;
    let dbApprovedCount = 0;
    let dbPendingCount = 0;
    let dbFailedCount = 0;

    (dbTransactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const spendingAmount = calculateSpendingAmount(amount, convention);
      
      if (spendingAmount > 0) {
        if (t.import_error_reason) {
          dbFailedTotal += spendingAmount;
          dbFailedCount++;
        } else if (t.status === 'approved') {
          dbApprovedTotal += spendingAmount;
          dbApprovedCount++;
        } else {
          dbPendingTotal += spendingAmount;
          dbPendingCount++;
        }
      }
    });

    // Find missing transactions
    const dbMap = new Map<string, number>();
    (dbTransactions || []).forEach((t: any) => {
      const key = `${t.date}|${t.merchant_normalized}|${Math.abs(Number(t.amount)).toFixed(2)}`;
      dbMap.set(key, (dbMap.get(key) || 0) + 1);
    });

    const missing: typeof allCSVTransactions = [];
    allCSVTransactions.forEach(csvT => {
      const key = `${csvT.date}|${csvT.merchant.toLowerCase()}|${Math.abs(csvT.amount).toFixed(2)}`;
      const dbCount = dbMap.get(key) || 0;
      if (dbCount === 0) {
        missing.push(csvT);
      } else {
        dbMap.set(key, dbCount - 1);
      }
    });

    results.push({
      filename: file.filename,
      csvTotal: allCSVTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
      csvCount: allCSVTransactions.length,
      normalizedCount: normalizationResult.transactions.length,
      failedCount: fixableErrors.length,
      dbTotal: dbApprovedTotal + dbPendingTotal + dbFailedTotal,
      dbCount: dbApprovedCount + dbPendingCount + dbFailedCount,
      dbApprovedTotal,
      dbPendingTotal,
      dbFailedTotal,
      dbApprovedCount,
      dbPendingCount,
      dbFailedCount,
      missing: missing.length,
      missingTotal: missing.reduce((sum, t) => sum + t.spendingAmount, 0),
      missingTransactions: missing.slice(0, 20), // First 20
    });
  }

  const summary = {
    csvTotal: results.reduce((sum, r) => sum + r.csvTotal, 0),
    dbTotal: results.reduce((sum, r) => sum + r.dbTotal, 0),
    dbApprovedTotal: results.reduce((sum, r) => sum + r.dbApprovedTotal, 0),
    dbPendingTotal: results.reduce((sum, r) => sum + r.dbPendingTotal, 0),
    dbFailedTotal: results.reduce((sum, r) => sum + r.dbFailedTotal, 0),
    missingTotal: results.reduce((sum, r) => sum + r.missingTotal, 0),
    missingCount: results.reduce((sum, r) => sum + r.missing, 0),
    totalNormalized: results.reduce((sum, r) => sum + r.normalizedCount, 0),
    totalFailed: results.reduce((sum, r) => sum + r.failedCount, 0),
  };

  return { byFile: results, summary };
}

