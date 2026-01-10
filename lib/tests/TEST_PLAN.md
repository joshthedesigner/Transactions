# transactions_v2 Test Plan

## 📋 Overview

This is a **complete, self-contained test suite** for the `transactions_v2` implementation. It validates all functionality before deploying to production.

---

## 🗂️ Test Files

1. **`test-transactions-v2.ts`** - TypeScript test suite with 7 test scenarios
2. **`test-data.csv`** - Sample CSV with 5 transactions (spending, credits, payments)
3. **`test-validation.sql`** - SQL queries to validate data after upload

---

## 📊 Test Data

### CSV Content (`test-data.csv`)

```csv
date,merchant,amount
2025-01-15,AMZN MKTP US*1234,-45.99
2025-01-16,STARBUCKS STORE 1234,-5.50
2025-01-17,REFUND AMAZON,25.00
2025-01-18,AUTOMATIC PAYMENT THANK YOU,-500.00
2025-01-19,WHOLE FOODS MARKET,-89.32
```

### Expected Results

| Row | Date | Merchant | Raw Amount | Spending | Type | Flags |
|-----|------|----------|------------|----------|------|-------|
| 1 | 2025-01-15 | AMZN MKTP US*1234 | -45.99 | 45.99 | Spending | credit=false, payment=false |
| 2 | 2025-01-16 | STARBUCKS STORE 1234 | -5.50 | 5.50 | Spending | credit=false, payment=false |
| 3 | 2025-01-17 | REFUND AMAZON | 25.00 | 0.00 | Credit | credit=true, payment=false |
| 4 | 2025-01-18 | AUTOMATIC PAYMENT THANK YOU | -500.00 | 0.00 | Payment | credit=false, payment=true |
| 5 | 2025-01-19 | WHOLE FOODS MARKET | -89.32 | 89.32 | Spending | credit=false, payment=false |

**Total Spending**: $140.81 (rows 1, 2, 5 only)

---

## 🧪 Test Scenarios

### TEST 1: Create TransactionV2Insert from CSV Rows

**Purpose**: Validate CSV parsing and object creation

**Steps**:
1. Parse CSV content
2. For each row:
   - Calculate `amount_spending` using `calculateSpendingAmount()`
   - Normalize merchant using `normalizeMerchant()`
   - Detect payment using `isPaymentMerchant()`
   - Set `is_credit` flag
   - Create `TransactionV2Insert` object
   - Validate using `validateTransaction()`

**Expected Output**:
```
🧪 TEST 1: Create TransactionV2Insert from CSV rows
============================================================
✓ Row 2025-01-15:
  Merchant: AMZN MKTP US*1234
  Raw: $-45.99 → Spending: $45.99
  Flags: credit=false, payment=false
✓ Row 2025-01-16:
  Merchant: STARBUCKS STORE 1234
  Raw: $-5.50 → Spending: $5.50
  Flags: credit=false, payment=false
✓ Row 2025-01-17:
  Merchant: REFUND AMAZON
  Raw: $25.00 → Spending: $0.00
  Flags: credit=true, payment=false
✓ Row 2025-01-18:
  Merchant: AUTOMATIC PAYMENT THANK YOU
  Raw: $-500.00 → Spending: $0.00
  Flags: credit=false, payment=true
✓ Row 2025-01-19:
  Merchant: WHOLE FOODS MARKET
  Raw: $-89.32 → Spending: $89.32
  Flags: credit=false, payment=false

📊 Summary:
  Total transactions: 5
  Expected total spending: $140.81
```

---

### TEST 2: Upload Valid Transactions

**Purpose**: Test atomic upload functionality

**Steps**:
1. Create `TransactionV2Insert` objects from CSV
2. Generate `source_file_hash` using `generateFileHash()`
3. Check for duplicate (should not exist)
4. Call `uploadTransactionsV2()` with File object
5. Verify upload succeeds

