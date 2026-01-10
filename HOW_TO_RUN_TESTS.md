# How to Run the 4 Test Steps

## 🚀 Quick Start

### Step 1: Upload Test CSV ✅

1. **Navigate to**: `http://localhost:3000/test-upload`
2. **Click**: "Upload Test CSV" button
3. **Check result**: Should show "5 transactions, $140.81 total"
4. **If successful**: Click "Continue to Step 2"

**Expected Output**:
```
✅ Upload Successful
Transactions: 5
Total Spending: $140.81
```

---

### Step 2: Validate Totals with SQL ✅

1. **Open Supabase Dashboard**:
   - Go to your Supabase project
   - Click "SQL Editor" in left sidebar

2. **Get your User ID**:
   ```sql
   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;
   ```
   - Copy the `id` (UUID)

3. **Run this query** (replace `YOUR_USER_ID` with your actual ID):
   ```sql
   SELECT 
     COUNT(*) as transaction_count,
     SUM(amount_spending) as total_spending
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND amount_spending > 0;
   ```

4. **Check results**:
   - `transaction_count` should be **3**
   - `total_spending` should be **140.81**

5. **If it matches**: Go back to test page and click "Continue to Step 3"

---

### Step 3: Test Duplicate Detection ✅

1. **On the test page** (`http://localhost:3000/test-upload`)
2. **Click**: "Try Uploading Same File Again" button
3. **Expected result**: Should show error "File already uploaded (duplicate detected)"
4. **This is correct!** The duplicate was detected and rejected.

**Expected Output**:
```
✅ Duplicate Correctly Rejected
File already uploaded (duplicate detected)
```

---

### Step 4: Run Constraint Queries ✅

1. **In Supabase SQL Editor**, run these 4 queries one by one:

   **Query 1: Constraint Violations**
   ```sql
   SELECT COUNT(*) as violation_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND (
       (amount_spending > 0 AND (is_credit OR is_payment)) OR
       (amount_spending = 0 AND NOT is_credit AND NOT is_payment)
     );
   ```
   **Expected**: `violation_count = 0` ✅

   **Query 2: Empty Merchants**
   ```sql
   SELECT COUNT(*) as empty_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);
   ```
   **Expected**: `empty_count = 0` ✅

   **Query 3: Negative Spending**
   ```sql
   SELECT COUNT(*) as negative_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND amount_spending < 0;
   ```
   **Expected**: `negative_count = 0` ✅

   **Query 4: Transaction Summary**
   ```sql
   SELECT 
     COUNT(*) as total_rows,
     COUNT(*) FILTER (WHERE amount_spending > 0) as spending_rows,
     COUNT(*) FILTER (WHERE is_credit) as credit_rows,
     COUNT(*) FILTER (WHERE is_payment) as payment_rows
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND source_filename = 'test_transactions.csv';
   ```
   **Expected**: 
   - `total_rows = 5`
   - `spending_rows = 3`
   - `credit_rows = 1`
   - `payment_rows = 1` ✅

2. **If all queries return expected results**: ✅ All tests pass!

---

## ✅ Success Checklist

After completing all 4 steps:

- [ ] Step 1: Upload shows 5 transactions, $140.81
- [ ] Step 2: SQL query returns 3 transactions, $140.81
- [ ] Step 3: Duplicate upload is rejected
- [ ] Step 4: All 4 constraint queries return 0 violations

**If all checked**: Your `transactions_v2` implementation is working correctly! 🎉

---

## 🐛 Troubleshooting

### Can't access test page?
- Make sure dev server is running: `npm run dev`
- Visit: `http://localhost:3000/test-upload`

### Step 1 fails: "File not found"
- The CSV file should be at `/public/test-data.csv`
- Check that the file exists

### Step 1 fails: "Not authenticated"
- Make sure you're logged in to your app
- The upload function needs an authenticated user

### Step 2: Wrong totals
- Double-check you're using the correct `user_id`
- Make sure you're querying `transactions_v2` table (not `transactions`)
- Verify `amount_spending > 0` filter is included

### Step 3: Duplicate not detected
- Check that `source_file_hash` is being generated
- Verify the same file is being uploaded (same filename)

---

## 📝 Quick Reference

**Test Page**: `http://localhost:3000/test-upload`

**Test CSV**: Located at `/public/test-data.csv`

**Expected Results**:
- Upload: 5 transactions, $140.81
- SQL Query: 3 transactions, $140.81
- Duplicate: Rejected
- Constraints: All 0 violations

---

*Follow these steps in order to validate your implementation!*

