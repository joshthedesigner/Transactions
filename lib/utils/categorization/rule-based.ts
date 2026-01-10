import { createClient } from '@/lib/supabase/server';
import { MerchantRule } from '@/lib/types/database';
import { NormalizedTransaction } from '@/lib/types/database';

/**
 * Find matching merchant rule for a normalized transaction
 */
export async function findMatchingRule(
  merchantNormalized: string,
  userId: string
): Promise<MerchantRule | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('merchant_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('merchant_normalized', merchantNormalized)
    .maybeSingle();

  if (error) {
    console.error('Error fetching merchant rule:', error);
    return null;
  }

  return data;
}

/**
 * Check if merchant name partially matches any rule (for aliasing)
 */
export async function findPartialMatch(
  merchantNormalized: string,
  userId: string
): Promise<MerchantRule | null> {
  const supabase = await createClient();
  
  // Get all merchant rules for the user
  const { data: rules, error } = await supabase
    .from('merchant_rules')
    .select('*')
    .eq('user_id', userId);

  if (error || !rules || rules.length === 0) {
    return null;
  }

  // Check for partial matches (merchant contains rule or vice versa)
  for (const rule of rules) {
    if (
      merchantNormalized.includes(rule.merchant_normalized) ||
      rule.merchant_normalized.includes(merchantNormalized)
    ) {
      return rule;
    }
  }

  return null;
}




