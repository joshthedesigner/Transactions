-- ============================================================================
-- Test Validation Queries for transactions_v2
-- 
-- Run these queries after uploading test-data.csv to validate:
-- 1. Totals match expected values
-- 2. All constraints are satisfied
-- 3. Duplicate detection works
-- 4. Data integrity is maintained
--
-- Replace 'TEST_USER_ID' with your actual test user ID
-- ============================================================================

-- Set test user ID (replace with actual test user UUID)
\set test_user_id '00000000-0000-0000-0000-000000000000'
\set test_filename 'test_transactions.csv'

-- ============================================================================
-- TEST 1: Critical Total Query (THE test that must pass)
-- ============================================================================

SELECT 
  'TEST 1: Critical Total Query' as test_name,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND amount_spending > 0;

-- Expected Result:
-- transaction_count: 3
-- total_spending: 140.81
-- (Row 1: 45.99, Row 2: 5.50, Row 5: 89.32)
-- (Row 3 is credit, Row 4 is payment - both excluded)

-- ============================================================================
-- TEST 2: Verify All Transactions Inserted
-- ============================================================================

SELECT 
  'TEST 2: All Transactions' as test_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE amount_spending > 0) as spending_rows,
  COUNT(*) FILTER (WHERE is_credit) as credit_rows,
  COUNT(*) FILTER (WHERE is_payment) as payment_rows
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND source_filename = :'test_filename';

-- Expected Result:
-- total_rows: 5
-- spending_rows: 3
-- credit_rows: 1
-- payment_rows: 1

-- ============================================================================
-- TEST 3: Check Spending Flags Constraint
-- ============================================================================

SELECT 
  'TEST 3: Constraint Violations' as test_name,
  COUNT(*) as violation_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND (
    (amount_spending > 0 AND (is_credit OR is_payment)) OR
    (amount_spending = 0 AND NOT is_credit AND NOT is_payment)
  );

-- Expected Result: 0 (no violations)

-- ============================================================================
-- TEST 4: Check Empty Merchants
-- ============================================================================

SELECT 
  'TEST 4: Empty Merchants' as test_name,
  COUNT(*) as empty_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);

-- Expected Result: 0 (no empty merchants)

-- ============================================================================
-- TEST 5: Check Negative Spending Amounts
-- ============================================================================

SELECT 
  'TEST 5: Negative Spending' as test_name,
  COUNT(*) as negative_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND amount_spending < 0;

-- Expected Result: 0 (all spending should be >= 0)

-- ============================================================================
-- TEST 6: Verify Amount Calculations
-- ============================================================================

SELECT 
  'TEST 6: Calculation Mismatches' as test_name,
  COUNT(*) as mismatch_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND ABS(
    amount_spending - 
    CASE 
      WHEN amount_convention = 'negative' AND amount_raw < 0 THEN ABS(amount_raw)
      WHEN amount_convention = 'positive' AND amount_raw > 0 THEN amount_raw
      ELSE 0
    END
  ) > 0.01;

-- Expected Result: 0 (all calculations should match)

-- ============================================================================
-- TEST 7: Verify Individual Transaction Details
-- ============================================================================

SELECT 
  'TEST 7: Transaction Details' as test_name,
  transaction_date,
  merchant,
  amount_raw,
  amount_spending,
  amount_convention,
  is_credit,
  is_payment
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND source_filename = :'test_filename'
ORDER BY transaction_date;

-- Expected Results:
-- 2025-01-15 | AMZN MKTP US*1234 | -45.99 | 45.99 | negative | false | false
-- 2025-01-16 | STARBUCKS STORE 1234 | -5.50 | 5.50 | negative | false | false
-- 2025-01-17 | REFUND AMAZON | 25.00 | 0.00 | negative | true | false
-- 2025-01-18 | AUTOMATIC PAYMENT THANK YOU | -500.00 | 0.00 | negative | false | true
-- 2025-01-19 | WHOLE FOODS MARKET | -89.32 | 89.32 | negative | false | false

-- ============================================================================
-- TEST 8: Duplicate Detection Check
-- ============================================================================

-- Get the file hash from the uploaded file
SELECT 
  'TEST 8: Duplicate Check' as test_name,
  source_file_hash,
  COUNT(*) as transaction_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND source_filename = :'test_filename'
GROUP BY source_file_hash;

-- Use this hash to check for duplicates:
-- SELECT EXISTS (
--   SELECT 1 FROM transactions_v2
--   WHERE user_id = :'test_user_id'
--     AND source_file_hash = '<hash-from-above>'
-- ) as already_uploaded;

-- Expected: already_uploaded = true after first upload

-- ============================================================================
-- TEST 9: File Summary
-- ============================================================================

SELECT 
  'TEST 9: File Summary' as test_name,
  source_filename,
  uploaded_at,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending,
  COUNT(*) FILTER (WHERE is_credit) as credit_count,
  COUNT(*) FILTER (WHERE is_payment) as payment_count
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND source_filename = :'test_filename'
GROUP BY source_filename, uploaded_at;

-- Expected Result:
-- test_transactions.csv | <timestamp> | 5 | 140.81 | 1 | 1

-- ============================================================================
-- TEST 10: Merchant Aggregation
-- ============================================================================

SELECT 
  'TEST 10: Merchant Totals' as test_name,
  merchant,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spent
FROM transactions_v2
WHERE user_id = :'test_user_id'
  AND amount_spending > 0
GROUP BY merchant
ORDER BY total_spent DESC;

-- Expected Results:
-- AMZN MKTP US*1234 | 1 | 45.99
-- WHOLE FOODS MARKET | 1 | 89.32
-- STARBUCKS STORE 1234 | 1 | 5.50

-- ============================================================================
-- SUMMARY: All Tests Should Pass
-- ============================================================================

-- Run all tests and verify:
-- ✓ TEST 1: Total = $140.81, Count = 3
-- ✓ TEST 2: Total rows = 5, Spending = 3, Credits = 1, Payments = 1
-- ✓ TEST 3: Violations = 0
-- ✓ TEST 4: Empty merchants = 0
-- ✓ TEST 5: Negative spending = 0
-- ✓ TEST 6: Calculation mismatches = 0
-- ✓ TEST 7: All transaction details correct
-- ✓ TEST 8: Duplicate detection works
-- ✓ TEST 9: File summary matches expected
-- ✓ TEST 10: Merchant aggregation correct

