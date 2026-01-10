-- Check what happened to the payment row
-- Run this to see all transactions from the test file

SELECT 
  transaction_date,
  merchant,
  amount_raw,
  amount_spending,
  is_credit,
  is_payment,
  source_filename
FROM transactions_v2
WHERE user_id = 'dc57ef36-a07c-44dc-a57a-989b847ccbbc'
  AND source_filename = 'test_transactions.csv'
ORDER BY transaction_date;

-- Expected to see 5 rows:
-- 1. AMZN MKTP US*1234 | -45.99 | 45.99 | false | false
-- 2. STARBUCKS STORE 1234 | -5.50 | 5.50 | false | false
-- 3. REFUND AMAZON | 25.00 | 0.00 | true | false
-- 4. AUTOMATIC PAYMENT THANK YOU | -500.00 | 0.00 | false | true  <-- This one might be missing
-- 5. WHOLE FOODS MARKET | -89.32 | 89.32 | false | false

