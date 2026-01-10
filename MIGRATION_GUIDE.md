# transactions_v2 Migration Guide

## 📋 Overview

This migration creates a new `transactions_v2` table that coexists with your existing system. It's designed to be **self-contained** and **financially accurate**.

**Files Created:**
- `supabase/migrations/004_create_transactions_v2.sql` - Database schema
- `lib/types/transactions-v2.ts` - TypeScript types

---

## 🚀 How to Run Migration

### Step 1: Apply Migration to Supabase

```bash
# If using Supabase CLI
npx supabase db push

# Or manually via Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Copy contents of 004_create_transactions_v2.sql
# 3. Run the SQL
```

### Step 2: Verify Migration

```sql
-- Check table was created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'transactions_v2';

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'transactions_v2';

-- Check views
SELECT table_name 
FROM information_schema.views 
WHERE table_name LIKE 'transactions_v2%';
```

---

## 🎯 Key Design Decisions

### 1. **Self-Contained (No Joins)**

**Problem**: Original design stored convention in separate `source_files` table, requiring joins.

**Solution**: Everything needed for calculation stored in transaction row:
```sql
-- Old (requires join)
SELECT t.amount, sf.amount_sign_convention
FROM transactions t
JOIN source_files sf ON t.source_file_id = sf.id;

-- New (no join needed)
SELECT amount_spending FROM transactions_v2;
```

### 2. **Pre-Calculated Amounts**

**Problem**: Calculating amounts at display time caused inconsistencies.

**Solution**: Calculate ONCE at upload, store forever:
```typescript
// At upload time (once)
const spending = calculateSpendingAmount(rawAmount, convention);

// Store both
amount_raw: -50.00      // Original from CSV
amount_spending: 50.00  // Pre-calculated

// At display time (always)
SELECT SUM(amount_spending)  // Just sum, never recalculate
```

### 3. **Explicit Flags**

**Problem**: Credits/payments inferred from amount, caused errors.

**Solution**: Explicit boolean flags:
```sql
is_credit: true/false   -- Refunds, returns
is_payment: true/false  -- Credit card payments
```

### 4. **Duplicate Protection**

**Problem**: Multiple uploads created duplicate records.

**Solution**: File hash for detection:
```typescript
source_file_hash = SHA256(filename + user_id + hour)

// Before upload, check:
SELECT EXISTS (
  SELECT 1 FROM transactions_v2
  WHERE user_id = $1 AND source_file_hash = $2
);
```

---

## 📊 Critical Constraint: Spending Amount Validation

The most important constraint:

```sql
CHECK (
  (amount_spending > 0 AND is_credit = false AND is_payment = false) OR
  (amount_spending = 0 AND (is_credit = true OR is_payment = true))
)
```

**What this means**:
- If `amount_spending > 0`: Must NOT be credit or payment
- If `amount_spending = 0`: Must BE credit or payment
- This prevents data inconsistency at database level

---

## 💾 Data Model Comparison

### Old Model (Original)
```sql
transactions {
  amount: -50.00,  -- Raw value
  source_file_id: 123  -- FK to source_files
}

source_files {
  id: 123,
  amount_sign_convention: 'negative'
}

-- Display calculation (fragile):
JOIN + lookup convention + calculate = sometimes wrong
```

### New Model (v2)
```sql
transactions_v2 {
  amount_raw: -50.00,        -- Original
  amount_spending: 50.00,    -- Pre-calculated
  amount_convention: 'negative',  -- Stored per transaction
  is_credit: false,
  is_payment: false
}

-- Display calculation (reliable):
SUM(amount_spending) = always correct
```

---

## 🔍 Usage Examples

### Example 1: Get User Total (The Critical Query)

```sql
-- This is THE query that must always equal upload total
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'user-uuid'
  AND amount_spending > 0;  -- Automatically excludes credits/payments

-- Expected result: 1516, $91,180.01
```

### Example 2: Check for Duplicate Upload

```typescript
const fileHash = await generateFileHash(filename, userId);

const { data } = await supabase
  .from('transactions_v2')
  .select('id')
  .eq('user_id', userId)
  .eq('source_file_hash', fileHash)
  .limit(1);

if (data && data.length > 0) {
  throw new Error('File already uploaded');
}
```

### Example 3: Insert Transactions

```typescript
const transactionsToInsert: TransactionV2Insert[] = normalizedRows.map(row => {
  const spending = calculateSpendingAmount(row.amount, convention);
  
  return {
    user_id: userId,
    source_filename: file.name,
    source_file_hash: fileHash,
    uploaded_at: new Date(),
    transaction_date: row.date,
    merchant_raw: row.merchant,
    merchant_normalized: normalizeMerchant(row.merchant),
    amount_raw: row.amount,
    amount_spending: spending,
    amount_convention: convention,
    is_credit: spending === 0 && row.amount !== 0,
    is_payment: isPaymentMerchant(row.merchant),
  };
});

// Insert atomically
await supabase.from('transactions_v2').insert(transactionsToInsert);
```

### Example 4: Validate Upload

```typescript
// After insert, validate totals match
const expectedTotal = transactionsToInsert.reduce(
  (sum, t) => sum + t.amount_spending, 
  0
);

const { data } = await supabase
  .from('transactions_v2')
  .select('amount_spending')
  .eq('source_file_hash', fileHash);

const dbTotal = data?.reduce((sum, row) => sum + row.amount_spending, 0) || 0;

if (Math.abs(expectedTotal - dbTotal) > 0.01) {
  throw new Error('Total mismatch - data integrity error');
}
```

