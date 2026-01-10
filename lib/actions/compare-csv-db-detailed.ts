'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export type TransactionMatch = {
  csvDate: string;
  csvMerchant: string;
  csvAmount: number;
  csvSpendingAmount: number;
  dbId?: number;
  dbDate?: string;
  dbMerchant?: string;
  dbAmount?: number;
  dbSpendingAmount?: number;
  status: 'matched' | 'missing' | 'amount_mismatch';
  rawRow: any;
};

export async function compareCSVDBDetailed() {
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

    // Analyze what was filtered out
    const filteredOut = {
      payments: normalizationResult.errors.filter(e => e.reason === 'payment').length,
      creditCardPayments: normalizationResult.errors.filter(e => e.reason === 'credit_card_payment').length,
      credits: [] as Array<{ date: string; merchant: string; amount: number; rawRow: any }>,
      otherErrors: normalizationResult.errors.filter(e => 
        e.reason !== 'payment' && e.reason !== 'credit_card_payment'
      ),
    };

    // Check normalized transactions for credits (negative spending amounts)
    normalizationResult.transactions.forEach((t, idx) => {
      const spendingAmount = calculateSpendingAmount(t.amount, convention);
      if (spendingAmount === 0) {
        // This is a credit/refund
        filteredOut.credits.push({
          date: t.date.toISOString().split('T')[0],
          merchant: t.merchant,
          amount: t.amount,
          rawRow: csvRows[idx],
        });
      }
    });

    // Get all CSV charges (spending transactions only)
    const csvCharges: Array<{
      date: string;
      merchant: string;
      amount: number;
      spendingAmount: number;
      rawRow: any;
    }> = [];

    normalizationResult.transactions.forEach((t, idx) => {
      const spendingAmount = calculateSpendingAmount(t.amount, convention);
      if (spendingAmount > 0) {
        csvCharges.push({
          date: t.date.toISOString().split('T')[0],
          merchant: t.merchant,
          amount: t.amount,
          spendingAmount,
          rawRow: csvRows[idx],
        });
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
        csvCharges: csvCharges.length,
        csvChargesTotal: csvCharges.reduce((sum, t) => sum + t.spendingAmount, 0),
        dbCharges: 0,
        dbChargesTotal: 0,
        missing: csvCharges.length,
        missingTotal: csvCharges.reduce((sum, t) => sum + t.spendingAmount, 0),
        filteredOut,
        matches: csvCharges.map(t => ({
          csvDate: t.date,
          csvMerchant: t.merchant,
          csvAmount: t.amount,
          csvSpendingAmount: t.spendingAmount,
          status: 'missing' as const,
          rawRow: t.rawRow,
        })),
        error: 'File not found in database',
      });
      continue;
    }

    const sourceFileIds = sourceFiles.map(f => f.id);
    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select(`
        id,
        date,
        amount,
        merchant_raw,
        merchant_normalized,
        status,
        source_file:source_files(id, filename, amount_sign_convention)
      `)
      .in('source_file_id', sourceFileIds)
      .eq('user_id', user.id);

    // Get DB charges (spending transactions only)
    const dbCharges: Array<{
      id: number;
      date: string;
      merchant: string;
      amount: number;
      spendingAmount: number;
    }> = [];

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
        dbCharges.push({
          id: t.id,
          date: t.date,
          merchant: t.merchant_normalized,
          amount,
          spendingAmount,
        });
      }
    });

    // Create map for matching
    const dbMap = new Map<string, Array<typeof dbCharges[0]>>();
    dbCharges.forEach(t => {
      const key = `${t.date}|${t.merchant.toLowerCase()}|${Math.abs(t.amount).toFixed(2)}`;
      if (!dbMap.has(key)) {
        dbMap.set(key, []);
      }
      dbMap.get(key)!.push(t);
    });

    // Match CSV charges with DB charges
    const matches: TransactionMatch[] = [];
    const missing: TransactionMatch[] = [];

    csvCharges.forEach(csvT => {
      const key = `${csvT.date}|${csvT.merchant.toLowerCase()}|${Math.abs(csvT.amount).toFixed(2)}`;
      const dbMatches = dbMap.get(key) || [];
      
      if (dbMatches.length > 0) {
        const dbMatch = dbMatches.shift()!;
        matches.push({
          csvDate: csvT.date,
          csvMerchant: csvT.merchant,
          csvAmount: csvT.amount,
          csvSpendingAmount: csvT.spendingAmount,
          dbId: dbMatch.id,
          dbDate: dbMatch.date,
          dbMerchant: dbMatch.merchant,
          dbAmount: dbMatch.amount,
          dbSpendingAmount: dbMatch.spendingAmount,
          status: Math.abs(csvT.spendingAmount - dbMatch.spendingAmount) < 0.01 ? 'matched' : 'amount_mismatch',
          rawRow: csvT.rawRow,
        });
      } else {
        missing.push({
          csvDate: csvT.date,
          csvMerchant: csvT.merchant,
          csvAmount: csvT.amount,
          csvSpendingAmount: csvT.spendingAmount,
          status: 'missing',
          rawRow: csvT.rawRow,
        });
      }
    });

    // Find extra DB transactions (not in CSV)
    const csvMap = new Map<string, number>();
    csvCharges.forEach(t => {
      const key = `${t.date}|${t.merchant.toLowerCase()}|${Math.abs(t.amount).toFixed(2)}`;
      csvMap.set(key, (csvMap.get(key) || 0) + 1);
    });

    const extra: Array<typeof dbCharges[0]> = [];
    dbCharges.forEach(dbT => {
      const key = `${dbT.date}|${dbT.merchant.toLowerCase()}|${Math.abs(dbT.amount).toFixed(2)}`;
      const csvCount = csvMap.get(key) || 0;
      if (csvCount === 0) {
        extra.push(dbT);
      } else {
        csvMap.set(key, csvCount - 1);
      }
    });

    results.push({
      filename: file.filename,
      csvCharges: csvCharges.length,
      csvChargesTotal: csvCharges.reduce((sum, t) => sum + t.spendingAmount, 0),
      dbCharges: dbCharges.length,
      dbChargesTotal: dbCharges.reduce((sum, t) => sum + t.spendingAmount, 0),
      matched: matches.length,
      matchedTotal: matches.reduce((sum, t) => sum + t.csvSpendingAmount, 0),
      missing: missing.length,
      missingTotal: missing.reduce((sum, t) => sum + t.csvSpendingAmount, 0),
      extra: extra.length,
      extraTotal: extra.reduce((sum, t) => sum + t.spendingAmount, 0),
      filteredOut,
      matches: matches.slice(0, 100), // First 100 matches
      missingTransactions: missing,
      extraTransactions: extra.slice(0, 100), // First 100 extra
    });
  }

  const summary = {
    csvChargesTotal: results.reduce((sum, r) => sum + r.csvChargesTotal, 0),
    dbChargesTotal: results.reduce((sum, r) => sum + r.dbChargesTotal, 0),
    matchedTotal: results.reduce((sum, r) => sum + r.matchedTotal, 0),
    missingTotal: results.reduce((sum, r) => sum + r.missingTotal, 0),
    extraTotal: results.reduce((sum, r) => sum + r.extraTotal, 0),
    totalFilteredPayments: results.reduce((sum, r) => sum + r.filteredOut.payments, 0),
    totalFilteredCreditCardPayments: results.reduce((sum, r) => sum + r.filteredOut.creditCardPayments, 0),
    totalFilteredCredits: results.reduce((sum, r) => sum + r.filteredOut.credits.length, 0),
    totalFilteredCreditsAmount: results.reduce((sum, r) => 
      sum + r.filteredOut.credits.reduce((s, c) => s + Math.abs(c.amount), 0), 0
    ),
  };

  return { byFile: results, summary };
}

