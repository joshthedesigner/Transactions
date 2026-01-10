/**
 * Example Usage: transactions_v2
 * 
 * This file demonstrates how to:
 * 1. Create TransactionV2Insert from CSV row
 * 2. Normalize merchant and handle notes
 * 3. Call upload function safely
 * 4. Query and validate data
 */

import {
  TransactionV2Insert,
  calculateSpendingAmount,
  generateFileHash,
  normalizeMerchant,
  isPaymentMerchant,
  validateTransaction,
  AmountConvention,
} from '@/lib/types/transactions-v2';
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Example 1: Create TransactionV2Insert from CSV Row
// ============================================================================

/**
 * Example: Process a single CSV row into TransactionV2Insert
 */
export async function exampleCreateTransactionFromCSVRow() {
  // Simulated CSV row
  const csvRow = {
    date: '2025-01-15',
    merchant: 'AMZN MKTP US*1234',  // Raw merchant from CSV
    amount: '-45.99',
  };

  const userId = 'user-uuid-here';
  const filename = 'Chase2861_Activity.csv';
  const uploadedAt = new Date();
  const convention: AmountConvention = 'negative'; // Chase file

  // Step 1: Generate file hash
  const sourceFileHash = await generateFileHash(filename, userId, uploadedAt);

  // Step 2: Parse and normalize
  const rawAmount = parseFloat(csvRow.amount); // -45.99
  const spendingAmount = calculateSpendingAmount(rawAmount, convention); // 45.99
  const merchantNormalized = normalizeMerchant(csvRow.merchant); // "AMZN MKTP US*1234"
  const isPayment = isPaymentMerchant(merchantNormalized);
  const isCredit = spendingAmount === 0 && rawAmount !== 0;

  // Step 3: Create transaction
  const transaction: TransactionV2Insert = {
    user_id: userId,
    source_filename: filename,
    source_file_hash: sourceFileHash,
    uploaded_at: uploadedAt,
    transaction_date: new Date(csvRow.date),
    merchant: merchantNormalized, // Single merchant field
    amount_raw: rawAmount,
    amount_spending: spendingAmount, // Pre-calculated
    amount_convention: convention,
    is_credit: isCredit,
    is_payment: isPayment,
    category: null,
    // Store raw merchant in notes if it differs from normalized
    notes: csvRow.merchant !== merchantNormalized ? csvRow.merchant : null,
  };

  // Step 4: Validate
  const validationError = validateTransaction(transaction);
  if (validationError) {
    throw new Error(`Invalid transaction: ${validationError}`);
  }

  return transaction;
}

// ============================================================================
// Example 2: Upload Multiple Files
// ============================================================================

/**
 * Example: Upload multiple CSV files using the atomic upload function
 */
export async function exampleUploadFiles() {
  // Simulated file objects (in real app, these come from file input)
  const files: File[] = [
    new File(['csv content'], 'activity.csv', { type: 'text/csv' }),
    new File(['csv content'], 'Chase2861_Activity.csv', { type: 'text/csv' }),
    // ... more files
  ];

  try {
    const result = await uploadTransactionsV2(files);

    if (result.success) {
      console.log(`✅ Upload successful!`);
      console.log(`   Total transactions: ${result.totalTransactions}`);
      console.log(`   Total spending: $${result.totalSpending.toFixed(2)}`);

      // Check each file result
      result.fileResults.forEach((fileResult) => {
        if (fileResult.success) {
          console.log(`   ✓ ${fileResult.filename}: ${fileResult.transactionCount} transactions, $${fileResult.totalSpending.toFixed(2)}`);
        } else {
          console.log(`   ✗ ${fileResult.filename}: ${fileResult.message}`);
          if (fileResult.errors) {
            fileResult.errors.forEach((error) => console.log(`      - ${error}`));
          }
        }
      });
    } else {
      console.error(`❌ Upload failed: ${result.message}`);
    }

    return result;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// ============================================================================
// Example 3: Query User Totals
// ============================================================================

/**
 * Example: Get user's total spending (the critical query)
 */
export async function exampleGetUserTotals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // The critical query - must match upload totals
  const { data, error } = await supabase
    .from('transactions_v2')
    .select('amount_spending')
    .eq('user_id', user.id)
    .gt('amount_spending', 0); // Excludes credits/payments automatically

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  const totalSpending = data?.reduce((sum, row) => sum + Number(row.amount_spending), 0) || 0;
  const transactionCount = data?.length || 0;

  console.log(`Total: ${transactionCount} transactions, $${totalSpending.toFixed(2)}`);

  return {
    transactionCount,
    totalSpending,
  };
}

// ============================================================================
// Example 4: Check for Duplicate File
// ============================================================================

/**
 * Example: Check if a file has already been uploaded
 */
export async function exampleCheckDuplicateFile(filename: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const uploadedAt = new Date();
  const sourceFileHash = await generateFileHash(filename, user.id, uploadedAt);

  const { data, error } = await supabase
    .from('transactions_v2')
    .select('id, source_filename, uploaded_at')
    .eq('user_id', user.id)
    .eq('source_file_hash', sourceFileHash)
    .limit(1);

  if (error) {
    throw new Error(`Check failed: ${error.message}`);
  }

  if (data && data.length > 0) {
    console.log(`⚠️  File already uploaded: ${data[0].source_filename} at ${data[0].uploaded_at}`);
    return true;
  }

  console.log(`✓ File not uploaded yet`);
  return false;
}

// ============================================================================
// Example 5: Get Transactions by Date Range
// ============================================================================

/**
 * Example: Query transactions within a date range
 */
export async function exampleGetTransactionsByDateRange(startDate: string, endDate: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('transactions_v2')
    .select('transaction_date, merchant, amount_spending, category')
    .eq('user_id', user.id)
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .gt('amount_spending', 0) // Only spending, exclude credits/payments
    .order('transaction_date', { ascending: false });

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// Example 6: Aggregate by Merchant
// ============================================================================

/**
 * Example: Get spending totals grouped by merchant
 */
export async function exampleGetMerchantTotals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Note: Supabase doesn't support GROUP BY directly in select
  // This is a simplified example - in production, use a database function or view
  const { data, error } = await supabase
    .from('transactions_v2')
    .select('merchant, amount_spending')
    .eq('user_id', user.id)
    .gt('amount_spending', 0);

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  // Group by merchant in application code
  const merchantTotals = new Map<string, { count: number; total: number }>();

  data?.forEach((row) => {
    const merchant = row.merchant;
    const current = merchantTotals.get(merchant) || { count: 0, total: 0 };
    merchantTotals.set(merchant, {
      count: current.count + 1,
      total: current.total + Number(row.amount_spending),
    });
  });

  // Convert to array and sort
  const result = Array.from(merchantTotals.entries())
    .map(([merchant, stats]) => ({
      merchant,
      transactionCount: stats.count,
      totalSpending: stats.total,
    }))
    .sort((a, b) => b.totalSpending - a.totalSpending);

  return result;
}

// ============================================================================
// Example 7: Validate Data Integrity
// ============================================================================

/**
 * Example: Validate that all constraints are satisfied
 */
export async function exampleValidateDataIntegrity() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Check for constraint violations
  const { data, error } = await supabase
    .from('transactions_v2')
    .select('id, amount_spending, is_credit, is_payment, merchant')
    .eq('user_id', user.id);

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  const violations: string[] = [];

  data?.forEach((row) => {
    // Check spending flags constraint
    if (row.amount_spending > 0 && (row.is_credit || row.is_payment)) {
      violations.push(
        `Transaction ${row.id}: spending > 0 but flagged as credit/payment`
      );
    }

    if (row.amount_spending === 0 && !row.is_credit && !row.is_payment) {
      violations.push(
        `Transaction ${row.id}: spending = 0 but not flagged as credit/payment`
      );
    }

    if (row.amount_spending < 0) {
      violations.push(`Transaction ${row.id}: negative spending amount`);
    }

    // Check merchant constraint
    if (!row.merchant || row.merchant.trim().length === 0) {
      violations.push(`Transaction ${row.id}: empty merchant`);
    }
  });

  if (violations.length > 0) {
    console.error('❌ Data integrity violations found:');
    violations.forEach((v) => console.error(`   - ${v}`));
    return { valid: false, violations };
  }

  console.log('✅ All data integrity checks passed');
  return { valid: true, violations: [] };
}

