import { RawCSVRow } from '@/lib/types/database';

export type DetectedColumns = {
  dateColumn: string;
  merchantColumn: string;
  amountColumn: string;
};

/**
 * Common patterns for detecting date columns
 */
const DATE_PATTERNS = [
  /^date$/i,
  /transaction.*date/i,
  /posted.*date/i,
  /^date$/i,
  /trans.*date/i,
];

/**
 * Common patterns for detecting merchant columns
 */
const MERCHANT_PATTERNS = [
  /^merchant$/i,
  /description/i,
  /^vendor$/i,
  /payee/i,
  /^name$/i,
  /merchant.*name/i,
  /transaction.*description/i,
];

/**
 * Common patterns for detecting amount columns
 */
const AMOUNT_PATTERNS = [
  /^amount$/i,
  /transaction.*amount/i,
  /^total$/i,
  /^debit$/i,
  /^credit$/i,
  /balance/i,
];

/**
 * Detect date, merchant, and amount columns from CSV headers
 */
export function detectColumns(rows: RawCSVRow[]): DetectedColumns {
  if (rows.length === 0) {
    throw new Error('No rows found in CSV');
  }

  const headers = Object.keys(rows[0]);
  
  // Find date column
  let dateColumn = headers.find(h => DATE_PATTERNS.some(p => p.test(h)));
  if (!dateColumn) {
    // Try to find any column with date-like values
    dateColumn = headers.find(h => {
      const sampleValue = rows[0][h];
      if (typeof sampleValue === 'string') {
        return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(sampleValue) || 
               /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(sampleValue);
      }
      return false;
    });
  }

  // Find merchant column
  let merchantColumn = headers.find(h => MERCHANT_PATTERNS.some(p => p.test(h)));
  if (!merchantColumn) {
    // Try to find a text column with the longest average values
    const textColumns = headers.filter(h => {
      const sampleValue = rows[0][h];
      return typeof sampleValue === 'string' && sampleValue.length > 5;
    });
    if (textColumns.length > 0) {
      merchantColumn = textColumns[0]; // Take first text column as fallback
    }
  }

  // Find amount column
  let amountColumn = headers.find(h => AMOUNT_PATTERNS.some(p => p.test(h)));
  if (!amountColumn) {
    // Try to find numeric columns
    amountColumn = headers.find(h => {
      const sampleValue = rows[0][h];
      if (typeof sampleValue === 'number') return true;
      if (typeof sampleValue === 'string') {
        // Check if it's a numeric string (with possible currency symbols)
        return /^-?\$?\d+\.?\d*$/.test(sampleValue.replace(/,/g, ''));
      }
      return false;
    });
  }

  // Validate all required columns found
  if (!dateColumn) {
    throw new Error('Could not detect date column. Please ensure your CSV has a date column.');
  }
  if (!merchantColumn) {
    throw new Error('Could not detect merchant/description column. Please ensure your CSV has a merchant or description column.');
  }
  if (!amountColumn) {
    throw new Error('Could not detect amount column. Please ensure your CSV has an amount column.');
  }

  return {
    dateColumn,
    merchantColumn,
    amountColumn,
  };
}




