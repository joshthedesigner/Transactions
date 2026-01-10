'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';

/**
 * Create failed transaction records from CSV files for review
 * This allows retroactively creating failed transaction records
 * for files that were uploaded before the failed transaction feature was added
 */
export async function createFailedTransactionsFromCSV(
  csvFilePath: string,
  sourceFilename: string
): Promise<{
  success: boolean;
  message: string;
  created: number;
  errors: string[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  if (!existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }

  const errors: string[] = [];
  let created = 0;

  try {
    // Parse CSV
    const content = readFileSync(csvFilePath, 'utf-8');
    const result = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRows = result.data as any[];
    const columns = detectColumns(csvRows);
    const normalizationResult = normalizeTransactions(csvRows, columns);

    // Filter out payment and credit_card_payment errors (these are expected to skip)
    const fixableErrors = normalizationResult.errors.filter(
      e => e.reason !== 'payment' && e.reason !== 'credit_card_payment'
    );

    if (fixableErrors.length === 0) {
      return {
        success: true,
        message: 'No failed transactions found in this file',
        created: 0,
        errors: [],
      };
    }

    // Get source file
    const { data: sourceFiles } = await supabase
      .from('source_files')
      .select('id')
      .eq('filename', sourceFilename)
      .eq('user_id', user.id)
      .limit(1);

    if (!sourceFiles || sourceFiles.length === 0) {
      throw new Error(`Source file not found: ${sourceFilename}. Please upload the file first.`);
    }

    const sourceFileId = sourceFiles[0].id;

    // Check which transactions already exist in database
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('date, merchant_normalized, amount')
      .eq('source_file_id', sourceFileId)
      .eq('user_id', user.id);

    const existingMap = new Map<string, boolean>();
    (existingTransactions || []).forEach((t: any) => {
      const key = `${t.date}|${t.merchant_normalized}|${Math.abs(Number(t.amount)).toFixed(2)}`;
      existingMap.set(key, true);
    });

    // Create failed transaction records
    const failedTransactionsToInsert = [];

    for (const error of fixableErrors) {
      // Try to extract basic info from the row
      const dateCol = Object.keys(error.row).find(k => /date/i.test(k));
      const merchantCol = Object.keys(error.row).find(k => /description|merchant/i.test(k));
      const amountCol = Object.keys(error.row).find(k => /amount/i.test(k));

      // Try to parse what we can
      let date: string | null = null;
      let merchant: string | null = null;
      let amount: number | null = null;

      if (dateCol && error.row[dateCol]) {
        try {
          const dateValue = error.row[dateCol];
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

      if (merchantCol && error.row[merchantCol]) {
        merchant = String(error.row[merchantCol]).trim().substring(0, 255) || null;
      }

      if (amountCol && error.row[amountCol]) {
        try {
          const amountStr = String(error.row[amountCol]).replace(/[$,\s]/g, '');
          const parsed = parseFloat(amountStr);
          if (!isNaN(parsed)) {
            amount = parsed;
          }
        } catch {
          // Keep as null
        }
      }

      // Only insert if we have at least some data
      if (date || merchant || amount !== null) {
        const merchantNormalized = merchant ? merchant.toLowerCase().trim().substring(0, 255) : 'unknown merchant';
        const amountValue = amount || 0;
        const dateValue = date || new Date().toISOString().split('T')[0];

        // Check if this transaction already exists
        const key = `${dateValue}|${merchantNormalized}|${Math.abs(amountValue).toFixed(2)}`;
        if (existingMap.has(key)) {
          continue; // Skip if already exists
        }

        // Check if a failed transaction with same error already exists
        const { data: existingFailed } = await supabase
          .from('transactions')
          .select('id')
          .eq('source_file_id', sourceFileId)
          .eq('user_id', user.id)
          .eq('date', dateValue)
          .eq('merchant_normalized', merchantNormalized)
          .eq('amount', amountValue)
          .eq('import_error_reason', error.reason)
          .limit(1);

        if (existingFailed && existingFailed.length > 0) {
          continue; // Already exists
        }

        failedTransactionsToInsert.push({
          date: dateValue,
          merchant_raw: merchant || 'UNKNOWN MERCHANT',
          merchant_normalized: merchantNormalized,
          amount: amountValue,
          category_id: null,
          confidence_score: null,
          status: 'pending_review' as const,
          source_file_id: sourceFileId,
          user_id: user.id,
          import_error_reason: error.reason,
          import_error_message: error.error.substring(0, 500),
        });
      }
    }

    if (failedTransactionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(failedTransactionsToInsert);

      if (insertError) {
        errors.push(`Failed to insert failed transactions: ${insertError.message}`);
        return {
          success: false,
          message: `Failed to create failed transaction records: ${insertError.message}`,
          created: 0,
          errors,
        };
      }

      created = failedTransactionsToInsert.length;
    }

    return {
      success: true,
      message: `Created ${created} failed transaction record(s) for review`,
      created,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      created: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

