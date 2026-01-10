'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { detectColumns } from '@/lib/utils/column-detector';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Find exactly which transactions are missing from the database
 */
export async function findMissingTransactionsDetailed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

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

  for (const file of csvFiles) {
    if (!existsSync(file.path)) {
      continue;
    }

    // Parse CSV
    const content = readFileSync(file.path, 'utf-8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRows = parsed.data as any[];
    const columns = detectColumns(csvRows);
    const normalizationResult = normalizeTransactions(csvRows, columns);

    // Get CSV spending transactions
    const csvSpendingTransactions: Array<{
      date: string;
      merchant: string;
      amount: number;
      spendingAmount: number;
      rawRow: any;
    }> = [];

    normalizationResult.transactions.forEach((t, idx) => {
      const spendingAmount = calculateSpendingAmount(t.amount, file.convention);
      if (spendingAmount > 0) {
        csvSpendingTransactions.push({
          date: t.date.toISOString().split('T')[0],
          merchant: t.merchant,
          amount: t.amount,
          spendingAmount,
          rawRow: csvRows[idx],
        });
      }
    });

    // Get source file from database - try multiple matching strategies
    let { data: sourceFiles } = await supabase
      .from('source_files')
      .select('id, filename, amount_sign_convention')
      .eq('user_id', user.id)
      .ilike('filename', `%${file.filename.split('_')[0]}%`)
      .limit(10);

    // If no match, try exact match
    if (!sourceFiles || sourceFiles.length === 0) {
      const { data: exactMatch } = await supabase
        .from('source_files')
        .select('id, filename, amount_sign_convention')
        .eq('user_id', user.id)
        .eq('filename', file.filename)
        .limit(10);
      sourceFiles = exactMatch;
    }

    // If still no match, try matching by base name (Chase2861)
    if (!sourceFiles || sourceFiles.length === 0) {
      const baseName = file.filename.split('_')[0]; // e.g., "Chase2861"
      const { data: allFiles } = await supabase
        .from('source_files')
        .select('id, filename, amount_sign_convention')
        .eq('user_id', user.id);
      
      sourceFiles = (allFiles || []).filter(f => 
        f.filename.toLowerCase().includes(baseName.toLowerCase()) ||
        baseName.toLowerCase().includes(f.filename.split('_')[0].toLowerCase())
      );
    }

    if (!sourceFiles || sourceFiles.length === 0) {
      results.push({
        filename: file.filename,
        csvCount: csvSpendingTransactions.length,
        csvTotal: csvSpendingTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
        dbCount: 0,
        dbTotal: 0,
        missingCount: csvSpendingTransactions.length,
        missingTotal: csvSpendingTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
        missingTransactions: csvSpendingTransactions,
        error: 'Source file not found in database',
      });
      continue;
    }

    // Get all transactions from matching source files
    const sourceFileIds = sourceFiles.map(f => f.id);
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select(`
        id,
        date,
        merchant_normalized,
        amount,
        status,
        source_file:source_files(id, filename, amount_sign_convention)
      `)
      .eq('user_id', user.id)
      .in('source_file_id', sourceFileIds);

    // Create map of DB transactions - use lowercase for case-insensitive matching
    const dbMap = new Map<string, number>();
    const dbMapLower = new Map<string, number>(); // Case-insensitive fallback
    (dbTransactions || []).forEach((t: any) => {
      const merchant = t.merchant_normalized || '';
      const key = `${t.date}|${merchant}|${Math.abs(Number(t.amount)).toFixed(2)}`;
      const keyLower = `${t.date}|${merchant.toLowerCase()}|${Math.abs(Number(t.amount)).toFixed(2)}`;
      dbMap.set(key, (dbMap.get(key) || 0) + 1);
      dbMapLower.set(keyLower, (dbMapLower.get(keyLower) || 0) + 1);
    });

    // Find missing transactions - try exact match first, then case-insensitive
    const missing: typeof csvSpendingTransactions = [];
    csvSpendingTransactions.forEach(csvT => {
      const merchant = csvT.merchant || '';
      const key = `${csvT.date}|${merchant}|${Math.abs(csvT.amount).toFixed(2)}`;
      const keyLower = `${csvT.date}|${merchant.toLowerCase()}|${Math.abs(csvT.amount).toFixed(2)}`;
      
      // Try exact match first
      let dbCount = dbMap.get(key) || 0;
      
      // If no exact match, try case-insensitive
      if (dbCount === 0) {
        dbCount = dbMapLower.get(keyLower) || 0;
        if (dbCount > 0) {
          // Found case-insensitive match, update both maps
          dbMapLower.set(keyLower, dbCount - 1);
        }
      } else {
        // Found exact match, update both maps
        dbMap.set(key, dbCount - 1);
        const lowerCount = dbMapLower.get(keyLower) || 0;
        if (lowerCount > 0) {
          dbMapLower.set(keyLower, lowerCount - 1);
        }
      }
      
      if (dbCount === 0) {
        missing.push(csvT);
      }
    });

    // Calculate DB totals
    let dbTotal = 0;
    let dbCount = 0;
    (dbTransactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const sourceFile = t.source_file;
      let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
      
      if (!convention) {
        const filename = (sourceFile?.filename || '').toLowerCase();
        convention = filename.includes('chase') ? 'negative' : 'positive';
      }
      
      const spendingAmount = calculateSpendingAmount(amount, convention);
      if (spendingAmount > 0) {
        dbTotal += spendingAmount;
        dbCount++;
      }
    });

    const missingTotal = missing.reduce((sum, t) => sum + t.spendingAmount, 0);

    results.push({
      filename: file.filename,
      csvCount: csvSpendingTransactions.length,
      csvTotal: csvSpendingTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
      dbCount,
      dbTotal,
      missingCount: missing.length,
      missingTotal,
      missingTransactions: missing.slice(0, 100), // First 100 for display
      normalizationErrors: normalizationResult.errors.filter(e => 
        e.reason !== 'payment' && e.reason !== 'credit_card_payment'
      ).length,
    });
  }

  const summary = {
    totalCsvCount: results.reduce((sum, r) => sum + r.csvCount, 0),
    totalCsvTotal: results.reduce((sum, r) => sum + r.csvTotal, 0),
    totalDbCount: results.reduce((sum, r) => sum + r.dbCount, 0),
    totalDbTotal: results.reduce((sum, r) => sum + r.dbTotal, 0),
    totalMissingCount: results.reduce((sum, r) => sum + r.missingCount, 0),
    totalMissingTotal: results.reduce((sum, r) => sum + r.missingTotal, 0),
    totalNormalizationErrors: results.reduce((sum, r) => sum + (r.normalizationErrors || 0), 0),
  };

  return {
    summary,
    byFile: results,
  };
}

