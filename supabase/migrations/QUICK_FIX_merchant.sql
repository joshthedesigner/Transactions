-- ============================================================================
-- QUICK FIX: Add merchant column to existing transactions_v2 table
-- Run this if you're getting "column merchant does not exist" error
-- ============================================================================

-- Step 1: Add merchant column
ALTER TABLE transactions_v2 
  ADD COLUMN IF NOT EXISTS merchant TEXT;

-- Step 2: Migrate data from old columns (if they exist)
UPDATE transactions_v2 
SET merchant = COALESCE(merchant_normalized, merchant_raw, 'Unknown')
WHERE merchant IS NULL;

-- Step 3: Make NOT NULL
ALTER TABLE transactions_v2 
  ALTER COLUMN merchant SET NOT NULL;

-- Step 4: Drop old index
DROP INDEX IF EXISTS idx_transactions_v2_user_merchant;

-- Step 5: Create new index
CREATE INDEX idx_transactions_v2_user_merchant 
  ON transactions_v2(user_id, merchant);

-- Step 6: Drop old constraint
ALTER TABLE transactions_v2 
  DROP CONSTRAINT IF EXISTS chk_merchant_not_empty;

-- Step 7: Add new constraint
ALTER TABLE transactions_v2 
  ADD CONSTRAINT chk_merchant_not_empty 
  CHECK (LENGTH(TRIM(merchant)) > 0);

-- Step 8: Drop old columns (optional - comment out if you want to keep them temporarily)
ALTER TABLE transactions_v2 
  DROP COLUMN IF EXISTS merchant_raw,
  DROP COLUMN IF EXISTS merchant_normalized;

-- Verify
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'transactions_v2' 
  AND column_name LIKE 'merchant%'
ORDER BY column_name;

