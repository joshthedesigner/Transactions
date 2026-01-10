# Refactoring to transactions_v2 - Complete Guide

## Overview

This document tracks the complete refactoring of the application to use `transactions_v2` as the **single source of truth** for all transactions.

## Key Changes

### 1. Upload Flow ✅

**Updated Files:**
- `app/components/FileUpload.tsx` - Now uses `uploadTransactionsV2(formData)` with correct FormData key (`files`)
- `app/upload/page.tsx` - Updated to use correct return type fields (`totalTransactions`, `totalSpending`)

**Key Changes:**
- All uploads now use `uploadTransactionsV2(formData)` 
- FormData must use key `'files'` (not `'file'`)
- Return type uses `totalTransactions` and `totalSpending` (not `totalTransactionCount` and `totalValue`)
- All uploads are atomic with duplicate detection via `source_file_hash`

### 2. Dashboard & Analytics ✅

**Updated Files:**
- `lib/actions/dashboard.ts` - Queries `transactions_v2` with `amount_spending`
- `lib/actions/analytics.ts` - All functions updated to use `transactions_v2`

**Key Changes:**
- All queries use `transactions_v2` table
- Use `amount_spending` directly (pre-calculated, always >= 0)
- Use single `merchant` field (no `merchant_raw`/`merchant_normalized` split)
- Filter by `amount_spending > 0` to exclude credits/payments
- No more convention calculation needed (already done at upload time)

### 3. Review Queue ✅

**Updated Files:**
- `lib/actions/review-queue.ts` - Updated to work with `transactions_v2`
- `app/components/ReviewQueue.tsx` - Updated to handle new field names

**Key Changes:**
- `transactions_v2` has no `status` field (all transactions are auto-approved)
- Review queue now shows transactions that need category assignment (`category_id IS NULL`)
- Uses `merchant` field instead of `merchant_normalized`
- Uses `transaction_date` instead of `date`
- Uses `amount_spending` instead of calculated `amount`

### 4. Type System

**Canonical Types:**
- `TransactionV2Insert` - For inserting new transactions
- `TransactionV2` - For retrieved transactions
- `UploadResult` - Return type from `uploadTransactionsV2()`

**Helper Functions:**
- `calculateSpendingAmount(rawAmount, convention)` - Canonical calculation
- `normalizeMerchant(rawMerchant)` - Merchant normalization
- `isPaymentMerchant(merchant)` - Payment detection
- `generateFileHash(filename, userId)` - Duplicate detection
- `validateTransaction(tx)` - Transaction validation

## Database Schema

### transactions_v2 Table

```sql
CREATE TABLE transactions_v2 (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source_filename TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL,
  transaction_date DATE NOT NULL,
  merchant TEXT NOT NULL,
  amount_raw NUMERIC(12,2) NOT NULL,
  amount_spending NUMERIC(12,2) NOT NULL CHECK (amount_spending >= 0),
  amount_convention TEXT NOT NULL CHECK (amount_convention IN ('positive', 'negative')),
  is_credit BOOLEAN NOT NULL DEFAULT false,
  is_payment BOOLEAN NOT NULL DEFAULT false,
  category_id INTEGER REFERENCES categories(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT spending_flags_check CHECK (
    (amount_spending > 0 AND NOT (is_credit OR is_payment)) OR
    (amount_spending = 0 AND (is_credit OR is_payment))
  )
);
```

## Critical Query

After every upload, validate totals with this query:

```sql
SELECT 
  COUNT(*) as transaction_count, 
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-id'
  AND amount_spending > 0;
```

This should match the upload result exactly.

## Migration Notes

### Removed Fields
- `merchant_raw` - Use `merchant` field (raw merchant stored in `notes` if needed)
- `merchant_normalized` - Use `merchant` field (already normalized)
- `status` - All transactions in v2 are auto-approved
- `amount` - Use `amount_spending` (pre-calculated)

### Removed Tables
- Old `transactions` table (if exists) - All data should be migrated to `transactions_v2`

### Removed Logic
- Convention lookup from `source_files` table
- Runtime calculation of `amount_spending` from `amount` + convention
- Status-based filtering (`pending_review` vs `approved`)

## Example Usage

### Upload CSV File

```typescript
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';

// Create FormData (required for Server Actions)
const formData = new FormData();
formData.append('files', file);

// Upload
const result = await uploadTransactionsV2(formData);

if (result.success) {
  console.log(`Uploaded ${result.totalTransactions} transactions`);
  console.log(`Total spending: $${result.totalSpending}`);
}
```

### Query Transactions

```typescript
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const { data } = await supabase
  .from('transactions_v2')
  .select('*')
  .eq('user_id', userId)
  .gt('amount_spending', 0) // Only spending transactions
  .order('transaction_date', { ascending: false });
```

### Validate Totals

```sql
-- Critical query to validate upload totals
SELECT 
  COUNT(*) as transaction_count, 
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-id'
  AND amount_spending > 0;
```

## Files Still Using Legacy Tables

The following files still reference the old `transactions` table but are primarily diagnostic/debug tools:
- `lib/actions/debug-*.ts` - Debug utilities
- `lib/actions/diagnose-*.ts` - Diagnostic tools
- `lib/actions/compare-*.ts` - Comparison utilities
- `lib/actions/check-*.ts` - Check utilities

These can be updated incrementally as needed. The core application flow (upload, dashboard, analytics, review) is now fully migrated to `transactions_v2`.

## Legacy Upload Function

`lib/actions/upload-transactions.ts` is now **deprecated**. All new uploads should use `uploadTransactionsV2()`.

## Testing

1. Upload test CSV file via `/test-upload` page
2. Verify totals match critical query
3. Test duplicate detection (upload same file twice)
4. Verify dashboard shows correct totals
5. Verify analytics charts show correct data
6. Test review queue (assign categories)

## Next Steps

1. Update diagnostic/debug tools to use `transactions_v2` (optional)
2. Migrate any existing data from old `transactions` table to `transactions_v2` (if needed)
3. Remove old `transactions` table once migration is complete
4. Update any remaining components that reference legacy fields

