# Amex Transaction Categorization with ML

## Overview

This system uses a machine learning model trained on categorized Chase transactions to automatically predict categories for uncategorized Amex transactions.

## How It Works

### 1. Training Data
- **Source**: `transactions_v2` table
- **Filter**: `source_filename LIKE 'Chase%' AND category_id IS NOT NULL`
- **Features Used**:
  - `merchant` (normalized, TF-IDF vectorized)
  - `amount_raw` (log-normalized, range features)
  - Merchant length and word count

### 2. ML Model
- **Algorithm**: k-Nearest Neighbors (k-NN) with cosine similarity
- **Feature Engineering**:
  - TF-IDF vectorization of merchant names
  - Amount-based features (log-normalized, ranges)
  - Merchant metadata (length, word count)
- **Confidence Threshold**: 60% (configurable)

### 3. Prediction Target
- **Rows**: `transactions_v2` where `source_filename LIKE 'Amex%' AND category_id IS NULL`
- **Output**: Predicted `category_id` with confidence score

## Usage

### Option 1: Web UI

Visit: `http://localhost:3000/categorize-amex`

1. Click "Preview Predictions" to see ML-generated categories
2. Review low-confidence predictions (if any)
3. Choose whether to include low-confidence predictions
4. Click "Apply Predictions" to update the database

### Option 2: Command Line Script

```bash
# Preview predictions (doesn't apply)
npx tsx scripts/categorize-amex.ts

# Apply high-confidence predictions only
npx tsx scripts/categorize-amex.ts --apply

# Apply all predictions (including low-confidence)
npx tsx scripts/categorize-amex.ts --apply --low-confidence
```

The script will:
- Generate predictions
- Save SQL and TypeScript update files to `scripts/output/`
- Optionally apply updates to the database

### Option 3: Server Action (Programmatic)

```typescript
import { applyAmexCategories, previewAmexCategoryPredictions } from '@/lib/actions/apply-amex-categories';

// Preview predictions
const preview = await previewAmexCategoryPredictions();
console.log(preview.summary);

// Apply high-confidence predictions
const result = await applyAmexCategories(false);

// Apply all predictions (including low-confidence)
const result = await applyAmexCategories(true);
```

## Integration with Upload Flow

To automatically categorize Amex transactions during upload, you can modify `uploadTransactionsV2()`:

```typescript
// In lib/actions/upload-transactions-v2.ts
// After successful insert, if file is Amex:

if (filename.toLowerCase().includes('amex')) {
  // Auto-categorize with high confidence only
  try {
    const { applyAmexCategories } = await import('./apply-amex-categories');
    await applyAmexCategories(false); // High confidence only
  } catch (error) {
    console.warn('Failed to auto-categorize Amex transactions:', error);
    // Don't fail the upload if categorization fails
  }
}
```

## Model Performance

### Confidence Levels
- **High Confidence (≥60%)**: Applied automatically
- **Low Confidence (<60%)**: Flagged for manual review

### Factors Affecting Confidence
1. **Merchant Similarity**: How similar the Amex merchant is to training merchants
2. **Training Data Coverage**: More training samples = higher confidence
3. **Amount Patterns**: Transactions with unusual amounts may have lower confidence
4. **Category Distribution**: Rare categories may have lower confidence

## Validation

After applying predictions, verify results:

```sql
-- Check categorization coverage
SELECT 
  COUNT(*) FILTER (WHERE source_filename LIKE 'Amex%' AND category_id IS NOT NULL) as categorized,
  COUNT(*) FILTER (WHERE source_filename LIKE 'Amex%' AND category_id IS NULL) as uncategorized
FROM transactions_v2
WHERE user_id = 'your-user-id';

-- Review low-confidence predictions (if stored)
SELECT 
  id,
  merchant,
  category_id,
  category:categories(name)
FROM transactions_v2
WHERE source_filename LIKE 'Amex%'
  AND category_id IS NOT NULL
ORDER BY transaction_date DESC;
```

## Files Generated

When running the script, it generates:

1. **`scripts/output/amex-categorization-updates.sql`**
   - SQL UPDATE statements for all predictions
   - High-confidence updates are uncommented
   - Low-confidence updates are commented for review

2. **`scripts/output/amex-categorization-updates.ts`**
   - TypeScript function to apply updates programmatically
   - Includes both high and low-confidence predictions

## Troubleshooting

### No Training Data
**Error**: "No training data found"

**Solution**: Ensure you have categorized Chase transactions in `transactions_v2`:
```sql
SELECT COUNT(*) 
FROM transactions_v2 
WHERE source_filename LIKE 'Chase%' 
  AND category_id IS NOT NULL;
```

### Low Accuracy
**Issue**: Predictions seem incorrect

**Solutions**:
1. Increase training data (categorize more Chase transactions)
2. Review and correct low-confidence predictions manually
3. Adjust confidence threshold (default: 0.6)
4. Add merchant rules for common Amex merchants

### Performance
**Issue**: Script runs slowly

**Solutions**:
1. Limit TF-IDF features (currently top 50)
2. Reduce k-NN neighbors (currently k=5)
3. Cache training features for repeated runs

## Future Enhancements

1. **Incremental Learning**: Update model as new Chase transactions are categorized
2. **Category-Specific Models**: Train separate models per category
3. **Ensemble Methods**: Combine multiple models for better accuracy
4. **Feature Engineering**: Add date patterns, merchant chains, etc.
5. **Confidence Calibration**: Better confidence score calculation
6. **Auto-Apply**: Integrate into upload flow automatically

## Dependencies

- `natural`: TF-IDF vectorization and text processing
- `tsx`: TypeScript execution (dev dependency)

Install with:
```bash
npm install natural
npm install --save-dev tsx  # For running TypeScript scripts
```

