'use server';

import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export type ImportFailure = {
  date: string | null;
  merchant: string | null;
  amount: string | null;
  reason: string;
  error: string;
  rawRow: any;
  csvAmount?: number;
};

export async function diagnoseImportFailures() {
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

    // Calculate convention
    const isChase = file.filename.toLowerCase().includes('chase');
    const convention: AmountSignConvention = isChase ? 'negative' : 'positive';

    // Process errors to get failure details
    const failures: ImportFailure[] = normalizationResult.errors.map(err => {
      // Try to extract date, merchant, amount from raw row
      const dateCol = Object.keys(err.row).find(k => /date/i.test(k));
      const merchantCol = Object.keys(err.row).find(k => /description|merchant/i.test(k));
      const amountCol = Object.keys(err.row).find(k => /amount/i.test(k));

      let csvAmount = 0;
      if (amountCol && err.row[amountCol]) {
        try {
          const amountStr = String(err.row[amountCol]).replace(/[$,\s]/g, '');
          const amount = parseFloat(amountStr);
          if (!isNaN(amount)) {
            csvAmount = calculateSpendingAmount(amount, convention);
          }
        } catch {
          // Ignore parse errors
        }
      }

      return {
        date: dateCol ? String(err.row[dateCol] || '') : null,
        merchant: merchantCol ? String(err.row[merchantCol] || '').substring(0, 50) : null,
        amount: amountCol ? String(err.row[amountCol] || '') : null,
        reason: err.reason,
        error: err.error,
        rawRow: err.row,
        csvAmount: csvAmount > 0 ? csvAmount : undefined,
      };
    });

    // Group failures by reason
    const failuresByReason = failures.reduce((acc, f) => {
      if (!acc[f.reason]) {
        acc[f.reason] = [];
      }
      acc[f.reason].push(f);
      return acc;
    }, {} as Record<string, ImportFailure[]>);

    // Calculate totals by reason
    const totalsByReason: Record<string, number> = {};
    Object.entries(failuresByReason).forEach(([reason, failures]) => {
      totalsByReason[reason] = failures.reduce((sum, f) => sum + (f.csvAmount || 0), 0);
    });

    results.push({
      filename: file.filename,
      totalRows: csvRows.length,
      successfullyNormalized: normalizationResult.transactions.length,
      totalFailures: failures.length,
      failuresByReason,
      totalsByReason,
      failures: failures.filter(f => f.csvAmount && f.csvAmount > 0), // Only spending transactions
    });
  }

  // Calculate overall totals
  const overallTotals = results.reduce((acc, r) => {
    Object.entries(r.totalsByReason).forEach(([reason, total]) => {
      acc[reason] = (acc[reason] || 0) + total;
    });
    return acc;
  }, {} as Record<string, number>);

  const totalMissingAmount = Object.values(overallTotals).reduce((sum, total) => sum + total, 0);

  return {
    byFile: results,
    summary: {
      totalFailures: results.reduce((sum, r) => sum + r.totalFailures, 0),
      totalMissingAmount,
      totalsByReason: overallTotals,
      spendingFailures: results.reduce((sum, r) => sum + r.failures.length, 0),
    },
  };
}