// ============================================================================
// Example 8: List Uploaded Files
// ============================================================================

/**
 * Example: Get list of all uploaded files with statistics
 */
export async function exampleListUploadedFiles() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get distinct files
  const { data, error } = await supabase
    .from('transactions_v2')
    .select('source_filename, source_file_hash, uploaded_at')
    .eq('user_id', user.id);

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  // Group by file hash (unique uploads)
  const fileMap = new Map<
    string,
    {
      filename: string;
      uploadedAt: string;
      transactionCount: number;
      totalSpending: number;
    }
  >();

  data?.forEach((row) => {
    const hash = row.source_file_hash;
    const current = fileMap.get(hash) || {
      filename: row.source_filename,
      uploadedAt: row.uploaded_at,
      transactionCount: 0,
      totalSpending: 0,
    };

    // Note: This is simplified - in production, use a proper aggregation query
    // For accurate totals, query amount_spending separately
    fileMap.set(hash, {
      ...current,
      transactionCount: current.transactionCount + 1,
    });
  });

  return Array.from(fileMap.values()).sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

// ============================================================================
// Example 9: Complete Upload Flow with Validation
// ============================================================================

/**
 * Example: Complete upload flow with pre-upload checks and post-upload validation
 */
export async function exampleCompleteUploadFlow(files: File[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Step 1: Check for duplicates before upload
  for (const file of files) {
    const isDuplicate = await exampleCheckDuplicateFile(file.name);
    if (isDuplicate) {
      console.warn(`Skipping ${file.name} - already uploaded`);
      // Optionally: return early or skip this file
    }
  }

  // Step 2: Upload files (convert to FormData)
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  const uploadResult = await uploadTransactionsV2(formData);

  if (!uploadResult.success) {
    throw new Error(`Upload failed: ${uploadResult.message}`);
  }

  // Step 3: Validate totals match
  const { transactionCount, totalSpending } = await exampleGetUserTotals();

  console.log('Upload Summary:');
  console.log(`  Upload reported: ${uploadResult.totalTransactions} transactions, $${uploadResult.totalSpending.toFixed(2)}`);
  console.log(`  Database query: ${transactionCount} transactions, $${totalSpending.toFixed(2)}`);

  const countMatch = transactionCount === uploadResult.totalTransactions;
  const totalMatch = Math.abs(totalSpending - uploadResult.totalSpending) < 0.01;

  if (!countMatch || !totalMatch) {
    console.error('⚠️  Mismatch detected!');
    console.error(`  Count match: ${countMatch}`);
    console.error(`  Total match: ${totalMatch}`);
    // In production, this would trigger an alert or rollback
  } else {
    console.log('✅ Upload validated - totals match');
  }

  // Step 4: Validate data integrity
  const integrityCheck = await exampleValidateDataIntegrity();
  if (!integrityCheck.valid) {
    console.error('⚠️  Data integrity issues found');
  }

  return {
    uploadResult,
    validation: {
      countMatch,
      totalMatch,
      integrityCheck,
    },
  };
}

