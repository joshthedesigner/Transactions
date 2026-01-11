/**
 * TypeScript types for transactions_v2 table
 * Generated from migration: 004_create_transactions_v2.sql
 */

export type AmountConvention = 'positive' | 'negative';

export interface TransactionV2Insert {
  // User
  user_id: string;
  
  // Source file metadata
  source_filename: string;
  source_file_hash: string;
  uploaded_at: Date | string;
  
  // Transaction data
  transaction_date: Date | string;
  merchant: string;  // Canonical merchant name (single field, no raw/normalized split)
  
  // Amount handling (CRITICAL)
  amount_raw: number;
  amount_spending: number;  // Pre-calculated, always >= 0
  amount_convention: AmountConvention;
  is_credit: boolean;
  is_payment: boolean;
  
  // Optional
  category?: string | null;
  secondary_category?: string | null;
  notes?: string | null;
}

export interface TransactionV2 extends TransactionV2Insert {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface FileUploadSummary {
  source_filename: string;
  source_file_hash: string;
  uploaded_at: string;
  transaction_count: number;
  total_spending: number;
  credit_count: number;
  payment_count: number;
}

export interface UserTotals {
  user_id: string;
  total_transactions: number;
  total_spending: number;
  file_count: number;
  earliest_transaction: string;
  latest_transaction: string;
}

/**
 * Calculate spending amount from raw amount and convention
 * This is the CANONICAL calculation - use this everywhere
 */
export function calculateSpendingAmount(
  rawAmount: number,
  convention: AmountConvention
): number {
  if (convention === 'negative') {
    // Chase: negative = spending
    // -50.00 → 50.00 (spending)
    // +50.00 → 0 (credit, not spending)
    return rawAmount < 0 ? Math.abs(rawAmount) : 0;
  } else {
    // Amex: positive = spending
    // +50.00 → 50.00 (spending)
    // -50.00 → 0 (credit, not spending)
    return rawAmount > 0 ? rawAmount : 0;
  }
}

/**
 * Normalize merchant name from CSV
 * Cleans up merchant strings for consistent display/grouping
 * Raw CSV merchant can optionally be stored in notes field if needed
 */
export function normalizeMerchant(rawMerchant: string): string {
  if (!rawMerchant) return 'Unknown';
  
  // Trim whitespace
  let normalized = rawMerchant.trim();
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Optional: Add more normalization rules here
  // e.g., "AMZN MKTP" → "Amazon", "SQ *MERCHANT" → "Merchant"
  
  return normalized;
}

/**
 * Detect if a merchant name indicates a payment
 */
export function isPaymentMerchant(merchant: string): boolean {
  const normalized = merchant.toLowerCase();
  return (
    normalized.includes('automatic payment') ||
    normalized.includes('credit card payment') ||
    normalized.includes('payment thank you') ||
    normalized.includes('autopay')
  );
}

/**
 * Generate file hash for duplicate detection
 * Format: SHA256(filename + user_id + rounded_timestamp)
 */
export async function generateFileHash(
  filename: string,
  userId: string,
  uploadTimestamp: Date = new Date()
): Promise<string> {
  // Round to nearest hour to allow re-uploads after reasonable time
  const hourTimestamp = Math.floor(uploadTimestamp.getTime() / (1000 * 60 * 60));
  const input = `${filename}|${userId}|${hourTimestamp}`;
  
  // Use Web Crypto API (available in browsers and Node 15+)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Validation: Ensure spending amount matches flags
 */
export function validateTransaction(tx: TransactionV2Insert): string | null {
  if (tx.amount_spending > 0 && (tx.is_credit || tx.is_payment)) {
    return 'Transaction with spending > 0 cannot be marked as credit or payment';
  }
  
  if (tx.amount_spending === 0 && !tx.is_credit && !tx.is_payment) {
    return 'Transaction with spending = 0 must be marked as credit or payment';
  }
  
  if (tx.amount_spending < 0) {
    return 'amount_spending cannot be negative';
  }
  
  if (!tx.merchant || tx.merchant.trim().length === 0) {
    return 'merchant cannot be empty';
  }
  
  return null; // Valid
}

/**
 * Example: Create TransactionV2Insert from CSV row
 * 
 * @example
 * ```typescript
 * const csvRow = {
 *   date: '2025-01-15',
 *   merchant: 'AMZN MKTP US*1234',
 *   amount: '-45.99'
 * };
 * 
 * const convention = 'negative'; // Chase file
 * const fileHash = await generateFileHash(file, userId);
 * 
 * const transaction: TransactionV2Insert = {
 *   user_id: userId,
 *   source_filename: 'Chase2861_Activity.csv',
 *   source_file_hash: fileHash,
 *   uploaded_at: new Date(),
 *   transaction_date: new Date(csvRow.date),
 *   merchant: normalizeMerchant(csvRow.merchant), // "AMZN MKTP US*1234" → cleaned
 *   amount_raw: parseFloat(csvRow.amount), // -45.99
 *   amount_spending: calculateSpendingAmount(parseFloat(csvRow.amount), convention), // 45.99
 *   amount_convention: convention,
 *   is_credit: false,
 *   is_payment: isPaymentMerchant(csvRow.merchant),
 *   // Optional: Store raw merchant in notes if needed
 *   notes: csvRow.merchant !== normalizeMerchant(csvRow.merchant) ? csvRow.merchant : null,
 * };
 * ```
 */