**Expected Output**:
```
🧪 TEST 2: Upload valid transactions
============================================================
✅ Simulated upload result:
   Transactions inserted: 5
   Total spending: $140.81
   Status: SUCCESS
```

**Validation**:
- All 5 transactions inserted
- Total matches expected ($140.81)
- No errors returned

---

### TEST 3: Validate Totals with Critical Query

**Purpose**: Verify the critical query returns correct totals

**SQL Query**:
```sql
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'test-user-id'
  AND amount_spending > 0;
```

**Expected Result**:
- `transaction_count`: 3 (rows 1, 2, 5)
- `total_spending`: 140.81

**Validation**:
- Count matches non-zero spending transactions
- Total matches expected from upload
- If mismatch, data integrity issue detected

---

### TEST 4: Duplicate Detection

**Purpose**: Verify duplicate files are rejected

**Steps**:
1. Upload `test-data.csv` (first time)
2. Generate same `source_file_hash`
3. Attempt to upload same file again
4. Verify upload is rejected

**Expected Behavior**:
- First upload: `already_uploaded = false` → Upload succeeds
- Second upload: `already_uploaded = true` → Upload rejected
- Error message: "File already uploaded (duplicate detected)"

**SQL Check**:
```sql
SELECT EXISTS (
  SELECT 1 
  FROM transactions_v2
  WHERE user_id = 'test-user-id'
    AND source_file_hash = '<hash>'
) as already_uploaded;
```

---

### TEST 5: Rollback on Invalid Data

**Purpose**: Verify atomic rollback when invalid data is included

**Test CSV** (contains invalid row):
```csv
date,merchant,amount
2025-01-15,AMZN MKTP US*1234,-45.99
2025-01-16,,50.00
2025-01-17,STARBUCKS,-5.50
```

**Expected Behavior**:
- Row 1: Valid ✓
- Row 2: Invalid (empty merchant) ✗
- Row 3: Valid ✓
- **Upload should fail entirely** (no rows inserted)
- Error message indicates validation failure

**Validation**:
- No transactions inserted
- Database unchanged
- Error returned with details

---

### TEST 6: Constraint Validation Queries

**Purpose**: Verify all database constraints are satisfied

**Queries**:

1. **Spending Flags Constraint**:
   ```sql
   SELECT COUNT(*) FROM transactions_v2
   WHERE (amount_spending > 0 AND (is_credit OR is_payment)) OR
         (amount_spending = 0 AND NOT is_credit AND NOT is_payment);
   ```
   Expected: **0 rows**

2. **Empty Merchants**:
   ```sql
   SELECT COUNT(*) FROM transactions_v2
   WHERE merchant IS NULL OR LENGTH(TRIM(merchant)) = 0;
   ```
   Expected: **0 rows**

3. **Negative Spending**:
   ```sql
   SELECT COUNT(*) FROM transactions_v2
   WHERE amount_spending < 0;
   ```
   Expected: **0 rows**

4. **Calculation Mismatches**:
   ```sql
   SELECT COUNT(*) FROM transactions_v2
   WHERE ABS(amount_spending - expected_calculation) > 0.01;
   ```
   Expected: **0 rows**

---

### TEST 7: Complete Test Scenario

**Purpose**: End-to-end validation

**Steps**:
1. Parse test CSV
2. Create TransactionV2Insert objects
3. Validate all transactions
4. Upload to database
5. Query totals and verify match
6. Attempt duplicate upload (should fail)
7. Run constraint validation queries
8. Clean up test data (optional)

**Success Criteria**:
- ✓ All transactions validate
- ✓ Upload succeeds
- ✓ Database total matches expected total
- ✓ Duplicate upload is rejected
- ✓ All constraint queries return 0 violations

---

## 🚀 How to Run Tests

### Option 1: TypeScript Test Suite

```typescript
import { runAllTests } from '@/lib/tests/test-transactions-v2';

// Run all tests
await runAllTests();
```

