'use server';

/**
 * Server Action to apply Amex category predictions
 * Can be called from the UI to apply ML-generated categories
 */

import { createClient } from '@/lib/supabase/server';
import { categorizeAmexTransactions } from '@/lib/ml/categorize-amex';

export type ApplyCategoriesResult = {
  success: boolean;
  message: string;
  updated: number;
  skipped: number;
  highConfidence: number;
  lowConfidence: number;
  lowConfidencePredictions: Array<{
    transactionId: number;
    predictedCategoryName: string;
    confidence: number;
  }>;
};

/**
 * Apply ML-generated categories to Amex transactions
 */
export async function applyAmexCategories(
  includeLowConfidence: boolean = false
): Promise<ApplyCategoriesResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      message: 'Not authenticated',
      updated: 0,
      skipped: 0,
      highConfidence: 0,
      lowConfidence: 0,
      lowConfidencePredictions: [],
    };
  }

  try {
    // Generate predictions
    const result = await categorizeAmexTransactions(user.id, 0.6);

    if (result.predictions.length === 0) {
      return {
        success: true,
        message: 'No uncategorized Amex transactions found',
        updated: 0,
        skipped: 0,
        highConfidence: 0,
        lowConfidence: 0,
        lowConfidencePredictions: [],
      };
    }

    // Determine which predictions to apply
    const updatesToApply = includeLowConfidence
      ? result.predictions
      : result.predictions.filter((p) => !p.lowConfidence);

    let updated = 0;
    let skipped = 0;

    // Apply updates
    for (const prediction of updatesToApply) {
      const { error } = await supabase
        .from('transactions_v2')
        .update({ category: prediction.predictedCategoryName })
        .eq('id', prediction.transactionId)
        .eq('user_id', user.id);

      if (error) {
        console.error(`Failed to update transaction ${prediction.transactionId}:`, error);
        skipped++;
      } else {
        updated++;
      }
    }

    return {
      success: true,
      message: `Successfully categorized ${updated} Amex transactions${includeLowConfidence ? ' (including low-confidence)' : ' (high-confidence only)'}`,
      updated,
      skipped,
      highConfidence: result.summary.highConfidence,
      lowConfidence: result.summary.lowConfidence,
      lowConfidencePredictions: result.summary.lowConfidencePredictions.map((p) => ({
        transactionId: p.transactionId,
        predictedCategoryName: p.predictedCategoryName,
        confidence: p.confidence,
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      updated: 0,
      skipped: 0,
      highConfidence: 0,
      lowConfidence: 0,
      lowConfidencePredictions: [],
    };
  }
}

/**
 * Preview predictions without applying them
 */
export async function previewAmexCategoryPredictions() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  const result = await categorizeAmexTransactions(user.id, 0.6);

  return {
    summary: result.summary,
    predictions: result.predictions.slice(0, 50), // Return first 50 for preview
  };
}