### Example 5: List Uploaded Files

```typescript
const { data } = await supabase
  .from('transactions_v2_summary_by_file')  // Use view
  .select('*')
  .eq('user_id', userId)
  .order('uploaded_at', { ascending: false });

// Returns:
// [
//   {
//     source_filename: "activity.csv",
//     transaction_count: 571,
//     total_spending: 45647.76,
//     uploaded_at: "2026-01-10T..."
//   },
//   ...
// ]
```

---

## ✅ Validation Checklist

After migration, verify:

- [ ] Table `transactions_v2` exists
- [ ] All 7 indexes created
- [ ] 2 views created (`transactions_v2_summary_by_file`, `transactions_v2_user_totals`)
- [ ] RLS policies enabled (4 policies)
- [ ] Updated_at trigger working
- [ ] Constraints enforced (try inserting invalid data)

### Test Constraint Enforcement

```sql
-- This should FAIL (spending > 0 but is_credit = true)
INSERT INTO transactions_v2 (
  user_id, source_filename, source_file_hash, uploaded_at,
  transaction_date, merchant_raw, merchant_normalized,
  amount_raw, amount_spending, amount_convention,
  is_credit, is_payment
) VALUES (
  'test-user', 'test.csv', 'hash', NOW(),
  '2025-01-01', 'Test', 'Test',
  -50.00, 50.00, 'negative',
  true, false  -- ERROR: spending > 0 but is_credit = true
);
-- Expected: constraint violation

-- This should SUCCEED
INSERT INTO transactions_v2 (...) VALUES (
  ...,
  -50.00, 50.00, 'negative',
  false, false  -- OK: spending > 0, not credit/payment
);
```

---

## 🔄 Migration Strategy (Old → New)

If you want to migrate existing data from `transactions` → `transactions_v2`:

```sql
-- WARNING: This is complex due to convention lookup
-- Only run if you want to migrate old data

INSERT INTO transactions_v2 (
  user_id,
  source_filename,
  source_file_hash,
  uploaded_at,
  transaction_date,
  merchant_raw,
  merchant_normalized,
  amount_raw,
  amount_spending,
  amount_convention,
  is_credit,
  is_payment
)
SELECT 
  t.user_id,
  COALESCE(sf.filename, 'unknown.csv'),
  MD5(COALESCE(sf.filename, 'unknown') || t.user_id::text),  -- Generate hash
  t.created_at,
  t.date,
  t.merchant_raw,
  t.merchant_normalized,
  t.amount,
  -- Calculate spending amount
  CASE 
    WHEN COALESCE(sf.amount_sign_convention, 'negative') = 'negative' THEN
      CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END
    ELSE
      CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END
  END,
  COALESCE(sf.amount_sign_convention, 'negative'),
  -- Detect credit
  CASE 
    WHEN COALESCE(sf.amount_sign_convention, 'negative') = 'negative' THEN t.amount > 0
    ELSE t.amount < 0
  END,
  -- Detect payment
  LOWER(t.merchant_normalized) LIKE '%payment%'
FROM transactions t
LEFT JOIN source_files sf ON t.source_file_id = sf.id
WHERE t.status = 'approved';

-- Verify counts match
SELECT 
  'old' as source, COUNT(*), SUM(amount) FROM transactions WHERE status = 'approved'
UNION ALL
SELECT 
  'new' as source, COUNT(*), SUM(amount_spending) FROM transactions_v2;
```

---

## 🎯 The One Test That Matters

After everything is working, this query:

```sql
SELECT SUM(amount_spending) 
FROM transactions_v2 
WHERE user_id = 'your-user-id';
```

**Must return**: `91180.01`

If it doesn't, something is wrong and needs investigation.

---

## 📝 Next Steps

1. ✅ Run migration SQL
2. ✅ Verify table/indexes/views created
3. ✅ Test constraints (try invalid inserts)
4. ✅ Update upload code to use `transactions_v2`
5. ✅ Update dashboard to query `transactions_v2`
6. ✅ Test with real CSV files
7. ✅ Verify: upload total = dashboard total

---

## 🆘 Troubleshooting

### Q: Migration fails with "relation already exists"
A: Table already created. Either:
- Drop and recreate: `DROP TABLE transactions_v2 CASCADE;`
- Or skip migration if intentional

### Q: Can't insert - constraint violation
A: Check the constraint rules:
- `amount_spending >= 0` (must be non-negative)
- If `amount_spending > 0`, both `is_credit` and `is_payment` must be false
- If `amount_spending = 0`, either `is_credit` or `is_payment` must be true
- `merchant_normalized` cannot be empty

### Q: RLS blocking my queries
A: Ensure you're authenticated and using correct `user_id`:
```typescript
const { data: { user } } = await supabase.auth.getUser();
// Make sure user exists and user.id matches transaction.user_id
```

### Q: How to reset everything?
```sql
-- Delete all data but keep table
DELETE FROM transactions_v2;

-- Or drop and recreate
DROP TABLE transactions_v2 CASCADE;
-- Then rerun migration
```

---

## 📚 Related Files

- Migration SQL: `supabase/migrations/004_create_transactions_v2.sql`
- TypeScript types: `lib/types/transactions-v2.ts`
- Full spec: `APP_SPECIFICATION.md`
- Rebuild guide: `REBUILD_PROMPT.md`

