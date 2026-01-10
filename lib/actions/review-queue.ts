'use server';

import { createClient } from '@/lib/supabase/server';
import { Category } from '@/lib/types/database';
import { TransactionV2 } from '@/lib/types/transactions-v2';

export type ReviewQueueTransaction = {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  category: string | null;
  notes: string | null;
};

/**
 * Get all transactions that need category assignment
 * Uses transactions_v2 as the single source of truth
 * @param failedOnly - Not used in v2 (all transactions are auto-approved)
 */
export async function getReviewQueue(failedOnly: boolean = false): Promise<ReviewQueueTransaction[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // In transactions_v2, show transactions that need category assignment (category is null)
  const { data, error } = await supabase
    .from('transactions_v2')
    .select(`
      id,
      transaction_date,
      merchant,
      amount_spending,
      category,
      notes
    `)
    .eq('user_id', user.id)
    .is('category', null)
    .gt('amount_spending', 0) // Only spending transactions
    .order('transaction_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch review queue: ${error.message}`);
  }

  return (data || []).map((t) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant,
    amount: Number(t.amount_spending),
    category: t.category || null,
    notes: t.notes || null,
  }));
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
    .select('merchant, category')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (!transaction || !transaction.category) {
    throw new Error('Transaction not found or has no category');
  }

  // In transactions_v2, transactions are already approved
  // Just create/update merchant rule (using category name, need to get category_id)
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('name', transaction.category)
    .single();

  if (category) {
    await createMerchantRule(
      transaction.merchant,
      category.id,
      user.id,
      0.2, // Confidence boost for accepted suggestions
      true // Created from manual override
    );
  }
}

/**
 * Change category for a transaction
 * Uses transactions_v2 as the single source of truth
 */
export async function changeTransactionCategory(
  transactionId: number,
  categoryName: string
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

  // Get category_id from category name
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('name', categoryName)
    .single();

  if (!category) {
    throw new Error(`Category "${categoryName}" not found`);
  }

  // Update transaction category
  const { error: updateError } = await supabase
    .from('transactions_v2')
    .update({
      category: categoryName,
    })
    .eq('id', transactionId)
    .eq('user_id', user.id);

  if (updateError) {
    throw new Error(`Failed to update transaction: ${updateError.message}`);
  }

  // Create or update merchant rule with high confidence boost
  await createMerchantRule(
    transaction.merchant,
    category.id,
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

  // Get all transactions with categories (to create merchant rules)
  const { data: transactions, error: fetchError } = await supabase
    .from('transactions_v2')
    .select('id, merchant, category')
    .eq('user_id', user.id)
    .not('category', 'is', null)
    .gt('amount_spending', 0);

  if (fetchError) {
    throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
  }

  if (!transactions || transactions.length === 0) {
    return 0;
  }

  // Get all categories to map names to IDs
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name');

  const categoryMap = new Map<string, number>();
  categories?.forEach((cat) => {
    categoryMap.set(cat.name, cat.id);
  });

  // Group by merchant and category
  const merchantRules = new Map<string, { categoryId: number; count: number }>();
  transactions.forEach((t: any) => {
    if (t.category) {
      const categoryId = categoryMap.get(t.category);
      if (categoryId) {
        const key = `${t.merchant}:${t.category}`;
        if (!merchantRules.has(key)) {
          merchantRules.set(key, { categoryId, count: 0 });
        }
        merchantRules.get(key)!.count++;
      }
    }
  });

  // Create/update merchant rules
  for (const [key, data] of merchantRules.entries()) {
    const merchant = key.split(':')[0];
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
  categoryName: string
): Promise<number> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get category_id from category name
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('name', categoryName)
    .single();

  if (!category) {
    throw new Error(`Category "${categoryName}" not found`);
  }

  // Update all transactions with this merchant (that don't have a category)
  const { data: updated, error: updateError } = await supabase
    .from('transactions_v2')
    .update({
      category: categoryName,
    })
    .eq('user_id', user.id)
    .eq('merchant', merchantNormalized)
    .is('category', null)
    .select();

  if (updateError) {
    throw new Error(`Failed to bulk update transactions: ${updateError.message}`);
  }

  const count = updated?.length || 0;

  // Create or update merchant rule
  if (count > 0) {
    await createMerchantRule(
      merchantNormalized,
      category.id,
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

