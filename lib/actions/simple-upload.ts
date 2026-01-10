'use server';

import { createClient } from '@/lib/supabase/server';
import { parseFile } from '@/lib/utils/csv-parser';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';
import { detectAmountConvention } from '@/lib/utils/amount-convention-detector';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export type FileUploadResult = {
  filename: string;
  success: boolean;
  message: string;
  transactionCount?: number;
  totalValue?: number;
  errors?: string[];
  details?: {
    rowsProcessed: number;
    rowsNormalized: number;
    rowsSkipped: number;
    insertCount: number;
    totalValue: number;
  };
};

export type SimpleUploadResult = {
  success: boolean;
  message: string;
  totalTransactionCount: number;
  totalValue: number;
  fileResults: FileUploadResult[];
};

/**
 * Ultra-simple upload - just parse, normalize, and insert. No categorization, no review.
 * Handles multiple files at once.
 */
export async function simpleUpload(formData: FormData): Promise<SimpleUploadResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        success: false,
        message: 'Not authenticated',
        totalTransactionCount: 0,
        fileResults: [],
      };
    }

    // Get all files
    const files = formData.getAll('file') as File[];
    if (files.length === 0) {
      return {
        success: false,
        message: 'No files provided',
        totalTransactionCount: 0,
        fileResults: [],
      };
    }

    const fileResults: FileUploadResult[] = [];
    let totalInserted = 0;
    let totalValue = 0;

    // Process each file
    for (const file of files) {
      const fileResult = await processFile(file, user.id, supabase);
      fileResults.push(fileResult);
      if (fileResult.success && fileResult.transactionCount) {
        totalInserted += fileResult.transactionCount;
      }
      if (fileResult.totalValue) {
        totalValue += fileResult.totalValue;
      }
    }

    return {
      success: totalInserted > 0,
      message: `Processed ${files.length} file(s). Inserted ${totalInserted} total transactions.`,
      totalTransactionCount: totalInserted,
      totalValue: totalValue,
      fileResults,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      totalTransactionCount: 0,
      fileResults: [],
    };
  }
}

async function processFile(file: File, userId: string, supabase: any): Promise<FileUploadResult> {
  try {

    // Parse file
    const sheets = await parseFile(file);
    if (sheets.length === 0) {
      return {
        filename: file.name,
        success: false,
        message: 'No data found in file',
      };
    }

    // Detect convention from first sheet
    let amountConvention: 'negative' | 'positive' = 'negative';
    if (sheets[0].length > 0) {
      try {
        // First detect columns to use in convention detection
        const columns = detectColumns(sheets[0]);
        amountConvention = detectAmountConvention(sheets[0], columns, file.name);
      } catch (error) {
        // If column detection fails, default to negative
        // Convention will be detected properly later when we process the sheet
        amountConvention = file.name.toLowerCase().includes('chase') ? 'negative' : 'positive';
      }
    }

    // Create source file record
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { data: sourceFile, error: sourceFileError } = await supabase
      .from('source_files')
      .insert({
        filename: sanitizedFilename,
        user_id: userId,
        amount_sign_convention: amountConvention,
      })
      .select()
      .single();

    if (sourceFileError || !sourceFile) {
      return {
        filename: file.name,
        success: false,
        message: `Failed to create source file: ${sourceFileError?.message}`,
      };
    }

    const errors: string[] = [];
    let totalRowsProcessed = 0;
    let totalRowsNormalized = 0;
    let totalRowsSkipped = 0;
    let totalInserted = 0;
    let totalValue = 0;

    // Process each sheet
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
      const rows = sheets[sheetIndex];
      totalRowsProcessed += rows.length;

      try {
        // Detect columns
        let columns;
        try {
          columns = detectColumns(rows);
        } catch (error) {
          errors.push(`Sheet ${sheetIndex + 1}: Column detection failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
          continue;
        }

        // Normalize
        let normalizationResult;
        try {
          normalizationResult = normalizeTransactions(rows, columns);
        } catch (error) {
          errors.push(`Sheet ${sheetIndex + 1}: Normalization failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
          continue;
        }
        
        const normalized = normalizationResult.transactions;
        totalRowsNormalized += normalized.length;
        totalRowsSkipped += normalizationResult.errors.length;

        if (normalized.length === 0) {
          errors.push(`Sheet ${sheetIndex + 1}: No valid transactions after normalization`);
          continue;
        }

        // Calculate total value (convert to spending amounts first, then sum)
        const sheetTotalValue = normalized.reduce((sum, t) => {
          const spendingAmount = calculateSpendingAmount(t.amount, amountConvention);
          return sum + spendingAmount;
        }, 0);
        totalValue += sheetTotalValue;

        // Insert directly - all approved, no categorization
        const transactionsToInsert = normalized.map((transaction) => ({
          date: transaction.date.toISOString().split('T')[0],
          merchant_raw: transaction.merchant,
          merchant_normalized: transaction.merchant,
          amount: transaction.amount,
          category_id: null,
          confidence_score: null,
          status: 'approved' as const,
          source_file_id: sourceFile.id,
          user_id: userId,
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from('transactions')
          .insert(transactionsToInsert)
          .select('id');

        if (insertError) {
          errors.push(`Sheet ${sheetIndex + 1}: Insert failed - ${insertError.message}`);
          continue;
        }

        totalInserted += insertedData?.length || 0;

      } catch (error) {
        errors.push(`Sheet ${sheetIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      filename: file.name,
      success: totalInserted > 0,
      message: totalInserted > 0 
        ? `Successfully inserted ${totalInserted} transactions`
        : 'No transactions were inserted',
      transactionCount: totalInserted,
      totalValue: totalValue,
      errors: errors.length > 0 ? errors : undefined,
      details: {
        rowsProcessed: totalRowsProcessed,
        rowsNormalized: totalRowsNormalized,
        rowsSkipped: totalRowsSkipped,
        insertCount: totalInserted,
        totalValue: totalValue,
      },
    };

  } catch (error) {
    return {
      filename: file.name,
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

