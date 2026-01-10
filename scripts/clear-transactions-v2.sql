-- Clear all transactions from transactions_v2 table
-- Run this in Supabase SQL Editor

-- Step 1: Get your user ID (copy the id value)
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- Step 2: Replace 'YOUR_USER_ID_HERE' with your actual user ID from Step 1, then run:
DELETE FROM transactions_v2 WHERE user_id = 'YOUR_USER_ID_HERE';

-- Step 3: Verify deletion
SELECT COUNT(*) as remaining_count FROM transactions_v2 WHERE user_id = 'YOUR_USER_ID_HERE';
-- Should return 0

