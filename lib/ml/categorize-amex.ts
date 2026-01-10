/**
 * ML Model for Categorizing Amex Transactions
 * 
 * Uses Chase transactions as training data to predict categories for Amex transactions.
 * Implements a hybrid approach: TF-IDF vectorization + k-NN classifier + amount-based features
 */

import { createClient } from '@/lib/supabase/server';
import { TfIdf } from 'natural';

export type TrainingSample = {
  merchant: string;
  amount: number;
  categoryId: number;
  categoryName: string;
};

export type PredictionResult = {
  transactionId: number;
  predictedCategoryId: number;
  predictedCategoryName: string;
  confidence: number;
  lowConfidence: boolean;
};

export type CategorizationSummary = {
  totalUncategorized: number;
  predictionsGenerated: number;
  highConfidence: number;
  lowConfidence: number;
  remainingUncategorized: number;
  lowConfidencePredictions: PredictionResult[];
};

/**
 * Fetch training data from Chase transactions
 */
async function fetchTrainingData(userId: string): Promise<TrainingSample[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('transactions_v2')
    .select(`
      merchant,
      amount_raw,
      category_id,
      category:categories(id, name)
    `)
    .eq('user_id', userId)
    .like('source_filename', 'Chase%')
    .not('category_id', 'is', null)
    .gt('amount_spending', 0); // Only spending transactions

  if (error) {
    throw new Error(`Failed to fetch training data: ${error.message}`);
  }

  return (data || []).map((t) => ({
    merchant: t.merchant || '',
    amount: Number(t.amount_raw) || 0,
    categoryId: t.category_id!,
    categoryName: (t.category as any)?.name || 'Misc',
  }));
}

/**
 * Fetch uncategorized Amex transactions
 */
async function fetchUncategorizedAmex(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('transactions_v2')
    .select(`
      id,
      merchant,
      amount_raw,
      amount_spending
    `)
    .eq('user_id', userId)
    .like('source_filename', 'Amex%')
    .is('category_id', null)
    .gt('amount_spending', 0);

  if (error) {
    throw new Error(`Failed to fetch uncategorized transactions: ${error.message}`);
  }

  return data || [];
}

/**
 * Normalize merchant name for feature extraction
 */
