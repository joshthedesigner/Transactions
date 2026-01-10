'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';

export async function findMissingTransactions(
  csvFilePath: string,
  sourceFilename: string,
  month?: string // Format: "2025-11" for November 2025
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // 1. Parse CSV
  if (!existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }
  const content = readFileSync(csvFilePath, 'utf-8');
  const result = Papa.parse(content, { header: true, skipEmptyLines: true });
  const csvRows = result.data as any[];
  const columns = detectColumns(csvRows);
  const normalizationResult = normalizeTransactions(csvRows, columns);
  const normalized = normalizationResult.transactions;
  const normalizationErrors = normalizationResult.errors;

  // Filter by month if specified
  let csvTransactions = normalized.map((t, i) => ({
    date: t.date.toISOString().split('T')[0],
    merchant: t.merchant,
    amount: t.amount,
    rawRow: csvRows[i],
  }));

  if (month) {
    csvTransactions = csvTransactions.filter(t => t.date.startsWith(month));
  }

  // 2. Get database transactions
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('filename', sourceFilename)
    .eq('user_id', user.id);

  if (!sourceFiles || sourceFiles.length === 0) {
    return {
      csvCount: csvTransactions.length,
      dbCount: 0,
      missing: csvTransactions,
      extra: [],
    };
  }

  const sourceFileIds = sourceFiles.map(f => f.id);
  let dbQuery = supabase
    .from('transactions')
    .select('id, date, merchant_raw, merchant_normalized, amount')
    .in('source_file_id', sourceFileIds)
    .eq('user_id', user.id);

  if (month) {
    dbQuery = dbQuery.gte('date', `${month}-01`).lt('date', `${month}-32`);
  }

  const { data: dbTransactions } = await dbQuery.order('date', { ascending: true });

  // 3. Find missing transactions
  const dbMap = new Map<string, number>();
  (dbTransactions || []).forEach(t => {
    const key = `${t.date}|${t.merchant_normalized}|${Math.abs(Number(t.amount)).toFixed(2)}`;
    dbMap.set(key, (dbMap.get(key) || 0) + 1);
  });

  const missing: typeof csvTransactions = [];
  csvTransactions.forEach(csvT => {
    const key = `${csvT.date}|${csvT.merchant}|${Math.abs(csvT.amount).toFixed(2)}`;
    const dbCount = dbMap.get(key) || 0;
    if (dbCount === 0) {
      missing.push(csvT);
    } else {
      dbMap.set(key, dbCount - 1);
    }
  });

  // 4. Find extra transactions
  const csvMap = new Map<string, number>();
  csvTransactions.forEach(t => {
    const key = `${t.date}|${t.merchant}|${Math.abs(t.amount).toFixed(2)}`;
    csvMap.set(key, (csvMap.get(key) || 0) + 1);
  });

  const extra: any[] = [];
  (dbTransactions || []).forEach(dbT => {
    const key = `${dbT.date}|${dbT.merchant_normalized}|${Math.abs(Number(dbT.amount)).toFixed(2)}`;
    const csvCount = csvMap.get(key) || 0;
    if (csvCount === 0) {
      extra.push(dbT);
    } else {
      csvMap.set(key, csvCount - 1);
    }
  });

  // Group normalization errors by reason
  const errorBreakdown = normalizationErrors.reduce((acc, err) => {
    acc[err.reason] = (acc[err.reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get sample errors (non-payment errors that actually failed)
  const failedErrors = normalizationErrors.filter(e => 
    e.reason !== 'payment' && 
    e.reason !== 'credit_card_payment' &&
    e.reason !== 'zero_amount'
  );

  return {
    csvCount: csvTransactions.length,
    dbCount: dbTransactions?.length || 0,
    missing,
    extra,
    month: month || 'all',
    normalizationErrors: normalizationErrors.length,
    errorBreakdown,
    failedErrors: failedErrors.slice(0, 20), // Sample of first 20 failed errors
    totalCSVRows: csvRows.length,
    successfullyNormalized: normalized.length,
  };
}




