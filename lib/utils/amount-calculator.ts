/**
 * Unified amount calculation utility
 * 
 * This module provides consistent logic for calculating spending amounts
 * across different banking CSV file formats.
 */

export type AmountSignConvention = 'negative' | 'positive';

/**
 * Calculate the spending amount from a transaction
 * 
 * Rules:
 * - For 'negative' convention (Chase): spending is negative amounts, credits are positive
 * - For 'positive' convention (activity.csv): spending is positive amounts, credits are negative
 * 
 * @param amount - The raw amount from the database
 * @param convention - The sign convention for the source file
 * @returns The spending amount (always positive) or 0 if it's a credit/refund
 */
export function calculateSpendingAmount(
  amount: number,
  convention: AmountSignConvention
): number {
  if (convention === 'negative') {
    // Negative amounts = spending, positive = credits
    return amount < 0 ? Math.abs(amount) : 0;
  } else {
    // Positive amounts = spending, negative = credits
    return amount > 0 ? amount : 0;
  }
}

/**
 * Check if a transaction represents spending (not a credit/refund)
 * 
 * @param amount - The raw amount from the database
 * @param convention - The sign convention for the source file
 * @returns true if this is spending, false if it's a credit/refund
 */
export function isSpending(
  amount: number,
  convention: AmountSignConvention
): boolean {
  if (convention === 'negative') {
    return amount < 0;
  } else {
    return amount > 0;
  }
}

/**
 * Calculate total spending from an array of transactions
 * 
 * @param transactions - Array of transactions with amount and convention
 * @returns Total spending amount
 */
export function calculateTotalSpending(
  transactions: Array<{ amount: number; convention: AmountSignConvention }>
): number {
  return transactions.reduce((total, t) => {
    return total + calculateSpendingAmount(t.amount, t.convention);
  }, 0);
}




