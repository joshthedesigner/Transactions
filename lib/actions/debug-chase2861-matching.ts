'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { detectColumns } from '@/lib/utils/column-detector';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Debug why Chase2861 transactions aren't matching
 */
export async function debugChase2861Matching() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const csvPath = '/Users/joshgold/Desktop/transactions/Chase2861_Activity20250101_20260101_20260109.CSV';
  
  if (!existsSync(csvPath)) {
    return { error: 'CSV file not found' };
  }

  // Parse CSV
  const content = readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
  const csvRows = parsed.data as any[];
  const columns = detectColumns(csvRows);
  const normalizationResult = normalizeTransactions(csvRows, columns);

  // Get first 10 CSV transactions
  const csvSamples = normalizationResult.transactions.slice(0, 10).map((t, idx) => ({
    date: t.date.toISOString().split('T')[0],
    merchant: t.merchant,
    amount: t.amount,
    spendingAmount: calculateSpendingAmount(t.amount, 'negative'),
    rawRow: csvRows[idx],
  }));

  // Find source file
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename, amount_sign_convention')
    .eq('user_id', user.id)
    .ilike('filename', '%Chase2861%')
    .order('uploaded_at', { ascending: false })
    .limit(1);

  if (!sourceFiles || sourceFiles.length === 0) {
    return { error: 'No Chase2861 source file found' };
  }

  const sourceFile = sourceFiles[0];
  const sourceFileIds = [sourceFile.id];

  // Get DB transactions
  const { data: dbTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      merchant_raw,
      merchant_normalized,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .in('source_file_id', sourceFileIds)
    .order('date', { ascending: false })
    .limit(20);

  // Try to match CSV samples with DB transactions
  const matchingResults = csvSamples.map(csvT => {
    const key = `${csvT.date}|${csvT.merchant}|${Math.abs(csvT.amount).toFixed(2)}`;
    const keyLower = `${csvT.date}|${csvT.merchant.toLowerCase()}|${Math.abs(csvT.amount).toFixed(2)}`;
    
    // Try exact match
    const exactMatch = (dbTransactions || []).find((dbT: any) => {
      const dbKey = `${dbT.date}|${dbT.merchant_normalized}|${Math.abs(Number(dbT.amount)).toFixed(2)}`;
      return dbKey === key;
    });

    // Try case-insensitive match
    const caseInsensitiveMatch = (dbTransactions || []).find((dbT: any) => {
      const dbKey = `${dbT.date}|${dbT.merchant_normalized.toLowerCase()}|${Math.abs(Number(dbT.amount)).toFixed(2)}`;
      return dbKey === keyLower;
    });

    // Try with merchant_raw
    const rawMatch = (dbTransactions || []).find((dbT: any) => {
      const dbKey = `${dbT.date}|${dbT.merchant_raw}|${Math.abs(Number(dbT.amount)).toFixed(2)}`;
      return dbKey === key;
    });

    // Try with merchant_raw lowercase
    const rawMatchLower = (dbTransactions || []).find((dbT: any) => {
      const dbKey = `${dbT.date}|${dbT.merchant_raw.toLowerCase()}|${Math.abs(Number(dbT.amount)).toFixed(2)}`;
      return dbKey === keyLower;
    });

    return {
      csvTransaction: csvT,
      csvKey: key,
      csvKeyLower: keyLower,
      exactMatch: exactMatch ? {
        id: exactMatch.id,
        merchant_normalized: exactMatch.merchant_normalized,
        merchant_raw: exactMatch.merchant_raw,
        amount: exactMatch.amount,
        dbKey: `${exactMatch.date}|${exactMatch.merchant_normalized}|${Math.abs(Number(exactMatch.amount)).toFixed(2)}`,
      } : null,
      caseInsensitiveMatch: caseInsensitiveMatch && caseInsensitiveMatch !== exactMatch ? {
        id: caseInsensitiveMatch.id,
        merchant_normalized: caseInsensitiveMatch.merchant_normalized,
        merchant_raw: caseInsensitiveMatch.merchant_raw,
        amount: caseInsensitiveMatch.amount,
        dbKey: `${caseInsensitiveMatch.date}|${caseInsensitiveMatch.merchant_normalized.toLowerCase()}|${Math.abs(Number(caseInsensitiveMatch.amount)).toFixed(2)}`,
      } : null,
      rawMatch: rawMatch && rawMatch !== exactMatch && rawMatch !== caseInsensitiveMatch ? {
        id: rawMatch.id,
        merchant_normalized: rawMatch.merchant_normalized,
        merchant_raw: rawMatch.merchant_raw,
        amount: rawMatch.amount,
        dbKey: `${rawMatch.date}|${rawMatch.merchant_raw}|${Math.abs(Number(rawMatch.amount)).toFixed(2)}`,
      } : null,
      rawMatchLower: rawMatchLower && rawMatchLower !== exactMatch && rawMatchLower !== caseInsensitiveMatch && rawMatchLower !== rawMatch ? {
        id: rawMatchLower.id,
        merchant_normalized: rawMatchLower.merchant_normalized,
        merchant_raw: rawMatchLower.merchant_raw,
        amount: rawMatchLower.amount,
        dbKey: `${rawMatchLower.date}|${rawMatchLower.merchant_raw.toLowerCase()}|${Math.abs(Number(rawMatchLower.amount)).toFixed(2)}`,
      } : null,
      found: !!(exactMatch || caseInsensitiveMatch || rawMatch || rawMatchLower),
    };
  });

  // Get all DB transactions for comparison
  const dbSamples = (dbTransactions || []).slice(0, 10).map((t: any) => ({
    id: t.id,
    date: t.date,
    merchant_raw: t.merchant_raw,
    merchant_normalized: t.merchant_normalized,
    amount: Number(t.amount),
    dbKey: `${t.date}|${t.merchant_normalized}|${Math.abs(Number(t.amount)).toFixed(2)}`,
    dbKeyLower: `${t.date}|${t.merchant_normalized.toLowerCase()}|${Math.abs(Number(t.amount)).toFixed(2)}`,
  }));

  return {
    sourceFile: {
      id: sourceFile.id,
      filename: sourceFile.filename,
      convention: sourceFile.amount_sign_convention,
    },
    csvSampleCount: csvSamples.length,
    dbTransactionCount: dbTransactions?.length || 0,
    csvSamples,
    dbSamples,
    matchingResults,
    summary: {
      found: matchingResults.filter(m => m.found).length,
      notFound: matchingResults.filter(m => !m.found).length,
      exactMatches: matchingResults.filter(m => m.exactMatch).length,
      caseInsensitiveMatches: matchingResults.filter(m => m.caseInsensitiveMatch).length,
      rawMatches: matchingResults.filter(m => m.rawMatch).length,
    },
  };
}

