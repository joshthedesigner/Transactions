# transactions_v2 Complete Implementation Guide

## 📋 Overview

This guide provides everything needed to work with the `transactions_v2` table - the **single source of truth** for all transactions.

---

## 🗂️ Files Created

### 1. **TypeScript Types** (`lib/types/transactions-v2.ts`)
- `TransactionV2Insert` - For inserting new transactions
- `TransactionV2` - Full record with id/timestamps
- Helper functions:
  - `calculateSpendingAmount()` - Canonical calculation
  - `generateFileHash()` - Duplicate detection
  - `normalizeMerchant()` - Clean merchant names
  - `isPaymentMerchant()` - Detect payments
  - `validateTransaction()` - Validate constraints

### 2. **Atomic Upload Function** (`lib/actions/upload-transactions-v2.ts`)
- `uploadTransactionsV2()` - Main upload function
- Handles multiple files
- Atomic transactions (all-or-nothing)
- Duplicate detection
- Pre-calculates `amount_spending`
- Validates all constraints
- Returns detailed results

### 3. **SQL Queries** (`lib/queries/transactions-v2-queries.sql`)
- Critical total spending query
- Duplicate file detection
- Merchant aggregation
- Date range queries
- Data integrity validation
- File listing queries

### 4. **Example Usage** (`lib/examples/transactions-v2-usage.ts`)
- 9 complete examples showing:
  - Creating transactions from CSV rows
  - Uploading files
  - Querying totals
  - Checking duplicates
  - Validating data integrity
  - Complete upload flow

---

## 🚀 Quick Start

### Upload Files

```typescript
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';

const files: File[] = [/* your CSV files */];

// Create FormData (required for Server Actions)
const formData = new FormData();
files.forEach(file => formData.append('files', file));

const result = await uploadTransactionsV2(formData);

if (result.success) {
  console.log(`✅ ${result.totalTransactions} transactions, $${result.totalSpending.toFixed(2)}`);
} else {
  console.error(`❌ ${result.message}`);
}
```

### Query Totals

```typescript
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

const { data } = await supabase
  .from('transactions_v2')
  .select('amount_spending')
  .eq('user_id', user.id)
  .gt('amount_spending', 0);

const total = data?.reduce((sum, row) => sum + Number(row.amount_spending), 0) || 0;
console.log(`Total: $${total.toFixed(2)}`);
```

---

## 📊 Schema Reference

### Table: `transactions_v2`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGINT | PRIMARY KEY | Auto-increment ID |
| `user_id` | UUID | NOT NULL, FK | User who owns transaction |
| `source_filename` | TEXT | NOT NULL | Original CSV filename |
| `source_file_hash` | TEXT | NOT NULL | SHA256 hash for duplicate detection |
| `uploaded_at` | TIMESTAMPTZ | NOT NULL | When file was uploaded |
| `transaction_date` | DATE | NOT NULL | When transaction occurred |
| `merchant` | TEXT | NOT NULL, length > 0 | Canonical merchant name |
| `amount_raw` | NUMERIC(12,2) | NOT NULL | Original CSV amount (sign preserved) |
| `amount_spending` | NUMERIC(12,2) | NOT NULL, >= 0 | Pre-calculated spending (always >= 0) |
| `amount_convention` | TEXT | NOT NULL, IN ('positive','negative') | Sign convention used |
| `is_credit` | BOOLEAN | NOT NULL | True if refund/credit |
| `is_payment` | BOOLEAN | NOT NULL | True if payment |
| `category` | TEXT | NULL | Optional category |
| `notes` | TEXT | NULL | Optional notes (can store raw merchant) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Last update time |

### Critical Constraints

1. **Spending Flags Constraint**:
   ```sql
   CHECK (
     (amount_spending > 0 AND is_credit = false AND is_payment = false) OR
     (amount_spending = 0 AND (is_credit = true OR is_payment = true))
   )
   ```

2. **Merchant Not Empty**:
   ```sql
   CHECK (LENGTH(TRIM(merchant)) > 0)
   ```

3. **Spending Non-Negative**:
   ```sql
   CHECK (amount_spending >= 0)
   ```

---

## 🔑 Key Concepts

### 1. Pre-Calculated Amounts

**Never recalculate `amount_spending` at query time.**

```typescript
// ✅ CORRECT: Calculate once at upload
const spending = calculateSpendingAmount(rawAmount, convention);
// Store in amount_spending column

// ❌ WRONG: Don't calculate at query time
// SELECT calculateSpendingAmount(amount_raw, convention) FROM ...
```

### 2. Single Merchant Field

**No `merchant_raw` or `merchant_normalized` - just `merchant`.**

```typescript
// ✅ CORRECT: Single field
merchant: normalizeMerchant(csvRow.merchant)

// ❌ WRONG: Don't use old columns
// merchant_raw: csvRow.merchant
// merchant_normalized: normalizeMerchant(csvRow.merchant)
```

### 3. Duplicate Detection

**Use `source_file_hash` to prevent duplicate uploads.**

