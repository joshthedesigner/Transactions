-- ============================================================================
-- SQL Queries for transactions_v2 table
-- All queries work with the canonical schema (single merchant field)
-- ============================================================================

-- ============================================================================
-- CRITICAL QUERY: User Total Spending (THE test that must pass)
-- ============================================================================

-- This query MUST return the same total as the upload function
-- Expected result for your 4 CSV files: $91,180.01
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND amount_spending > 0;  -- Automatically excludes credits/payments

-- ============================================================================
-- Duplicate File Detection
-- ============================================================================

-- Check if a file has already been uploaded
SELECT EXISTS (
  SELECT 1 
  FROM transactions_v2
  WHERE user_id = 'your-user-uuid-here'
    AND source_file_hash = 'hash-from-generateFileHash-function'
) as already_uploaded;

-- Get all uploaded files with their hashes
SELECT DISTINCT
  source_filename,
  source_file_hash,
  uploaded_at,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
GROUP BY source_filename, source_file_hash, uploaded_at
ORDER BY uploaded_at DESC;

-- ============================================================================
-- Aggregate Spending by Merchant
-- ============================================================================

SELECT 
  merchant,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spent,
  AVG(amount_spending) as average_transaction
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND amount_spending > 0
GROUP BY merchant
ORDER BY total_spent DESC
LIMIT 20;

-- ============================================================================
-- Transactions by Date Range
-- ============================================================================

SELECT 
  transaction_date,
  merchant,
  amount_spending,
  amount_convention,
  is_credit,
  is_payment
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND transaction_date BETWEEN '2025-01-01' AND '2025-12-31'
  AND amount_spending > 0
ORDER BY transaction_date DESC, amount_spending DESC;

-- Monthly spending summary
SELECT 
  DATE_TRUNC('month', transaction_date) as month,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND amount_spending > 0
GROUP BY DATE_TRUNC('month', transaction_date)
ORDER BY month DESC;

-- ============================================================================
-- List Uploaded Files with Totals
-- ============================================================================

SELECT 
  source_filename,
  uploaded_at,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending,
  COUNT(*) FILTER (WHERE is_credit) as credit_count,
  COUNT(*) FILTER (WHERE is_payment) as payment_count,
  MIN(transaction_date) as earliest_date,
  MAX(transaction_date) as latest_date
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
GROUP BY source_filename, uploaded_at
ORDER BY uploaded_at DESC;

-- ============================================================================
-- Data Integrity Validation Queries
-- ============================================================================

-- Check constraint violations (should return 0 rows)
SELECT 
  id,
  amount_spending,
  is_credit,
  is_payment,
  CASE 
    WHEN amount_spending > 0 AND (is_credit OR is_payment) THEN 'VIOLATION: spending > 0 but flagged as credit/payment'
    WHEN amount_spending = 0 AND NOT is_credit AND NOT is_payment THEN 'VIOLATION: spending = 0 but not flagged'
    WHEN amount_spending < 0 THEN 'VIOLATION: negative spending'
    ELSE 'OK'
  END as constraint_status
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND (
    (amount_spending > 0 AND (is_credit OR is_payment)) OR
    (amount_spending = 0 AND NOT is_credit AND NOT is_payment) OR
    amount_spending < 0
  );

-- Check for empty merchants (should return 0 rows)
SELECT 
  id,
  merchant,
  transaction_date
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);

-- Verify amount_spending matches convention calculation
-- This is a sanity check - should all be 0 (meaning calculations match)
SELECT 
  id,
  amount_raw,
  amount_spending,
  amount_convention,
  CASE 
    WHEN amount_convention = 'negative' AND amount_raw < 0 THEN ABS(amount_raw)
    WHEN amount_convention = 'positive' AND amount_raw > 0 THEN amount_raw
    ELSE 0
  END as expected_spending,
  ABS(
    amount_spending - 
    CASE 
      WHEN amount_convention = 'negative' AND amount_raw < 0 THEN ABS(amount_raw)
      WHEN amount_convention = 'positive' AND amount_raw > 0 THEN amount_raw
      ELSE 0
    END
  ) as calculation_diff
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND ABS(
    amount_spending - 
    CASE 
      WHEN amount_convention = 'negative' AND amount_raw < 0 THEN ABS(amount_raw)
      WHEN amount_convention = 'positive' AND amount_raw > 0 THEN amount_raw
      ELSE 0
    END
  ) > 0.01;  -- Allow 1 cent tolerance for rounding

-- ============================================================================
-- Category Analysis (if categories are used)
-- ============================================================================

SELECT 
  category,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND amount_spending > 0
  AND category IS NOT NULL
GROUP BY category
ORDER BY total_spending DESC;

-- ============================================================================
-- Credits and Payments Summary
-- ============================================================================

-- Total credits received
SELECT 
  COUNT(*) as credit_count,
  SUM(ABS(amount_raw)) as total_credits
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND is_credit = true;

-- Total payments made
SELECT 
  COUNT(*) as payment_count,
  SUM(ABS(amount_raw)) as total_payments
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND is_payment = true;

-- ============================================================================
-- Recent Transactions
-- ============================================================================

SELECT 
  transaction_date,
  merchant,
  amount_spending,
  category,
  source_filename
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
  AND amount_spending > 0
ORDER BY transaction_date DESC, created_at DESC
LIMIT 50;

-- ============================================================================
-- File Upload Statistics
-- ============================================================================

-- Summary by file
SELECT 
  source_filename,
  source_file_hash,
  uploaded_at,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE amount_spending > 0) as spending_rows,
  COUNT(*) FILTER (WHERE is_credit) as credit_rows,
  COUNT(*) FILTER (WHERE is_payment) as payment_rows,
  SUM(amount_spending) as file_total_spending,
  MIN(transaction_date) as earliest_transaction,
  MAX(transaction_date) as latest_transaction
FROM transactions_v2
WHERE user_id = 'your-user-uuid-here'
GROUP BY source_filename, source_file_hash, uploaded_at
ORDER BY uploaded_at DESC;

