'use server';

import { createClient } from '@/lib/supabase/server';
import { parseFile } from '@/lib/utils/csv-parser';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { categorizeTransactions } from '@/lib/utils/categorization/pipeline';
import { detectAmountConvention } from '@/lib/utils/amount-convention-detector';
import { NormalizedTransaction } from '@/lib/types/database';

export type UploadResult = {
  success: boolean;
  message: string;
  transactionCount?: number;
  reviewCount?: number;
  approvedCount?: number;
  failedCount?: number; // Count of transactions that failed import
  errors?: string[];
};

/**
 * Main server action to upload and process CSV/Excel file
 * 
 * @deprecated This function is deprecated. Use `uploadTransactionsV2()` instead.
 * This function uses the legacy `transactions` table which is being phased out.
 * All new uploads should use `uploadTransactionsV2()` which uses `transactions_v2`.
 */
export async function uploadTransactions(formData: FormData): Promise<UploadResult> {
  try {
    console.log('[Upload] Starting file upload process...');
    const supabase = await createClient();

    // Get current user
    console.log('[Upload] Checking authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Upload] Auth error:', authError);
      return {
        success: false,
        message: 'You must be logged in to upload transactions',
      };
    }
    console.log('[Upload] User authenticated:', user.id);

    // Extract file from FormData
    const file = formData.get('file') as File;
    if (!file) {
      return {
        success: false,
        message: 'No file provided',
      };
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['csv', 'xlsx', 'xls'];
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      return {
        success: false,
        message: `Invalid file type. Please upload CSV or Excel files (.csv, .xlsx, .xls). Got: ${fileExtension || 'unknown'}`,
      };
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        success: false,
        message: `File too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      };
    }

    // Sanitize filename
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Step 1: Parse file (handles multi-sheet Excel files)
    console.log('[Upload] Parsing file...');
    const sheets = await parseFile(file);
    console.log('[Upload] File parsed, found', sheets.length, 'sheet(s)');

    // Step 2: Detect amount sign convention from first sheet
    // This determines how spending is represented (negative vs positive)
    let amountConvention: 'negative' | 'positive' = 'negative'; // default
    if (sheets.length > 0 && sheets[0].length > 0) {
      try {
        const columns = detectColumns(sheets[0]);
        amountConvention = detectAmountConvention(sheets[0], columns, file.name);
        console.log(`[Upload] Detected amount convention: ${amountConvention} (from filename: ${file.name})`);
      } catch (error) {
        console.warn('[Upload] Could not detect amount convention, defaulting to negative:', error);
      }
    }

    // Step 3: Process each sheet
    let totalTransactions = 0;
    let totalReviewCount = 0;
    let totalApprovedCount = 0;
    let totalFailedCount = 0;
    const errors: string[] = [];

    // Check if database tables exist by testing a simple query
    console.log('[Upload] Checking database connection...');
    const { error: tableCheckError } = await supabase
      .from('categories')
      .select('id')
      .limit(1);
    
    if (tableCheckError) {
      console.error('[Upload] Database error:', tableCheckError);
      return {
        success: false,
        message: `Database connection error: ${tableCheckError.message}. Please ensure you have run the database migration (see DATABASE_SETUP.md)`,
      };
    }
    console.log('[Upload] Database connection verified');

    // Create source_file record with amount convention
    console.log('[Upload] Creating source file record...');
    const { data: sourceFile, error: sourceFileError } = await supabase
      .from('source_files')
      .insert({
        filename: sanitizedFilename,
        user_id: user.id,
        amount_sign_convention: amountConvention,
      })
      .select()
      .single();

    if (sourceFileError || !sourceFile) {
      console.error('[Upload] Source file error:', sourceFileError);
      return {
        success: false,
        message: `Failed to create source file record: ${sourceFileError?.message || 'Unknown error'}. Make sure you have run the database migration (see DATABASE_SETUP.md).`,
      };
    }
    console.log('[Upload] Source file created:', sourceFile.id, 'with convention:', amountConvention);

    // Process each sheet
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
      const rows = sheets[sheetIndex];

      try {
        // Step 3: Detect columns
        const columns = detectColumns(rows);

        // Step 4: Normalize transactions
        console.log(`[Upload] Sheet ${sheetIndex + 1}: Starting normalization of ${rows.length} rows...`);
        const normalizationResult = normalizeTransactions(rows, columns);
        const normalized = normalizationResult.transactions;
        console.log(`[Upload] Sheet ${sheetIndex + 1}: Normalized ${normalized.length} transactions, ${normalizationResult.errors.length} errors`);

        // Filter out payment and credit_card_payment errors (these are expected to skip)
        const fixableErrors = normalizationResult.errors.filter(
          e => e.reason !== 'payment' && e.reason !== 'credit_card_payment'
        );

        // Report normalization errors
        if (normalizationResult.errors.length > 0) {
          const errorCounts = normalizationResult.errors.reduce((acc, err) => {
            acc[err.reason] = (acc[err.reason] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          const errorSummary = Object.entries(errorCounts)
            .map(([reason, count]) => `${reason}: ${count}`)
            .join(', ');
          
          console.log(`[Upload] Sheet ${sheetIndex + 1}: ${normalizationResult.errors.length} rows skipped (${errorSummary})`);
          
          // If ALL rows were skipped, log first few errors for debugging
          if (normalized.length === 0 && normalizationResult.errors.length > 0) {
            console.warn(`[Upload] WARNING: Sheet ${sheetIndex + 1} - ALL ${rows.length} rows were skipped during normalization!`);
            console.warn(`[Upload] First 5 errors:`, normalizationResult.errors.slice(0, 5).map(e => ({
              reason: e.reason,
              error: e.error.substring(0, 100),
              row: Object.keys(e.row).slice(0, 5)
            })));
          }
        }

        // Step 4b: Create failed transaction records for fixable errors
        if (fixableErrors.length > 0) {
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
                  // Try to parse it
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
              failedTransactionsToInsert.push({
                date: date || new Date().toISOString().split('T')[0], // Default to today if can't parse
                merchant_raw: merchant || 'UNKNOWN MERCHANT',
                merchant_normalized: merchant ? merchant.toLowerCase().trim().substring(0, 255) : 'unknown merchant',
                amount: amount || 0,
                category_id: null,
                confidence_score: null,
                status: 'pending_review' as const,
                source_file_id: sourceFile.id,
                user_id: user.id,
                // Store error info for review
                import_error_reason: error.reason,
                import_error_message: error.error.substring(0, 500), // Limit length
              });
            }
          }
          
          if (failedTransactionsToInsert.length > 0) {
            console.log(`[Upload] Creating ${failedTransactionsToInsert.length} failed transaction records for review...`);
            console.log(`[Upload] Sample failed transaction:`, JSON.stringify(failedTransactionsToInsert[0], null, 2));
            const { data: insertedFailed, error: failedInsertError } = await supabase
              .from('transactions')
              .insert(failedTransactionsToInsert)
              .select('id');
            
            if (failedInsertError) {
              console.error(`[Upload] Failed to insert failed transactions:`, failedInsertError);
              console.error(`[Upload] Error details:`, JSON.stringify(failedInsertError, null, 2));
              errors.push(`Sheet ${sheetIndex + 1}: Failed to create failed transaction records - ${failedInsertError.message}. Make sure you've run the migration to add import_error columns.`);
            } else {
              console.log(`[Upload] Created ${insertedFailed?.length || 0} failed transaction records`);
              if ((insertedFailed?.length || 0) !== failedTransactionsToInsert.length) {
                console.warn(`[Upload] Expected to create ${failedTransactionsToInsert.length} but only created ${insertedFailed?.length || 0}`);
              }
            }
          }
        }

        if (normalized.length === 0 && fixableErrors.length === 0) {
          const errorMsg = `Sheet ${sheetIndex + 1}: No valid transactions found after normalization. ${rows.length} rows processed, ${normalizationResult.errors.length} errors.`;
          console.error(`[Upload] ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }
        
        if (normalized.length === 0 && fixableErrors.length > 0) {
          console.log(`[Upload] Sheet ${sheetIndex + 1}: No normalized transactions, but ${fixableErrors.length} fixable errors will be created as failed transactions`);
        }

        // Step 5: Categorize transactions
        console.log(`[Upload] Categorizing ${normalized.length} transactions from sheet ${sheetIndex + 1}...`);
        const categorizationResults = await categorizeTransactions(normalized, user.id);
        console.log(`[Upload] Categorization complete for sheet ${sheetIndex + 1}`);

        // Step 6: Insert transactions into database
        const transactionsToInsert = normalized.map((transaction, index) => {
          const result = categorizationResults[index];
          return {
            date: transaction.date.toISOString().split('T')[0], // Format as YYYY-MM-DD
            merchant_raw: transaction.merchant,
            merchant_normalized: transaction.merchant,
            amount: transaction.amount,
            category_id: result.categoryId,
            confidence_score: result.confidenceScore,
            status: result.status,
            source_file_id: sourceFile.id,
            user_id: user.id,
          };
        });

        console.log(`[Upload] Inserting ${transactionsToInsert.length} transactions from sheet ${sheetIndex + 1}...`);
        const { data: insertedData, error: insertError } = await supabase
          .from('transactions')
          .insert(transactionsToInsert)
          .select('id');

        if (insertError) {
          console.error(`[Upload] Insert error for sheet ${sheetIndex + 1}:`, insertError);
          errors.push(`Sheet ${sheetIndex + 1}: Failed to insert transactions - ${insertError.message}`);
          continue;
        }

        console.log(`[Upload] Successfully inserted ${insertedData?.length || 0} transactions from sheet ${sheetIndex + 1}`);

        // Count statuses
        const reviewCount = categorizationResults.filter(r => r.status === 'pending_review').length;
        const approvedCount = categorizationResults.filter(r => r.status === 'approved').length;

        totalTransactions += normalized.length;
        totalReviewCount += reviewCount;
        totalApprovedCount += approvedCount;
        totalFailedCount += fixableErrors.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Sheet ${sheetIndex + 1}: ${errorMessage}`);
      }
    }

    if (totalTransactions === 0) {
      return {
        success: false,
        message: 'No transactions were processed. Please check your file format.',
        errors,
      };
    }

    return {
      success: true,
      message: `Successfully processed ${totalTransactions} transaction(s)`,
      transactionCount: totalTransactions,
      reviewCount: totalReviewCount + totalFailedCount, // Include failed in review count
      approvedCount: totalApprovedCount,
      failedCount: totalFailedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('[Upload] Fatal error:', error);
    console.error('[Upload] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

