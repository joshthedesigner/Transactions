import { RawCSVRow, NormalizedTransaction } from '@/lib/types/database';
import { DetectedColumns } from './column-detector';
import { parse } from 'date-fns';

/**
 * Normalize merchant name (remove extra spaces, convert to lowercase, remove common suffixes)
 */
export function normalizeMerchant(merchant: string | null | undefined): string {
  if (!merchant) {
    return '';
  }
  return merchant
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, ' ') // Replace multiple spaces again after cleanup
    .trim();
}

/**
 * Parse date from various formats
 */
function parseDate(dateValue: string | number | null): Date {
  if (!dateValue) {
    throw new Error('Date value is null or empty');
  }

  const dateStr = String(dateValue);
  
  // Try common date formats (including more variations)
  const formats = [
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'M/d/yyyy',
    'MM/d/yyyy',
    'M/dd/yyyy',
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd/M/yyyy',
    'd/MM/yyyy',
    'yyyy/MM/dd',
    'yyyy/M/dd',
    'yyyy/MM/d',
    'MM-dd-yyyy',
    'M-d-yyyy',
    'MM-d-yyyy',
    'M-dd-yyyy',
  ];

  for (const format of formats) {
    try {
      const parsed = parse(dateStr, format, new Date());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Continue to next format
    }
  }

  // Fallback to native Date parsing
  const nativeDate = new Date(dateStr);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  throw new Error(`Could not parse date: ${dateStr}`);
}

/**
 * Parse amount from various formats (handles currency symbols, commas, negatives)
 */
function parseAmount(amountValue: string | number | null): number {
  if (amountValue === null || amountValue === undefined) {
    throw new Error('Amount value is null or empty');
  }

  if (typeof amountValue === 'number') {
    return amountValue;
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = String(amountValue)
    .replace(/[$,\s]/g, '')
    .trim();

  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) {
    throw new Error(`Could not parse amount: ${amountValue}`);
  }

  return parsed;
}

/**
 * Check if transaction is a credit card payment (to ignore)
 * 
 * Note: We check for payment patterns in the merchant name, regardless of amount sign.
 * The amount sign convention is handled separately during calculation.
 */
function isCreditCardPayment(merchantNormalized: string): boolean {
  // Only skip rows that explicitly mention credit card or statement payments
  const paymentPatterns = [
    /credit.*card.*payment/i,
    /statement.*payment/i,
    /online.*payment/i,
    /mobile payment/i,
  ];

  return paymentPatterns.some((pattern) => pattern.test(merchantNormalized));
}

export type NormalizationResult = {
  transactions: NormalizedTransaction[];
  errors: Array<{
    row: RawCSVRow;
    error: string;
    reason: 'date_parse' | 'amount_parse' | 'empty_merchant' | 'zero_amount' | 'payment' | 'credit_card_payment' | 'other';
  }>;
};

/**
 * Normalize raw CSV rows into structured transactions
 * Returns both successful transactions and errors for better reporting
 */
export function normalizeTransactions(
  rows: RawCSVRow[],
  columns: DetectedColumns
): NormalizationResult {
  const normalized: NormalizedTransaction[] = [];
  const errors: NormalizationResult['errors'] = [];

  for (const row of rows) {
    try {
      // Check if this row is a payment (look for Type column or similar)
      const typeColumn = Object.keys(row).find(key => /^type$/i.test(key));
      if (typeColumn) {
        const typeValue = row[typeColumn];
        if (typeValue && String(typeValue).toLowerCase() === 'payment') {
          errors.push({
            row,
            error: 'Payment transaction (skipped)',
            reason: 'payment',
          });
          continue; // Skip payment transactions
        }
      }

      // Validate columns exist
      if (!columns.dateColumn || !columns.merchantColumn || !columns.amountColumn) {
        errors.push({
          row,
          error: 'Missing required columns',
          reason: 'missing_columns',
        });
        continue;
      }

      let date: Date;
      try {
        const dateValue = row[columns.dateColumn];
        if (dateValue === undefined || dateValue === null) {
          throw new Error('Date value is null or undefined');
        }
        date = parseDate(dateValue);
      } catch (error) {
        errors.push({
          row,
          error: error instanceof Error ? error.message : 'Date parse error',
          reason: 'date_parse',
        });
        continue;
      }

      const merchantValue = row[columns.merchantColumn];
      const merchantRaw = merchantValue ? String(merchantValue).trim() : '';
      
      // Skip empty rows
      if (!merchantRaw || merchantRaw.length === 0) {
        errors.push({
          row,
          error: 'Empty merchant name',
          reason: 'empty_merchant',
        });
        continue;
      }

      const merchantNormalized = normalizeMerchant(merchantRaw);

      // Skip credit card payments (based on merchant name pattern, not amount sign)
      if (isCreditCardPayment(merchantNormalized)) {
        errors.push({
          row,
          error: 'Credit card payment pattern detected',
          reason: 'credit_card_payment',
        });
        continue;
      }

      let amount: number;
      try {
        amount = parseAmount(row[columns.amountColumn]);
      } catch (error) {
        errors.push({
          row,
          error: error instanceof Error ? error.message : 'Amount parse error',
          reason: 'amount_parse',
        });
        continue;
      }
      
      // If amount is 0, skip
      if (amount === 0) {
        errors.push({
          row,
          error: 'Zero amount',
          reason: 'zero_amount',
        });
        continue;
      }
      
      // IMPORTANT: Store amounts as-is from the CSV
      // The amount sign convention is detected separately and stored in source_files
      // This allows us to handle different bank formats consistently

      normalized.push({
        date,
        merchant: merchantNormalized,
        amount,
      });
    } catch (error) {
      // Catch any other unexpected errors
      errors.push({
        row,
        error: error instanceof Error ? error.message : 'Unknown error',
        reason: 'other',
      });
      console.warn(`Skipping row due to unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`, row);
    }
  }

  return { transactions: normalized, errors };
}