```typescript
const hash = await generateFileHash(filename, userId, uploadedAt);

// Check before upload
const { data } = await supabase
  .from('transactions_v2')
  .select('id')
  .eq('source_file_hash', hash)
  .limit(1);

if (data && data.length > 0) {
  throw new Error('File already uploaded');
}
```

### 4. Atomic Uploads

**All rows from a file insert together, or none do.**

The upload function uses Supabase's transaction support to ensure atomicity.

---

## ✅ The Critical Test

After uploading your 4 CSV files, this query **must** return:

```sql
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-id'
  AND amount_spending > 0;
```

**Expected Result**: `1516 transactions, $91,180.01`

If it doesn't match, something is wrong.

---

## 📝 Example: Complete Upload Flow

```typescript
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';
import { createClient } from '@/lib/supabase/server';

async function uploadAndValidate(files: File[]) {
  // Step 1: Upload
  const result = await uploadTransactionsV2(files);
  
  if (!result.success) {
    throw new Error(result.message);
  }
  
  // Step 2: Validate totals
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data } = await supabase
    .from('transactions_v2')
    .select('amount_spending')
    .eq('user_id', user.id)
    .gt('amount_spending', 0);
  
  const dbTotal = data?.reduce((sum, r) => sum + Number(r.amount_spending), 0) || 0;
  
  // Step 3: Verify match
  if (Math.abs(dbTotal - result.totalSpending) > 0.01) {
    throw new Error(`Total mismatch: upload=${result.totalSpending}, db=${dbTotal}`);
  }
  
  console.log('✅ Upload validated!');
  return result;
}
```

---

## 🔍 Data Integrity Queries

### Check Constraint Violations

```sql
SELECT 
  id,
  amount_spending,
  is_credit,
  is_payment
FROM transactions_v2
WHERE user_id = 'your-user-id'
  AND (
    (amount_spending > 0 AND (is_credit OR is_payment)) OR
    (amount_spending = 0 AND NOT is_credit AND NOT is_payment)
  );
```

Should return **0 rows**.

### Check Empty Merchants

```sql
SELECT id, merchant
FROM transactions_v2
WHERE user_id = 'your-user-id'
  AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);
```

Should return **0 rows**.

---

## 🎯 Common Patterns

### Pattern 1: Create Transaction from CSV Row

```typescript
import {
  TransactionV2Insert,
  calculateSpendingAmount,
  normalizeMerchant,
  isPaymentMerchant,
  generateFileHash,
} from '@/lib/types/transactions-v2';

const transaction: TransactionV2Insert = {
  user_id: userId,
  source_filename: filename,
  source_file_hash: await generateFileHash(filename, userId, new Date()),
  uploaded_at: new Date(),
  transaction_date: new Date(csvRow.date),
  merchant: normalizeMerchant(csvRow.merchant),
  amount_raw: parseFloat(csvRow.amount),
  amount_spending: calculateSpendingAmount(parseFloat(csvRow.amount), convention),
  amount_convention: convention,
  is_credit: false,
  is_payment: isPaymentMerchant(csvRow.merchant),
  category: null,
  notes: null,
};
```

### Pattern 2: Query User Totals

```typescript
const { data } = await supabase
  .from('transactions_v2')
  .select('amount_spending')
  .eq('user_id', user.id)
  .gt('amount_spending', 0);

const total = data?.reduce((sum, r) => sum + Number(r.amount_spending), 0) || 0;
```

### Pattern 3: Check Duplicate

```typescript
const hash = await generateFileHash(filename, userId, new Date());

const { data } = await supabase
  .from('transactions_v2')
  .select('id')
  .eq('user_id', userId)
  .eq('source_file_hash', hash)
  .limit(1);

const isDuplicate = data && data.length > 0;
```

---

## ⚠️ Important Notes

1. **Never modify `amount_spending` after insert** - it's pre-calculated
2. **Always use `merchant` field** - old `merchant_raw`/`merchant_normalized` don't exist
3. **Validate before insert** - use `validateTransaction()` helper
4. **Check duplicates before upload** - use `source_file_hash`
5. **Verify totals after upload** - query must match upload result

---

## 📚 File Reference

- **Types**: `lib/types/transactions-v2.ts`
- **Upload**: `lib/actions/upload-transactions-v2.ts`
- **Queries**: `lib/queries/transactions-v2-queries.sql`
- **Examples**: `lib/examples/transactions-v2-usage.ts`
- **Migration**: `supabase/migrations/004_create_transactions_v2.sql`

---

## ✅ Checklist

Before using in production:

- [ ] Migration `004_create_transactions_v2.sql` has been run
- [ ] Table exists with single `merchant` field (not `merchant_raw`/`merchant_normalized`)
- [ ] All constraints are enforced
- [ ] Upload function tested with real CSV files
- [ ] Critical query returns expected totals
- [ ] Duplicate detection works
- [ ] Data integrity validation passes

---

*Last Updated: 2026-01-10*
*Schema: transactions_v2 (canonical)*

