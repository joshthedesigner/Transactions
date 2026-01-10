-- Clear all transactions from transactions_v2 table
-- Run this in Supabase SQL Editor

-- Step 1: Get your user ID (copy the id value from the result)
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- Step 2: Copy the id value from above, then run this DELETE statement
-- Replace 'dc57ef36-a07c-44dc-a57a-989b847ccbbc' with YOUR actual user ID from Step 1
DELETE FROM transactions_v2 WHERE user_id = 'dc57ef36-a07c-44dc-a57a-989b847ccbbc';

-- Step 3: Verify deletion (use your actual user ID here too)
SELECT COUNT(*) as remaining_count FROM transactions_v2 WHERE user_id = 'dc57ef36-a07c-44dc-a57a-989b847ccbbc';
-- Should return 0

-- OR: Delete all transactions (if you only have one user)
-- DELETE FROM transactions_v2;

