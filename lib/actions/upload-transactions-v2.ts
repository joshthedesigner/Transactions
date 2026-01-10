'use server';

import { createClient } from '@/lib/supabase/server';
import { parseFile } from '@/lib/utils/csv-parser';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { detectAmountConvention } from '@/lib/utils/amount-convention-detector';
import { categorizeTransactions } from '@/lib/utils/categorization/pipeline';
import {
  TransactionV2Insert,
  calculateSpendingAmount,
  generateFileHash,
  normalizeMerchant,
  isPaymentMerchant,
  validateTransaction,
  AmountConvention,
} from '@/lib/types/transactions-v2';

export type FileUploadResult = {
  filename: string;
  success: boolean;
  message: string;
  transactionCount: number;
  totalSpending: number;
  errors?: string[];
};

export type UploadResult = {
  success: boolean;
  message: string;
  totalTransactions: number;
  totalSpending: number;
  fileResults: FileUploadResult[];
};

/**
 * Atomic upload function for transactions_v2
 * 
 * Principles:
 * - All-or-nothing: entire file upload succeeds or fails
 * - Duplicate protection: checks source_file_hash before upload
 * - Pre-calculates amount_spending at upload time
 * - Validates all constraints before insert
 */
export async function uploadTransactionsV2(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      message: 'Not authenticated',
      totalTransactions: 0,
      totalSpending: 0,
      fileResults: [],
    };
  }

  // Extract files from FormData
  const files = formData.getAll('files') as File[];
  
  if (!files || files.length === 0) {
    return {
      success: false,
      message: 'No files provided',
      totalTransactions: 0,
      totalSpending: 0,
      fileResults: [],
    };
  }

  const fileResults: FileUploadResult[] = [];
  let totalTransactions = 0;
  let totalSpending = 0;

  // Process each file
  for (const file of files) {
    try {
      const result = await processSingleFile(file, user.id, supabase);
      fileResults.push(result);

      if (result.success) {
        totalTransactions += result.transactionCount;
        totalSpending += result.totalSpending;
      }
    } catch (error) {
      fileResults.push({
        filename: file.name,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        transactionCount: 0,
        totalSpending: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    }
  }

  const allSuccessful = fileResults.every((r) => r.success);
  const anySuccessful = fileResults.some((r) => r.success);

  return {
    success: allSuccessful,
    message: anySuccessful
      ? `Successfully uploaded ${fileResults.filter((r) => r.success).length} of ${files.length} file(s). ${totalTransactions} transactions, ${formatCurrency(totalSpending)} total.`
      : 'All uploads failed',
    totalTransactions,
    totalSpending,
    fileResults,
  };
}

/**
 * Process a single file atomically
 */
async function processSingleFile(
  file: File,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<FileUploadResult> {
  const filename = file.name;
  const uploadedAt = new Date();

  // Step 1: Generate file hash for duplicate detection
  const sourceFileHash = await generateFileHash(filename, userId, uploadedAt);

  // Step 2: Check for duplicate upload
  const { data: existing, error: checkError } = await supabase
    .from('transactions_v2')
    .select('id')
    .eq('user_id', userId)
    .eq('source_file_hash', sourceFileHash)
    .limit(1);

  if (checkError) {
    throw new Error(`Failed to check for duplicates: ${checkError.message}`);
  }

  if (existing && existing.length > 0) {
    return {
      filename,
      success: false,
      message: 'File already uploaded (duplicate detected)',
      transactionCount: 0,
      totalSpending: 0,
      errors: ['Duplicate file detected by source_file_hash'],
    };
  }

  // Step 3: Parse CSV
  const sheets = await parseFile(file);
  if (sheets.length === 0) {
    return {
      filename,
      success: false,
      message: 'No data found in file',
      transactionCount: 0,
      totalSpending: 0,
      errors: ['File is empty or could not be parsed'],
    };
  }

  // Step 4: Detect columns and convention from first sheet
  const rows = sheets[0];
  let columns;
  try {
    columns = detectColumns(rows);
  } catch (error) {
    return {
      filename,
      success: false,
      message: `Column detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      transactionCount: 0,
      totalSpending: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }

  const amountConvention = detectAmountConvention(rows, columns, filename);

  // Step 5: Normalize transactions
  const normalizationResult = normalizeTransactions(rows, columns);
  const normalizedRows = normalizationResult.transactions;

  if (normalizedRows.length === 0) {
    return {
      filename,
      success: false,
      message: 'No valid transactions after normalization',
      transactionCount: 0,
      totalSpending: 0,
      errors: normalizationResult.errors.map((e) => e.message || e.reason),
    };
  }

  // Step 5.5: Categorize transactions
  let categorizationResults: Array<{ categoryId: number | null; categoryName: string | null }> = [];
  try {
    const catResults = await categorizeTransactions(normalizedRows, userId);
    // Get category names for mapping
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name');
    
    const categoryMap = new Map(
      (categories || []).map((c) => [c.id, c.name])
    );

    categorizationResults = catResults.map((result) => ({
      categoryId: result.categoryId,
      categoryName: result.categoryId ? categoryMap.get(result.categoryId) || null : null,
    }));
  } catch (error) {
    // If categorization fails, continue without categories
    console.warn('Categorization failed, continuing without categories:', error);
    categorizationResults = normalizedRows.map(() => ({ categoryId: null, categoryName: null }));
  }

  // Step 6: Build TransactionV2Insert records
  const transactionsToInsert: TransactionV2Insert[] = [];
  const errors: string[] = [];

  for (let i = 0; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    const catResult = categorizationResults[i] || { categoryId: null, categoryName: null };
    
    try {
      const rawAmount = row.amount;
      const spendingAmount = calculateSpendingAmount(rawAmount, amountConvention);
      const merchantNormalized = normalizeMerchant(row.merchant);
      const isPayment = isPaymentMerchant(merchantNormalized);
      const isCredit = spendingAmount === 0 && rawAmount !== 0;

      const transaction: TransactionV2Insert = {
        user_id: userId,
        source_filename: filename,
        source_file_hash: sourceFileHash,
        uploaded_at: uploadedAt,
        transaction_date: row.date,
        merchant: merchantNormalized,
        amount_raw: rawAmount,
        amount_spending: spendingAmount,
        amount_convention: amountConvention,
        is_credit: isCredit,
        is_payment: isPayment,
        category: catResult.categoryName, // Use category name (TEXT) for transactions_v2
        notes: row.merchant !== merchantNormalized ? row.merchant : null,
      };

      // Validate transaction
      const validationError = validateTransaction(transaction);
      if (validationError) {
        errors.push(`Row ${row.date} ${row.merchant}: ${validationError}`);
        continue;
      }

      transactionsToInsert.push(transaction);
    } catch (error) {
      errors.push(`Row processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (transactionsToInsert.length === 0) {
    return {
      filename,
      success: false,
      message: 'No valid transactions after processing',
      transactionCount: 0,
      totalSpending: 0,
      errors,
    };
  }

  // Step 7: Calculate expected totals
  const expectedTotal = transactionsToInsert.reduce((sum, t) => sum + t.amount_spending, 0);

  // Step 8: Insert atomically (all or nothing)
  const { data: inserted, error: insertError } = await supabase
    .from('transactions_v2')
    .insert(transactionsToInsert)
    .select('id, amount_spending');

  if (insertError) {
    return {
      filename,
      success: false,
      message: `Insert failed: ${insertError.message}`,
      transactionCount: 0,
      totalSpending: 0,
      errors: [insertError.message, ...errors],
    };
  }

  // Step 9: Validate totals match
  const insertedCount = inserted?.length || 0;
  const insertedTotal = inserted?.reduce((sum, t) => sum + Number(t.amount_spending), 0) || 0;

  if (insertedCount !== transactionsToInsert.length) {
    return {
      filename,
      success: false,
      message: `Insert count mismatch: expected ${transactionsToInsert.length}, got ${insertedCount}`,
      transactionCount: insertedCount,
      totalSpending: insertedTotal,
      errors: ['Data integrity error: count mismatch'],
    };
  }

  if (Math.abs(insertedTotal - expectedTotal) > 0.01) {
    return {
      filename,
      success: false,
      message: `Total mismatch: expected ${formatCurrency(expectedTotal)}, got ${formatCurrency(insertedTotal)}`,
      transactionCount: insertedCount,
      totalSpending: insertedTotal,
      errors: ['Data integrity error: total mismatch'],
    };
  }

  return {
    filename,
    success: true,
    message: `Successfully inserted ${insertedCount} transactions`,
    transactionCount: insertedCount,
    totalSpending: insertedTotal,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
