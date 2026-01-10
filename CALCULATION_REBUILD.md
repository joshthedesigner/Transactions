# Calculation & Filtering Logic Rebuild

## Overview

The calculation and filtering logic has been completely rebuilt from scratch to ensure consistency across different banking CSV file formats. This addresses discrepancies where transactions were being calculated incorrectly due to inconsistent handling of amount sign conventions.

## Problem

Different banks use different conventions for representing spending:
- **Chase credit cards**: Negative amounts = spending, positive = credits/refunds
- **Other banks (activity.csv, debit cards)**: Positive amounts = spending, negative = credits/refunds

The previous implementation tried to detect this at calculation time by checking filenames, which was error-prone and led to:
- Missing transactions in totals
- Incorrect spending calculations
- Inconsistent filtering behavior

## Solution

### 1. Amount Sign Convention Detection

**File**: `lib/utils/amount-convention-detector.ts`

- Detects the convention when uploading files
- Checks filename patterns (e.g., "Chase" = negative convention)
- Analyzes actual amounts in the data to determine the convention
- Stores the convention in the `source_files` table

### 2. Unified Calculation Utility

**File**: `lib/utils/amount-calculator.ts`

Provides consistent functions for calculating spending:
- `calculateSpendingAmount()`: Converts raw amount to spending (always positive)
- `isSpending()`: Checks if a transaction represents spending
- `calculateTotalSpending()`: Calculates total from an array of transactions

### 3. Database Schema Update

**File**: `supabase/migrations/002_add_amount_convention.sql`

Adds `amount_sign_convention` column to `source_files` table:
- `'negative'`: Spending is negative (Chase)
- `'positive'`: Spending is positive (other banks)

### 4. Rebuilt Analytics

**File**: `lib/actions/analytics.ts`

All calculation functions now:
- Join with `source_files` to get the convention
- Use `calculateSpendingAmount()` for consistent calculations
- Apply the same logic across all metrics (totals, charts, summaries)

### 5. Updated Normalizer

**File**: `lib/utils/normalizer.ts`

- Stores amounts as-is from CSV (no sign conversion)
- Removes amount-sign-based filtering logic
- Payment detection based on merchant name patterns only

## Migration Steps

1. **Run the database migration**:
   ```sql
   -- Run this in Supabase SQL Editor
   -- File: supabase/migrations/002_add_amount_convention.sql
   ```

2. **Re-upload existing files** (optional but recommended):
   - The convention will be detected automatically
   - Existing transactions will keep their current amounts
   - New uploads will have the convention stored

3. **Verify calculations**:
   - Check that totals match expected values
   - Use the `/diagnose-metrics` page to verify breakdowns

## Key Changes

### Before
```typescript
// Inconsistent logic scattered across files
const total = transactions.reduce((sum, t) => {
  const filename = t.source_file?.filename || '';
  if (filename.includes('chase')) {
    return sum + (t.amount < 0 ? Math.abs(t.amount) : 0);
  } else {
    return sum + (t.amount > 0 ? t.amount : 0);
  }
}, 0);
```

### After
```typescript
// Unified, consistent logic
const total = calculateTotalSpending(
  transactions.map(t => ({
    amount: t.amount,
    convention: t.source_file?.amount_sign_convention || 'negative'
  }))
);
```

## Benefits

1. **Consistency**: All calculations use the same logic
2. **Accuracy**: No more missing transactions due to sign confusion
3. **Maintainability**: Single source of truth for calculation logic
4. **Extensibility**: Easy to add new file formats by detecting their convention

## Testing

After migration, verify:
- [ ] Total spending matches expected CSV totals
- [ ] Monthly breakdowns are correct
- [ ] Category totals are accurate
- [ ] Filtering by date/category/merchant works correctly
- [ ] Charts display correct data

## Files Modified

- `lib/utils/amount-convention-detector.ts` (new)
- `lib/utils/amount-calculator.ts` (new)
- `lib/utils/normalizer.ts` (updated)
- `lib/actions/upload-transactions.ts` (updated)
- `lib/actions/analytics.ts` (rebuilt)
- `lib/types/database.ts` (updated)
- `app/components/Analytics.tsx` (updated)
- `supabase/migrations/002_add_amount_convention.sql` (new)

## Notes

- Diagnostic tools (`find-missing`, `compare-csv-db`) still use `Math.abs()` for comparison purposes, which is fine since they're matching amounts regardless of sign
- The convention is detected once during upload and stored, so calculations are fast
- If a file's convention is not detected, it defaults to 'negative' (most common for credit cards)




