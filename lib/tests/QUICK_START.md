# Quick Start: Running transactions_v2 Tests

## 🚀 Fastest Way to Test

### Step 1: Upload Test CSV

```typescript
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';

// Read test CSV file
const csvContent = await fetch('/test-data.csv').then(r => r.text());
const file = new File([csvContent], 'test_transactions.csv', { type: 'text/csv' });

// Create FormData (required for Server Actions)
const formData = new FormData();
formData.append('files', file);

// Upload
const result = await uploadTransactionsV2(formData);
console.log(result);
// Expected: { success: true, totalTransactions: 5, totalSpending: 140.81 }
```

### Step 2: Validate Totals

```sql
-- Run in Supabase SQL Editor
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-test-user-id'
  AND amount_spending > 0;

-- Expected: transaction_count = 3, total_spending = 140.81
```

### Step 3: Test Duplicate

```typescript
// Try uploading same file again
const result2 = await uploadTransactionsV2([file]);
// Expected: { success: false, message: "File already uploaded (duplicate detected)" }
```

### Step 4: Run Constraint Queries

Copy/paste queries from `test-validation.sql` into Supabase SQL Editor.

**All should return 0 violations.**

---

## ✅ Success = All Green

- [ ] Upload succeeds: 5 transactions, $140.81
- [ ] Critical query: 3 transactions, $140.81
- [ ] Duplicate rejected
- [ ] All constraint queries: 0 violations

---

## 📁 Test Files

- `test-transactions-v2.ts` - Full test suite
- `test-data.csv` - Sample CSV (5 transactions)
- `test-validation.sql` - SQL validation queries
- `TEST_PLAN.md` - Complete documentation

---

*Run these tests before deploying to production!*

