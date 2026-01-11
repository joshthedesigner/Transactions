-- ============================================================================
-- Migration: Add secondary_category to transactions_v2
-- Purpose: Support custom secondary tags for transactions
-- Date: 2026-01-XX
-- ============================================================================

-- Add secondary_category column
ALTER TABLE transactions_v2
ADD COLUMN IF NOT EXISTS secondary_category TEXT;

-- Add index for filtering by secondary category
CREATE INDEX IF NOT EXISTS idx_transactions_v2_secondary_category
  ON transactions_v2(user_id, secondary_category)
  WHERE secondary_category IS NOT NULL;

-- Add comment
COMMENT ON COLUMN transactions_v2.secondary_category IS 'Optional secondary tag/category for additional transaction classification';
