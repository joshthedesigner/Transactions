'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { detectColumns } from '@/lib/utils/column-detector';
import { categorizeTransactions } from '@/lib/utils/categorization/pipeline';
import { detectAmountConvention } from '@/lib/utils/amount-convention-detector';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Import missing transactions from CSV files
 */
export async function importMissingTransactions() {
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
      results.push({
        filename: file.filename,
        success: false,
        error: 'File not found',
        imported: 0,
      });
      continue;
    }

    try {
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
        normalized: any;
      }> = [];

      normalizationResult.transactions.forEach((t, idx) => {
        const spendingAmount = calculateSpendingAmount(t.amount, file.convention);
        if (spendingAmount > 0) {
          csvSpendingTransactions.push({
            date: t.date.toISOString().split('T')[0],
            merchant: t.merchant,
            amount: t.amount,
            spendingAmount,
            normalized: t,
          });
        }
      });

      // Find or create source file
      let { data: sourceFiles } = await supabase
        .from('source_files')
        .select('id, filename, amount_sign_convention')
        .eq('user_id', user.id)
        .eq('filename', file.filename)
        .limit(1);

      let sourceFileId: number;
      if (!sourceFiles || sourceFiles.length === 0) {
        // Create source file
        const { data: newSourceFile, error: createError } = await supabase
          .from('source_files')
          .insert({
            filename: file.filename,
            user_id: user.id,
            amount_sign_convention: file.convention,
          })
          .select()
          .single();

        if (createError || !newSourceFile) {
          results.push({
            filename: file.filename,
            success: false,
            error: `Failed to create source file: ${createError?.message}`,
            imported: 0,
          });
          continue;
        }
        sourceFileId = newSourceFile.id;
      } else {
        sourceFileId = sourceFiles[0].id;
      }

      // Get existing transactions
      const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('date, merchant_normalized, amount')
        .eq('user_id', user.id)
        .eq('source_file_id', sourceFileId);

      // Create map of existing transactions
      const existingMap = new Map<string, number>();
      (existingTransactions || []).forEach((t: any) => {
        const key = `${t.date}|${t.merchant_normalized.toLowerCase()}|${Math.abs(Number(t.amount)).toFixed(2)}`;
        existingMap.set(key, (existingMap.get(key) || 0) + 1);
      });

      // Find missing transactions
      const missingTransactions: typeof csvSpendingTransactions = [];
      csvSpendingTransactions.forEach(csvT => {
        const key = `${csvT.date}|${csvT.merchant.toLowerCase()}|${Math.abs(csvT.amount).toFixed(2)}`;
        const existingCount = existingMap.get(key) || 0;
        if (existingCount === 0) {
          missingTransactions.push(csvT);
        } else {
          existingMap.set(key, existingCount - 1);
        }
      });

      if (missingTransactions.length === 0) {
        results.push({
          filename: file.filename,
          success: true,
          imported: 0,
          message: 'All transactions already in database',
        });
        continue;
      }

      // Categorize missing transactions
      const normalizedMissing = missingTransactions.map(t => t.normalized);
      const categorizationResults = await categorizeTransactions(normalizedMissing, user.id);

      // Prepare transactions for insert
      const transactionsToInsert = normalizedMissing.map((transaction, index) => {
        const result = categorizationResults[index];
        return {
          date: transaction.date.toISOString().split('T')[0],
          merchant_raw: transaction.merchant,
          merchant_normalized: transaction.merchant,
          amount: transaction.amount,
          category_id: result.categoryId,
          confidence_score: result.confidenceScore,
          status: result.status,
          source_file_id: sourceFileId,
          user_id: user.id,
        };
      });

      // Insert missing transactions
      const { data: insertedData, error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsToInsert)
        .select('id');

      if (insertError) {
        results.push({
          filename: file.filename,
          success: false,
          error: `Failed to insert transactions: ${insertError.message}`,
          imported: 0,
        });
        continue;
      }

      const importedCount = insertedData?.length || 0;
      const approvedCount = categorizationResults.filter(r => r.status === 'approved').length;
      const pendingCount = categorizationResults.filter(r => r.status === 'pending_review').length;

      results.push({
        filename: file.filename,
        success: true,
        imported: importedCount,
        approved: approvedCount,
        pending: pendingCount,
        totalMissing: missingTransactions.length,
        totalAmount: missingTransactions.reduce((sum, t) => sum + t.spendingAmount, 0),
      });

    } catch (error) {
      results.push({
        filename: file.filename,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        imported: 0,
      });
    }
  }

  const totalImported = results.reduce((sum, r) => sum + (r.imported || 0), 0);
  const totalAmount = results.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

  return {
    success: true,
    totalImported,
    totalAmount,
    results,
  };
}