function normalizeMerchantForML(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[0-9]/g, '') // Remove numbers
    .replace(/[^\w\s]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract features from a transaction
 */
function extractFeatures(
  merchant: string,
  amount: number,
  tfidf: TfIdf,
  trainingMerchants: string[]
): number[] {
  const normalized = normalizeMerchantForML(merchant);
  
  // TF-IDF features (top terms from training set)
  const tfidfScores = trainingMerchants.map((trainMerchant) => {
    const trainNorm = normalizeMerchantForML(trainMerchant);
    // Simple cosine similarity using TF-IDF
    const score = tfidf.tfidf(normalized, trainingMerchants.indexOf(trainMerchant));
    return score;
  });

  // Amount features (normalized)
  const amountFeatures = [
    Math.log(Math.abs(amount) + 1) / 10, // Log-normalized amount
    amount < 0 ? 1 : 0, // Is negative
    Math.abs(amount) < 50 ? 1 : 0, // Small transaction
    Math.abs(amount) > 200 ? 1 : 0, // Large transaction
  ];

  // Merchant length and word count
  const merchantFeatures = [
    normalized.length / 100, // Normalized length
    normalized.split(' ').length / 10, // Word count
  ];

  // Combine all features
  return [
    ...tfidfScores.slice(0, 50), // Top 50 TF-IDF scores (limit for performance)
    ...amountFeatures,
    ...merchantFeatures,
  ];
}

/**
 * Calculate cosine similarity between two feature vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * k-NN classifier for category prediction
 */
function predictCategory(
  features: number[],
  trainingFeatures: number[][],
  trainingCategories: number[],
  k: number = 5
): { categoryId: number; confidence: number } {
  // Calculate distances to all training samples
  const distances = trainingFeatures.map((trainFeatures, idx) => ({
    distance: 1 - cosineSimilarity(features, trainFeatures), // Convert similarity to distance
    categoryId: trainingCategories[idx],
  }));

  // Sort by distance and get k nearest neighbors
  distances.sort((a, b) => a.distance - b.distance);
  const neighbors = distances.slice(0, k);

  // Count votes by category
  const votes = new Map<number, number>();
  neighbors.forEach((neighbor) => {
    const weight = 1 / (neighbor.distance + 0.001); // Weighted by inverse distance
    votes.set(
      neighbor.categoryId,
      (votes.get(neighbor.categoryId) || 0) + weight
    );
  });

  // Find category with most votes
  let maxVotes = 0;
  let predictedCategory = trainingCategories[0]; // Default to first category
  for (const [categoryId, voteCount] of votes.entries()) {
    if (voteCount > maxVotes) {
      maxVotes = voteCount;
      predictedCategory = categoryId;
    }
  }

  // Calculate confidence (normalized vote count)
  const totalWeight = neighbors.reduce((sum, n) => sum + 1 / (n.distance + 0.001), 0);
  const confidence = totalWeight > 0 ? maxVotes / totalWeight : 0.5;

  return {
    categoryId: predictedCategory,
    confidence: Math.min(1.0, confidence),
  };
}

/**
 * Train model and predict categories for Amex transactions
 */
export async function categorizeAmexTransactions(
  userId: string,
  confidenceThreshold: number = 0.6
): Promise<{
  predictions: PredictionResult[];
  summary: CategorizationSummary;
  updateSQL: string;
  updateTypeScript: string;
}> {
  console.log('📊 Fetching training data from Chase transactions...');
  const trainingData = await fetchTrainingData(userId);

  if (trainingData.length === 0) {
    throw new Error('No training data found. Please ensure you have categorized Chase transactions.');
  }

  console.log(`✅ Found ${trainingData.length} training samples`);

  // Get unique categories
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from('categories')
    .select('*');

  if (!categories || categories.length === 0) {
    throw new Error('No categories found in database');
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  console.log('🔧 Building TF-IDF model...');
  
  // Prepare merchant names for TF-IDF
  const trainingMerchants = trainingData.map((t) => normalizeMerchantForML(t.merchant));
  const tfidf = new TfIdf();
  trainingMerchants.forEach((merchant) => {
    tfidf.addDocument(merchant);
  });

  console.log('🎯 Extracting features from training data...');
  const trainingFeatures = trainingData.map((sample) =>
    extractFeatures(sample.merchant, sample.amount, tfidf, trainingMerchants)
  );
  const trainingCategories = trainingData.map((sample) => sample.categoryId);

  console.log('📥 Fetching uncategorized Amex transactions...');
  const uncategorized = await fetchUncategorizedAmex(userId);

  if (uncategorized.length === 0) {
    return {
      predictions: [],
      summary: {
        totalUncategorized: 0,
        predictionsGenerated: 0,
        highConfidence: 0,
        lowConfidence: 0,
        remainingUncategorized: 0,
        lowConfidencePredictions: [],
      },
      updateSQL: '-- No uncategorized Amex transactions found',
      updateTypeScript: '// No uncategorized Amex transactions found',
    };
  }

  console.log(`🔮 Predicting categories for ${uncategorized.length} transactions...`);

  const predictions: PredictionResult[] = [];

  for (const transaction of uncategorized) {
    const features = extractFeatures(
      transaction.merchant || '',
      Number(transaction.amount_raw) || 0,
      tfidf,
      trainingMerchants
    );

    const prediction = predictCategory(features, trainingFeatures, trainingCategories);
    const categoryName = categoryMap.get(prediction.categoryId) || 'Misc';

    predictions.push({
      transactionId: transaction.id,
      predictedCategoryId: prediction.categoryId,
      predictedCategoryName: categoryName,
      confidence: prediction.confidence,
      lowConfidence: prediction.confidence < confidenceThreshold,
    });
  }

  // Generate summary
  const highConfidence = predictions.filter((p) => !p.lowConfidence).length;
  const lowConfidence = predictions.filter((p) => p.lowConfidence).length;

  const summary: CategorizationSummary = {
    totalUncategorized: uncategorized.length,
    predictionsGenerated: predictions.length,
    highConfidence,
    lowConfidence,
    remainingUncategorized: 0, // All will be updated, but low confidence ones flagged
    lowConfidencePredictions: predictions.filter((p) => p.lowConfidence),
  };

  // Generate SQL update statements
  const updateSQL = generateUpdateSQL(predictions, confidenceThreshold);
  const updateTypeScript = generateUpdateTypeScript(predictions, confidenceThreshold);

  console.log(`✅ Generated ${predictions.length} predictions (${highConfidence} high confidence, ${lowConfidence} low confidence)`);

  return {
    predictions,
    summary,
    updateSQL,
    updateTypeScript,
  };
}

/**
 * Generate SQL update statements
 */
function generateUpdateSQL(
  predictions: PredictionResult[],
  confidenceThreshold: number
): string {
  const highConfidenceUpdates = predictions
    .filter((p) => !p.lowConfidence)
    .map(
      (p) =>
        `UPDATE transactions_v2 SET category_id = ${p.predictedCategoryId} WHERE id = ${p.transactionId};`
    );

  const lowConfidenceUpdates = predictions
    .filter((p) => p.lowConfidence)
    .map(
      (p) =>
        `-- Low confidence (${(p.confidence * 100).toFixed(1)}%): UPDATE transactions_v2 SET category_id = ${p.predictedCategoryId} WHERE id = ${p.transactionId};`
    );

  return `-- High Confidence Predictions (>= ${(confidenceThreshold * 100).toFixed(0)}%)
-- Total: ${highConfidenceUpdates.length} transactions

${highConfidenceUpdates.join('\n')}

-- Low Confidence Predictions (< ${(confidenceThreshold * 100).toFixed(0)}%)
-- Review these before applying
-- Total: ${lowConfidenceUpdates.length} transactions

${lowConfidenceUpdates.join('\n')}

-- Summary:
-- High confidence: ${highConfidenceUpdates.length}
-- Low confidence: ${lowConfidenceUpdates.length}
-- Total: ${predictions.length}`;
}

/**
 * Generate TypeScript update code
 */
function generateUpdateTypeScript(
  predictions: PredictionResult[],
  confidenceThreshold: number
): string {
  const highConfidence = predictions.filter((p) => !p.lowConfidence);
  const lowConfidence = predictions.filter((p) => p.lowConfidence);

  return `import { createClient } from '@/lib/supabase/server';

/**
 * Update transactions_v2 with predicted categories
 * High confidence predictions: ${highConfidence.length}
 * Low confidence predictions: ${lowConfidence.length} (review before applying)
 */
export async function applyAmexCategoryPredictions(
  applyLowConfidence: boolean = false
): Promise<{ updated: number; skipped: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const updates = ${JSON.stringify(highConfidence, null, 2)};
  ${lowConfidence.length > 0 ? `\n  const lowConfidenceUpdates = ${JSON.stringify(lowConfidence, null, 2)};` : ''}

  let updated = 0;
  let skipped = 0;

  // Apply high confidence predictions
  for (const prediction of updates) {
    const { error } = await supabase
      .from('transactions_v2')
      .update({ category_id: prediction.predictedCategoryId })
      .eq('id', prediction.transactionId)
      .eq('user_id', user.id);

    if (error) {
      console.error(\`Failed to update transaction \${prediction.transactionId}:\`, error);
      skipped++;
    } else {
      updated++;
    }
  }

  ${lowConfidence.length > 0 ? `// Apply low confidence predictions (if enabled)
  if (applyLowConfidence) {
    for (const prediction of lowConfidenceUpdates) {
      const { error } = await supabase
        .from('transactions_v2')
        .update({ category_id: prediction.predictedCategoryId })
        .eq('id', prediction.transactionId)
        .eq('user_id', user.id);

      if (error) {
        console.error(\`Failed to update transaction \${prediction.transactionId}:\`, error);
        skipped++;
      } else {
        updated++;
      }
    }
  } else {
    skipped += lowConfidenceUpdates.length;
  }` : ''}

  return { updated, skipped };
}`;
}

