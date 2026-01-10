import { RawCSVRow } from '@/lib/types/database';
import { DetectedColumns } from './column-detector';

/**
 * Amount Sign Convention:
 * - 'negative': Spending is represented as negative amounts (e.g., Chase credit cards)
 * - 'positive': Spending is represented as positive amounts (e.g., debit cards, activity.csv)
 */
export type AmountSignConvention = 'negative' | 'positive';

/**
 * Parse amount from various formats (handles currency symbols, commas, negatives)
 */
function parseAmount(amountValue: string | number | null): number | null {
  if (amountValue === null || amountValue === undefined) {
    return null;
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
    return null;
  }

  return parsed;
}

/**
 * Detect the amount sign convention from CSV data
 * 
 * Strategy:
 * 1. Check filename for known patterns (Chase = negative)
 * 2. Analyze the actual amounts in the data:
 *    - If most non-zero amounts are negative → 'negative' convention
 *    - If most non-zero amounts are positive → 'positive' convention
 * 3. Default to 'negative' if unclear (most credit cards use this)
 */
export function detectAmountConvention(
  rows: RawCSVRow[],
  columns: DetectedColumns,
  filename: string
): AmountSignConvention {
  // Step 1: Check filename for known patterns
  const filenameLower = filename.toLowerCase();
  if (filenameLower.includes('chase')) {
    return 'negative';
  }
  
  // Step 2: Analyze actual amounts in the data
  const amounts: number[] = [];
  
  for (const row of rows) {
    const amount = parseAmount(row[columns.amountColumn]);
    if (amount !== null && amount !== 0) {
      amounts.push(amount);
    }
  }
  
  if (amounts.length === 0) {
    // No amounts found, default to negative (most common for credit cards)
    return 'negative';
  }
  
  // Count positive vs negative amounts
  const positiveCount = amounts.filter(a => a > 0).length;
  const negativeCount = amounts.filter(a => a < 0).length;
  
  // If significantly more negative amounts, it's negative convention
  if (negativeCount > positiveCount * 1.5) {
    return 'negative';
  }
  
  // If significantly more positive amounts, it's positive convention
  if (positiveCount > negativeCount * 1.5) {
    return 'positive';
  }
  
  // If roughly equal, check the absolute totals
  const positiveTotal = amounts.filter(a => a > 0).reduce((sum, a) => sum + Math.abs(a), 0);
  const negativeTotal = amounts.filter(a => a < 0).reduce((sum, a) => sum + Math.abs(a), 0);
  
  if (negativeTotal > positiveTotal * 1.2) {
    return 'negative';
  }
  
  if (positiveTotal > negativeTotal * 1.2) {
    return 'positive';
  }
  
  // Default to negative (most credit cards use this)
  return 'negative';
}




