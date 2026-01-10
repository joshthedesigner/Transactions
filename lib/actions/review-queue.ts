'use server';

import { createClient } from '@/lib/supabase/server';
import { TransactionWithCategory, Category } from '@/lib/types/database';

/**
 * Get all transactions that need category assignment
 * Uses transactions_v2 as the single source of truth
 * @param failedOnly - Not used in v2 (all transactions are auto-approved)
 */
export async function getReviewQueue(failedOnly: boolean = false): Promise<TransactionWithCategory[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // In transactions_v2, all transactions are auto-approved
  // Show transactions that need category assignment (category_id is null)
  const { data, error } = await supabase
    .from('transactions_v2')
    .select(`
      *,
      category:categories(id, name)
    `)
    .eq('user_id', user.id)
    .is('category_id', null)
    .gt('amount_spending', 0) // Only spending transactions
    .order('transaction_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch review queue: ${error.message}`);
  }

  // Map to TransactionWithCategory format for compatibility
  return (data || []).map((t) => ({
    ...t,
    date: t.transaction_date,
    merchant_raw: t.merchant, // Use merchant as raw for compatibility
    merchant_normalized: t.merchant,
    amount: Number(t.amount_spending),
    status: 'approved' as const, // All v2 transactions are approved
  })) as TransactionWithCategory[];
}

/**
 * Get all categories
 */
export async function getCategories() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data;
}

/**
 * Accept a transaction (approve suggested category)
 * Uses transactions_v2 as the single source of truth
 */
export async function acceptTransaction(transactionId: number): Promise<void> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Verify ownership
  const { data: transaction } = await supabase
    .from('transactions_v2')
    .select('merchant, category_id')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (!transaction || !transaction.category_id) {
    throw new Error('Transaction not found or has no category');
  }

  // In transactions_v2, transactions are already approved
  // Just create/update merchant rule
  await createMerchantRule(
    transaction.merchant,
    transaction.category_id,
    user.id,
    0.2, // Confidence boost for accepted suggestions
    true // Created from manual override
  );
}

/**
 * Change category for a transaction
 * Uses transactions_v2 as the single source of truth
 */
export async function changeTransactionCategory(
  transactionId: number,
  categoryId: number
): Promise<void> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Verify ownership and get merchant
  const { data: transaction } = await supabase
    .from('transactions_v2')
    .select('merchant')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  // Update transaction category
  const { error: updateError } = await supabase
    .from('transactions_v2')
    .update({
      category_id: categoryId,
    })
    .eq('id', transactionId)
    .eq('user_id', user.id);

  if (updateError) {
    throw new Error(`Failed to update transaction: ${updateError.message}`);
  }

  // Create or update merchant rule with high confidence boost
  await createMerchantRule(
    transaction.merchant,
    categoryId,
    user.id,
    0.3, // Higher boost for manual corrections
    true // Created from manual override
  );
}

/**
 * Accept all transactions (create merchant rules for transactions with categories)
 * Uses transactions_v2 as the single source of truth
 */
export async function acceptAllTransactions(failedOnly: boolean = false): Promise<number> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all transactions without categories (these need review)
  const { data: transactions, error: fetchError } = await supabase
    .from('transactions_v2')
    .select('id, merchant, category_id')
    .eq('user_id', user.id)
    .is('category_id', null)
    .gt('amount_spending', 0);

  if (fetchError) {
    throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
  }

  if (!transactions || transactions.length === 0) {
    return 0;
  }

  // In transactions_v2, all transactions are already approved
  // Just create merchant rules for transactions that have categories
  const merchantRules = new Map<string, { categoryId: number; count: number }>();
  transactions.forEach((t: any) => {
    if (t.category_id) {
      const key = t.merchant;
      if (!merchantRules.has(key)) {
        merchantRules.set(key, { categoryId: t.category_id, count: 0 });
      }
      merchantRules.get(key)!.count++;
    }
  });

  // Create/update merchant rules
  for (const [merchant, data] of merchantRules.entries()) {
    await createMerchantRule(
      merchant,
      data.categoryId,
      user.id,
      0.2, // Confidence boost for bulk acceptance
      true // Created from manual override
    );
  }

  return transactions.length;
}

/**
 * Bulk apply category to all transactions with the same merchant
 * Uses transactions_v2 as the single source of truth
 */
export async function bulkApplyCategory(
  merchantNormalized: string,
  categoryId: number
): Promise<number> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Update all transactions with this merchant (that don't have a category)
  const { data: updated, error: updateError } = await supabase
    .from('transactions_v2')
    .update({
      category_id: categoryId,
    })
    .eq('user_id', user.id)
    .eq('merchant', merchantNormalized)
    .is('category_id', null)
    .select();

  if (updateError) {
    throw new Error(`Failed to bulk update transactions: ${updateError.message}`);
  }

  const count = updated?.length || 0;

  // Create or update merchant rule
  if (count > 0) {
    await createMerchantRule(
      merchantNormalized,
      categoryId,
      user.id,
      0.3, // Higher boost for bulk corrections
      true // Created from manual override
    );
  }

  return count;
}

/**
 * Helper function to create or update merchant rule
 */
async function createMerchantRule(
  merchantNormalized: string,
  categoryId: number,
  userId: string,
  confidenceBoost: number,
  fromManualOverride: boolean
): Promise<void> {
  const supabase = await createClient();

  // Check if rule exists
  const { data: existing } = await supabase
    .from('merchant_rules')
    .select('*')
    .eq('merchant_normalized', merchantNormalized)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    // Update existing rule (never override manual corrections)
    if (existing.created_from_manual_override) {
      // If it's already a manual override, update it
      await supabase
        .from('merchant_rules')
        .update({
          category_id: categoryId,
          confidence_boost: Math.min(1.0, existing.confidence_boost + confidenceBoost),
        })
        .eq('merchant_normalized', merchantNormalized)
        .eq('user_id', userId);
    }
    // If it's not a manual override but we're creating one, replace it
    else if (fromManualOverride) {
      await supabase
        .from('merchant_rules')
        .update({
          category_id: categoryId,
          confidence_boost: confidenceBoost,
          created_from_manual_override: true,
        })
        .eq('merchant_normalized', merchantNormalized)
        .eq('user_id', userId);
    }
  } else {
    // Create new rule
    await supabase
      .from('merchant_rules')
      .insert({
        merchant_normalized: merchantNormalized,
        category_id: categoryId,
        confidence_boost: confidenceBoost,
        created_from_manual_override: fromManualOverride,
        user_id: userId,
      });
  }
}

