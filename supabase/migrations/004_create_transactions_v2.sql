-- ============================================================================
-- Migration: Create transactions_v2 table (self-contained financial data)
-- Purpose: Store transactions with pre-calculated amounts for 100% accuracy
-- Date: 2026-01-10
-- ============================================================================

-- Create transactions_v2 table
-- This table is SELF-CONTAINED - no joins required for financial calculations
CREATE TABLE IF NOT EXISTS transactions_v2 (
  -- Primary key
  id BIGSERIAL PRIMARY KEY,
  
  -- User ownership (required for RLS)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- ========================================================================
  -- SOURCE FILE METADATA (stored per transaction, not in separate table)
  -- ========================================================================
  source_filename TEXT NOT NULL,
  -- Why: Denormalized to avoid joins. Each transaction knows its source.
  
  source_file_hash TEXT NOT NULL,
  -- Why: Detect duplicate uploads. Hash of (filename + user_id + upload_timestamp).
  -- Prevents uploading the same file twice.
  
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Why: Track when this batch was uploaded. Same for all rows from one upload.
  
  -- ========================================================================
  -- TRANSACTION DATA (from CSV)
  -- ========================================================================
  transaction_date DATE NOT NULL,
  -- Why: When the actual transaction occurred (not when uploaded)
  
  merchant TEXT NOT NULL,
  -- Why: Canonical merchant name for display/grouping.
  -- Raw CSV merchant data can optionally be stored in notes field if needed.
  
  -- ========================================================================
  -- AMOUNT HANDLING (CRITICAL - stores BOTH raw and calculated)
  -- ========================================================================
  amount_raw NUMERIC(12,2) NOT NULL,
  -- Why: Exact value from CSV, sign preserved. Needed for audit/debugging.
  -- Example: -50.00 (Chase) or 50.00 (Amex)
  
  amount_spending NUMERIC(12,2) NOT NULL CHECK (amount_spending >= 0),
  -- Why: PRE-CALCULATED spending amount. ALWAYS non-negative.
  -- This is THE SOURCE OF TRUTH for financial totals.
  -- Calculated ONCE at upload, never recalculated.
  -- Example: Both -50.00 (Chase) and 50.00 (Amex) → 50.00
  
  amount_convention TEXT NOT NULL CHECK (amount_convention IN ('positive', 'negative')),
  -- Why: Documents which sign convention this file used.
  -- 'negative' = negative means spending (Chase)
  -- 'positive' = positive means spending (Amex)
  -- Stored per transaction to eliminate ambiguity.
  
  is_credit BOOLEAN NOT NULL DEFAULT false,
  -- Why: Explicitly flags refunds/credits (not spending).
  -- True when amount represents money COMING IN (not going out).
  -- Credits have amount_spending = 0 and are excluded from totals.
  
  is_payment BOOLEAN NOT NULL DEFAULT false,
  -- Why: Explicitly flags payments (credit card payments, transfers).
  -- Payments have amount_spending = 0 and are excluded from totals.
  
  -- ========================================================================
  -- OPTIONAL METADATA
  -- ========================================================================
  category TEXT,
  -- Why: Optional categorization. NULL = uncategorized.
  -- No foreign key - just a string for simplicity.
  
  notes TEXT,
  -- Why: User notes/tags. Optional.
  
  -- ========================================================================
  -- SYSTEM METADATA
  -- ========================================================================
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES (for performance)
-- ============================================================================

-- Primary query index: Get all spending for a user
CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_spending 
  ON transactions_v2(user_id, amount_spending) 
  WHERE amount_spending > 0;
-- Why: Dashboard query: SELECT SUM(amount_spending) WHERE user_id = X
-- Partial index (WHERE clause) makes it smaller and faster

-- Date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_date 
  ON transactions_v2(user_id, transaction_date DESC);
-- Why: Recent transactions, date filters

-- Merchant aggregation
CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_merchant 
  ON transactions_v2(user_id, merchant);
-- Why: Group by merchant, search by merchant

-- Duplicate detection
CREATE INDEX IF NOT EXISTS idx_transactions_v2_file_hash 
  ON transactions_v2(user_id, source_file_hash);
-- Why: Fast lookup to check if file already uploaded

-- Source file queries
CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_source 
  ON transactions_v2(user_id, source_filename);
-- Why: List files, filter by file

-- ============================================================================
-- CONSTRAINTS (data integrity)
-- ============================================================================

-- Constraint: amount_spending must match is_credit/is_payment flags
ALTER TABLE transactions_v2 
  DROP CONSTRAINT IF EXISTS chk_spending_flags;
ALTER TABLE transactions_v2 
  ADD CONSTRAINT chk_spending_flags 
  CHECK (
    (amount_spending > 0 AND is_credit = false AND is_payment = false) OR
    (amount_spending = 0 AND (is_credit = true OR is_payment = true))
  );
-- Why: If amount_spending > 0, it must not be a credit or payment
--      If amount_spending = 0, it must be flagged as credit or payment
--      This prevents data inconsistency

-- Constraint: merchant cannot be empty
ALTER TABLE transactions_v2 
  DROP CONSTRAINT IF EXISTS chk_merchant_not_empty;
ALTER TABLE transactions_v2 
  ADD CONSTRAINT chk_merchant_not_empty 
  CHECK (LENGTH(TRIM(merchant)) > 0);
-- Why: Every transaction must have a merchant

-- Constraint: date cannot be in far future (sanity check)
ALTER TABLE transactions_v2 
  DROP CONSTRAINT IF EXISTS chk_date_reasonable;
ALTER TABLE transactions_v2 
  ADD CONSTRAINT chk_date_reasonable 
  CHECK (transaction_date <= CURRENT_DATE + INTERVAL '30 days');
-- Why: Prevent data entry errors (e.g., year 2099)

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE transactions_v2 ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own transactions
DROP POLICY IF EXISTS "Users can view their own transactions_v2" ON transactions_v2;
CREATE POLICY "Users can view their own transactions_v2"
  ON transactions_v2 FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own transactions
DROP POLICY IF EXISTS "Users can insert their own transactions_v2" ON transactions_v2;
CREATE POLICY "Users can insert their own transactions_v2"
  ON transactions_v2 FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own transactions
DROP POLICY IF EXISTS "Users can update their own transactions_v2" ON transactions_v2;
CREATE POLICY "Users can update their own transactions_v2"
  ON transactions_v2 FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own transactions
DROP POLICY IF EXISTS "Users can delete their own transactions_v2" ON transactions_v2;
CREATE POLICY "Users can delete their own transactions_v2"
  ON transactions_v2 FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS (automatic updates)
-- ============================================================================

-- Trigger: Update updated_at on row change
CREATE OR REPLACE FUNCTION update_transactions_v2_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_v2_updated_at
  BEFORE UPDATE ON transactions_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_transactions_v2_timestamp();
-- Why: Automatically track when records are modified

-- ============================================================================
-- HELPER VIEWS (optional but useful)
-- ============================================================================

-- View: Summary by source file
CREATE OR REPLACE VIEW transactions_v2_summary_by_file AS
SELECT 
  user_id,
  source_filename,
  source_file_hash,
  uploaded_at,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending,
  COUNT(*) FILTER (WHERE is_credit) as credit_count,
  COUNT(*) FILTER (WHERE is_payment) as payment_count
FROM transactions_v2
GROUP BY user_id, source_filename, source_file_hash, uploaded_at;
-- Why: Quick file-level stats without aggregating in application code

-- View: User totals (the critical query)
CREATE OR REPLACE VIEW transactions_v2_user_totals AS
SELECT 
  user_id,
  COUNT(*) as total_transactions,
  SUM(amount_spending) as total_spending,
  COUNT(DISTINCT source_filename) as file_count,
  MIN(transaction_date) as earliest_transaction,
  MAX(transaction_date) as latest_transaction
FROM transactions_v2
GROUP BY user_id;
-- Why: Dashboard summary - this is THE query that must always be correct

-- ============================================================================
-- COMMENTS (documentation)
-- ============================================================================

COMMENT ON TABLE transactions_v2 IS 
'Self-contained transaction storage with pre-calculated spending amounts. 
No joins required for financial calculations. Financial correctness over flexibility.';

COMMENT ON COLUMN transactions_v2.amount_raw IS 
'Original amount from CSV with sign preserved. For audit only.';

COMMENT ON COLUMN transactions_v2.amount_spending IS 
'PRE-CALCULATED spending amount (always >= 0). THE source of truth for totals.
Calculated once at upload using convention, never recalculated.';

COMMENT ON COLUMN transactions_v2.amount_convention IS 
'Sign convention of source file: negative (Chase) or positive (Amex).
Stored per transaction to eliminate ambiguity.';

COMMENT ON COLUMN transactions_v2.is_credit IS 
'True if transaction is a refund/credit (money coming in). Excluded from spending totals.';

COMMENT ON COLUMN transactions_v2.is_payment IS 
'True if transaction is a payment (credit card payment, transfer). Excluded from spending totals.';

COMMENT ON COLUMN transactions_v2.source_file_hash IS 
'Hash for duplicate detection. Format: SHA256(filename + user_id + upload_timestamp).';

COMMENT ON COLUMN transactions_v2.merchant IS 
'Canonical merchant name for display and grouping. Single field design - no raw/normalized split.
If raw CSV merchant data needs to be preserved, store it in the notes field.';

-- ============================================================================
-- USAGE EXAMPLES (for reference)
-- ============================================================================

/*
-- Example INSERT: Insert a transaction from CSV row
-- CSV row: date='2025-01-15', merchant='AMZN MKTP US*1234', amount='-45.99'
-- Convention: 'negative' (Chase file)
INSERT INTO transactions_v2 (
  user_id,
  source_filename,
  source_file_hash,
  uploaded_at,
  transaction_date,
  merchant,
  amount_raw,
  amount_spending,
  amount_convention,
  is_credit,
  is_payment,
  notes
) VALUES (
  'user-uuid-here',
  'Chase2861_Activity.csv',
  'abc123def456...',  -- Generated hash
  NOW(),
  '2025-01-15',
  'AMZN MKTP US*1234',  -- Single merchant field (normalized if needed)
  -45.99,              -- Raw amount from CSV
  45.99,               -- Pre-calculated spending (abs of negative)
  'negative',          -- Convention used
  false,               -- Not a credit
  false,               -- Not a payment
  NULL                 -- Optional: store raw merchant here if different from merchant
);

-- Example 1: Get user's total spending (THE critical query)
SELECT SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'user-uuid-here'
  AND amount_spending > 0;  -- Excludes credits/payments automatically

-- Example 2: Check if file already uploaded
SELECT EXISTS (
  SELECT 1 FROM transactions_v2
  WHERE user_id = 'user-uuid-here'
    AND source_file_hash = 'hash-here'
) as already_uploaded;

-- Example 3: Get transactions by date range
SELECT transaction_date, merchant, amount_spending
FROM transactions_v2
WHERE user_id = 'user-uuid-here'
  AND transaction_date BETWEEN '2025-01-01' AND '2025-12-31'
  AND amount_spending > 0
ORDER BY transaction_date DESC;

-- Example 4: Aggregate by merchant
SELECT 
  merchant,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spent
FROM transactions_v2
WHERE user_id = 'user-uuid-here'
  AND amount_spending > 0
GROUP BY merchant
ORDER BY total_spent DESC
LIMIT 10;

-- Example 5: List uploaded files
SELECT DISTINCT
  source_filename,
  uploaded_at,
  COUNT(*) as transaction_count,
  SUM(amount_spending) as file_total
FROM transactions_v2
WHERE user_id = 'user-uuid-here'
GROUP BY source_filename, uploaded_at
ORDER BY uploaded_at DESC;
*/

-- ============================================================================
-- ALTER STATEMENTS (for existing tables with old schema)
-- ============================================================================

-- If transactions_v2 already exists with merchant_raw/merchant_normalized, run these:

-- Step 1: Add new merchant column (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions_v2' AND column_name = 'merchant'
  ) THEN
    -- Add merchant column, populate from merchant_normalized (or merchant_raw as fallback)
    ALTER TABLE transactions_v2 
      ADD COLUMN merchant TEXT;
    
    -- Migrate data: prefer normalized, fallback to raw
    UPDATE transactions_v2 
    SET merchant = COALESCE(merchant_normalized, merchant_raw, 'Unknown')
    WHERE merchant IS NULL;
    
    -- Make NOT NULL after data migration
    ALTER TABLE transactions_v2 
      ALTER COLUMN merchant SET NOT NULL;
  END IF;
END $$;

-- Step 2: Drop old merchant columns (if they exist)
DO $$
BEGIN
  -- Drop index that references merchant_normalized
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'transactions_v2' AND indexname = 'idx_transactions_v2_user_merchant'
  ) THEN
    DROP INDEX IF EXISTS idx_transactions_v2_user_merchant;
  END IF;
  
  -- Recreate index with new merchant column
  CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_merchant 
    ON transactions_v2(user_id, merchant);
  
  -- Drop old constraint if it exists
  ALTER TABLE transactions_v2 
    DROP CONSTRAINT IF EXISTS chk_merchant_not_empty;
  
  -- Add new constraint with merchant field
  ALTER TABLE transactions_v2 
    ADD CONSTRAINT chk_merchant_not_empty 
    CHECK (LENGTH(TRIM(merchant)) > 0);
  
  -- Drop old columns
  ALTER TABLE transactions_v2 
    DROP COLUMN IF EXISTS merchant_raw,
    DROP COLUMN IF EXISTS merchant_normalized;
END $$;

-- ============================================================================
-- VALIDATION QUERY (run after migration)
-- ============================================================================

/*
-- This query should return your expected totals after upload:
-- Expected: 1516 transactions, $91,180.01

SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending,
  COUNT(DISTINCT source_filename) as file_count
FROM transactions_v2
WHERE user_id = 'your-user-id';
*/

