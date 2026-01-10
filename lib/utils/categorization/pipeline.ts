import { NormalizedTransaction } from '@/lib/types/database';
import { CategoryProbability } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/server';
import { findMatchingRule, findPartialMatch } from './rule-based';
import { categorizeWithAI } from './ai-categorizer';
import { CONFIDENCE_THRESHOLD } from '@/lib/constants/categories';

export type CategorizationResult = {
  categoryId: number | null;
  confidenceScore: number;
  status: 'pending_review' | 'approved';
  probabilities: CategoryProbability[];
  usedRule: boolean;
};

/**
 * Complete categorization pipeline:
 * 1. Check merchant_rules (exact match)
 * 2. Check merchant_rules (partial match)
 * 3. Use AI categorization
 * 4. Calculate confidence
 * 5. Route to approve or review queue
 */
export async function categorizeTransaction(
  transaction: NormalizedTransaction,
  userId: string
): Promise<CategorizationResult> {
  const supabase = await createClient();

  // Step 1: Get all categories
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('*');

  if (categoriesError || !categories || categories.length === 0) {
    throw new Error('Failed to fetch categories');
  }

  // Step 2: Check for exact merchant rule match
  const exactRule = await findMatchingRule(transaction.merchant, userId);
  if (exactRule) {
    // Use rule with confidence boost
    const baseConfidence = 0.95; // High confidence for manual rules
    const confidenceScore = Math.min(1.0, baseConfidence + exactRule.confidence_boost);

    return {
      categoryId: exactRule.category_id,
      confidenceScore,
      status: confidenceScore >= CONFIDENCE_THRESHOLD ? 'approved' : 'pending_review',
      probabilities: [{
        category_id: exactRule.category_id,
        category_name: categories.find(c => c.id === exactRule.category_id)?.name || '',
        probability: confidenceScore,
      }],
      usedRule: true,
    };
  }

  // Step 3: Check for partial match (aliasing)
  const partialRule = await findPartialMatch(transaction.merchant, userId);
  if (partialRule) {
    // Use partial match with slightly lower confidence
    const baseConfidence = 0.85;
    const confidenceScore = Math.min(1.0, baseConfidence + partialRule.confidence_boost);

    return {
      categoryId: partialRule.category_id,
      confidenceScore,
      status: confidenceScore >= CONFIDENCE_THRESHOLD ? 'approved' : 'pending_review',
      probabilities: [{
        category_id: partialRule.category_id,
        category_name: categories.find(c => c.id === partialRule.category_id)?.name || '',
        probability: confidenceScore,
      }],
      usedRule: true,
    };
  }

  // Step 4: Use AI categorization
  const aiProbabilities = await categorizeWithAI(
    transaction.merchant,
    transaction.amount,
    transaction.date,
    categories
  );

  // Step 5: Calculate confidence (max probability)
  const maxProbability = Math.max(...aiProbabilities.map(p => p.probability));
  const topCategory = aiProbabilities.find(p => p.probability === maxProbability);

  // Step 6: Route based on confidence threshold
  const confidenceScore = maxProbability;
  const status: 'pending_review' | 'approved' = confidenceScore >= CONFIDENCE_THRESHOLD ? 'approved' : 'pending_review';

  return {
    categoryId: topCategory?.category_id || null,
    confidenceScore,
    status,
    probabilities: aiProbabilities,
    usedRule: false,
  };
}

/**
 * Process transactions in parallel with concurrency limit
 * Best practice: Parallel processing with rate limit management
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completed = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      
      try {
        results[index] = await processor(item, index);
      } catch (error) {
        console.error(`[Categorization] Error processing item ${index + 1}:`, error);
        // Store error result - will be handled by caller
        throw error;
      }
      
      completed++;
      if (completed % 10 === 0 || completed === items.length) {
        console.log(`[Categorization] Progress: ${completed}/${items.length} (${Math.round((completed / items.length) * 100)}%)`);
      }
    }
  };

  // Start concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

/**
 * Batch categorize multiple transactions
 * Uses parallel processing with concurrency limit for efficiency
 */
export async function categorizeTransactions(
  transactions: NormalizedTransaction[],
  userId: string
): Promise<CategorizationResult[]> {
  const total = transactions.length;
  const CONCURRENCY_LIMIT = 5; // Process 5 transactions concurrently

  console.log(`[Categorization] Starting parallel categorization of ${total} transactions (concurrency: ${CONCURRENCY_LIMIT})...`);

  const startTime = Date.now();

  try {
    const results = await processWithConcurrency(
      transactions,
      CONCURRENCY_LIMIT,
      async (transaction, index) => {
        const itemStartTime = Date.now();
        
        try {
          const result = await categorizeTransaction(transaction, userId);
          const duration = Date.now() - itemStartTime;
          
          if (result.usedRule) {
            console.log(`[Categorization] Transaction ${index + 1}/${total}: Used rule (${duration}ms)`);
          } else {
            console.log(`[Categorization] Transaction ${index + 1}/${total}: Used AI (${duration}ms)`);
          }
          
          return result;
        } catch (error) {
          const duration = Date.now() - itemStartTime;
          console.error(`[Categorization] Error on transaction ${index + 1}/${total} (${duration}ms):`, error);
          
          // Return fallback result
          return {
            categoryId: null,
            confidenceScore: 0,
            status: 'pending_review' as const,
            probabilities: [],
            usedRule: false,
          };
        }
      }
    );

    const totalDuration = Date.now() - startTime;
    console.log(`[Categorization] Complete: ${results.length}/${total} transactions categorized in ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    
    return results;
  } catch (error) {
    console.error('[Categorization] Fatal error in batch processing:', error);
    throw error;
  }
}