### Option 2: Manual SQL Validation

1. Upload `test-data.csv` using your upload function
2. Run queries from `test-validation.sql`
3. Verify all expected results match

### Option 3: Step-by-Step Manual Test

1. **Create test user** (or use existing)
2. **Upload test CSV**:
   ```typescript
   const file = new File([csvContent], 'test_transactions.csv');
   const result = await uploadTransactionsV2([file]);
   ```
3. **Verify totals**:
   ```sql
   SELECT SUM(amount_spending) FROM transactions_v2 
   WHERE user_id = 'test-user-id' AND amount_spending > 0;
   -- Expected: 140.81
   ```
4. **Test duplicate**:
   ```typescript
   // Try uploading same file again
   const result2 = await uploadTransactionsV2([file]);
   // Should fail with duplicate error
   ```
5. **Run constraint queries** (from `test-validation.sql`)

---

## ✅ Success Criteria

All tests pass if:

- [ ] TEST 1: All 5 transactions created successfully
- [ ] TEST 2: Upload succeeds with 5 transactions, $140.81 total
- [ ] TEST 3: Critical query returns 3 transactions, $140.81
- [ ] TEST 4: Duplicate upload is rejected
- [ ] TEST 5: Invalid data causes rollback (no rows inserted)
- [ ] TEST 6: All constraint queries return 0 violations
- [ ] TEST 7: Complete scenario passes all checks

---

## 📝 Expected Console Output

```
🚀 transactions_v2 Test Suite
============================================================
Running comprehensive tests...

🧪 TEST 1: Create TransactionV2Insert from CSV rows
============================================================
✓ Row 2025-01-15: ...
✓ Row 2025-01-16: ...
✓ Row 2025-01-17: ...
✓ Row 2025-01-18: ...
✓ Row 2025-01-19: ...

📊 Summary:
  Total transactions: 5
  Expected total spending: $140.81

🧪 TEST 2: Upload valid transactions
============================================================
✅ Simulated upload result:
   Transactions inserted: 5
   Total spending: $140.81
   Status: SUCCESS

🧪 TEST 3: Validate totals with critical query
============================================================
📊 Expected Result:
   transaction_count: 3
   total_spending: $140.81

... (continues for all tests)

✅ All tests completed
============================================================
```

---

## 🔍 SQL Validation Checklist

After uploading test data, run these queries and verify:

- [ ] **Critical Query**: Returns 3 transactions, $140.81
- [ ] **All Transactions**: 5 total (3 spending, 1 credit, 1 payment)
- [ ] **Constraint Violations**: 0 rows
- [ ] **Empty Merchants**: 0 rows
- [ ] **Negative Spending**: 0 rows
- [ ] **Calculation Mismatches**: 0 rows
- [ ] **Transaction Details**: All 5 rows match expected values
- [ ] **Duplicate Check**: File hash exists after upload
- [ ] **File Summary**: Matches expected counts and totals
- [ ] **Merchant Aggregation**: 3 merchants with correct totals

---

## 🎯 Next Steps After Tests Pass

1. **Test with real CSV files**:
   - Upload your 4 actual CSV files
   - Verify critical query returns $91,180.01
   - Check all constraint queries pass

2. **Production Deployment**:
   - All tests pass ✓
   - Real data validates correctly ✓
   - Constraint queries return 0 violations ✓

3. **Monitor**:
   - Run constraint validation queries periodically
   - Verify upload totals match database totals
   - Check for any data integrity issues

---

## 📚 Files Reference

- **Test Suite**: `lib/tests/test-transactions-v2.ts`
- **Test Data**: `lib/tests/test-data.csv`
- **SQL Validation**: `lib/tests/test-validation.sql`
- **Types**: `lib/types/transactions-v2.ts`
- **Upload Function**: `lib/actions/upload-transactions-v2.ts`

---

*Test Plan Version: 1.0*
*Last Updated: 2026-01-10*

