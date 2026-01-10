import OpenAI from 'openai';
import { Category } from '@/lib/types/database';
import { CategoryProbability } from '@/lib/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 second timeout per API request (increased for reliability with large batches)
});

// Simple in-memory cache for merchant categorizations
// Key: normalized merchant name, Value: CategoryProbability[]
const categorizationCache = new Map<string, CategoryProbability[]>();
const MAX_CACHE_SIZE = 1000; // Limit cache size to prevent memory issues

/**
 * Categorize transaction using OpenAI
 * Returns probability scores for each category
 */
export async function categorizeWithAI(
  merchant: string,
  amount: number,
  date: Date,
  categories: Category[]
): Promise<CategoryProbability[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Normalize merchant name for caching (case-insensitive, trimmed)
  const normalizedMerchant = merchant.trim().toLowerCase();
  
  // Check cache first (best practice: cache to reduce API calls)
  const cacheKey = normalizedMerchant;
  if (categorizationCache.has(cacheKey)) {
    console.log(`[AI] Cache hit for merchant: ${merchant}`);
    return categorizationCache.get(cacheKey)!;
  }

  // Build category list for prompt
  const categoryNames = categories.map(c => c.name).join(', ');

  const prompt = `You are a financial transaction categorizer. Categorize the following transaction into one of these categories: ${categoryNames}

Transaction details:
- Merchant: "${merchant}"
- Amount: $${Math.abs(amount).toFixed(2)} ${amount < 0 ? '(charge)' : '(credit/refund)'}
- Date: ${date.toLocaleDateString()}

For each category, provide a probability score between 0 and 1 representing how likely this transaction belongs to that category. The sum of all probabilities should equal 1.0.

Return ONLY a JSON array in this exact format:
[
  {"category_name": "CategoryName", "probability": 0.95},
  {"category_name": "AnotherCategory", "probability": 0.05},
  ...
]

Do not include any other text or explanation. Only return the JSON array.`;

  try {
    console.log(`[AI] Categorizing transaction: ${merchant} ($${Math.abs(amount).toFixed(2)})`);
    
    // Call OpenAI API - client timeout is set to 60 seconds
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using mini for cost efficiency
      messages: [
        {
          role: 'system',
          content: 'You are a precise financial transaction categorizer. Always return valid JSON arrays with probability scores.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent categorization
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response (may be wrapped in markdown code blocks)
    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) {
        jsonContent = match[1];
      }
    }

    const probabilities: Array<{ category_name: string; probability: number }> = JSON.parse(jsonContent);

    // Map to CategoryProbability with category IDs
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
    
    const result: CategoryProbability[] = probabilities
      .map(prob => {
        const categoryId = categoryMap.get(prob.category_name.toLowerCase());
        if (!categoryId) {
          return null;
        }
        return {
          category_id: categoryId,
          category_name: prob.category_name,
          probability: Math.max(0, Math.min(1, prob.probability)), // Clamp between 0 and 1
        };
      })
      .filter((prob): prob is CategoryProbability => prob !== null);

    // Normalize probabilities to sum to 1.0
    const sum = result.reduce((acc, p) => acc + p.probability, 0);
    let finalResult: CategoryProbability[];
    
    if (sum > 0) {
      finalResult = result.map(p => ({
        ...p,
        probability: p.probability / sum,
      }));
    } else {
      // If no valid categories found, return equal probabilities for all
      finalResult = categories.map(c => ({
        category_id: c.id,
        category_name: c.name,
        probability: 1 / categories.length,
      }));
    }

    // Cache the result (best practice: cache to reduce redundant API calls)
    if (categorizationCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry (simple FIFO eviction)
      const firstKey = categorizationCache.keys().next().value;
      categorizationCache.delete(firstKey);
    }
    categorizationCache.set(cacheKey, finalResult);
    
    return finalResult;
  } catch (error) {
    console.error('[AI] Error categorizing with AI:', error);
    console.error('[AI] Error details:', error instanceof Error ? error.message : 'Unknown error');
    
    // Fallback: return equal probabilities for all categories
    return categories.map(c => ({
      category_id: c.id,
      category_name: c.name,
      probability: 1 / categories.length,
    }));
  }
}

