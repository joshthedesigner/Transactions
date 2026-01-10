# Merchant Field Update: Single Field Design

## 📋 Summary

Updated `transactions_v2` schema to use a **single `merchant` field** instead of dual `merchant_raw` and `merchant_normalized` fields, per canonical design rules.

---

## ✅ Changes Made

### 1. SQL Migration (`004_create_transactions_v2.sql`)

**Removed:**
- `merchant_raw TEXT NOT NULL`
- `merchant_normalized TEXT NOT NULL`

**Added:**
- `merchant TEXT NOT NULL` - Single canonical merchant field

**Updated:**
- Index `idx_transactions_v2_user_merchant` now references `merchant`
- Constraint `chk_merchant_not_empty` now checks `merchant`
- All example queries updated to use `merchant`
- Added ALTER statements for existing tables

**ALTER Statements Included:**
- Migrates existing data from `merchant_normalized` (or `merchant_raw` as fallback)
- Drops old columns after migration
- Recreates indexes and constraints

### 2. TypeScript Types (`lib/types/transactions-v2.ts`)

**Updated:**
- `TransactionV2Insert.merchant: string` (replaces `merchant_raw` and `merchant_normalized`)
- `TransactionV2.merchant: string`
- `validateTransaction()` now checks `merchant` field

**Added:**
- `normalizeMerchant(rawMerchant: string): string` - Helper to clean merchant names
- Complete example showing how to create `TransactionV2Insert` from CSV row

### 3. Example INSERT Statement

**SQL Example:**
```sql
INSERT INTO transactions_v2 (
  user_id, source_filename, source_file_hash, uploaded_at,
  transaction_date, merchant,
  amount_raw, amount_spending, amount_convention,
  is_credit, is_payment, notes
) VALUES (
  'user-uuid',
  'Chase2861_Activity.csv',
  'abc123...',
  NOW(),
  '2025-01-15',
  'AMZN MKTP US*1234',  -- Single merchant field
  -45.99,               -- Raw amount
  45.99,                -- Pre-calculated spending
  'negative',
  false,
  false,
  NULL                  -- Optional: store raw merchant here if needed
);
```

**TypeScript Example:**
```typescript
const transaction: TransactionV2Insert = {
  user_id: userId,
  source_filename: 'Chase2861_Activity.csv',
  source_file_hash: fileHash,
  uploaded_at: new Date(),
  transaction_date: new Date(csvRow.date),
  merchant: normalizeMerchant(csvRow.merchant),  // Single field
  amount_raw: parseFloat(csvRow.amount),
  amount_spending: calculateSpendingAmount(parseFloat(csvRow.amount), convention),
  amount_convention: convention,
  is_credit: false,
  is_payment: isPaymentMerchant(csvRow.merchant),
  notes: csvRow.merchant !== normalizeMerchant(csvRow.merchant) 
    ? csvRow.merchant  // Store raw if different
    : null,
};
```

---

## 🎯 Design Rationale

### Why Single Field?

1. **Simplicity**: One field to manage, not two
2. **Consistency**: No confusion about which field to use
3. **Flexibility**: Raw CSV data can go in `notes` if preservation needed
4. **Canonical Design**: Matches v2 rules exactly

### What About Raw CSV Data?

If you need to preserve the exact raw merchant string from CSV:
- Store it in the `notes` field
- Or normalize at upload time and store only the cleaned version

**Example:**
```typescript
// CSV has: "AMZN MKTP US*1234"
// Normalized: "Amazon"
// Store normalized in merchant, raw in notes if different

merchant: normalizeMerchant(csvRow.merchant),  // "Amazon"
notes: csvRow.merchant !== normalizeMerchant(csvRow.merchant) 
  ? csvRow.merchant  // "AMZN MKTP US*1234"
  : null
```

---

## 🔄 Migration Path

### For Fresh Database
Just run the migration - it creates the table with single `merchant` field.

### For Existing Database
The migration includes ALTER statements that:
1. Add `merchant` column
2. Migrate data from `merchant_normalized` (or `merchant_raw` as fallback)
3. Make `merchant` NOT NULL
4. Drop old columns
5. Recreate indexes and constraints

**Run the migration - it handles both cases automatically.**

---

## ✅ Validation

All constraints preserved:
- ✅ `merchant` NOT NULL
- ✅ `CHECK (LENGTH(TRIM(merchant)) > 0)`
- ✅ Index on `(user_id, merchant)`
- ✅ All example queries updated
- ✅ TypeScript types aligned

**The critical query still works:**
```sql
SELECT SUM(amount_spending) 
FROM transactions_v2 
WHERE user_id = 'user-uuid';
```

---

## 📝 Files Updated

1. ✅ `supabase/migrations/004_create_transactions_v2.sql`
   - Single `merchant` field
   - Updated indexes, constraints, examples
   - ALTER statements for existing tables

2. ✅ `lib/types/transactions-v2.ts`
   - Updated types to use `merchant: string`
   - Added `normalizeMerchant()` helper
   - Updated `validateTransaction()`
   - Added complete example

---

## 🚀 Next Steps

1. **Run the migration** (handles both fresh and existing databases)
2. **Update upload code** to use single `merchant` field
3. **Use `normalizeMerchant()`** helper when processing CSV rows
4. **Test with real CSV files** - verify totals still match

---

## 💡 Key Takeaways

- **Single field design** = simpler, more maintainable
- **Raw data preservation** = use `notes` field if needed
- **Normalization** = happens at upload time via `normalizeMerchant()`
- **Backward compatible** = ALTER statements handle existing data
- **All constraints preserved** = data integrity maintained

---

*Updated: 2026-01-10*
*Design: transactions_v2 canonical rules*

