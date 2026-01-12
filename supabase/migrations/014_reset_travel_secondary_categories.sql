-- ============================================================================
-- Migration: Reset Travel secondary categories
-- Purpose: Wipe all secondary_category values for Travel transactions to fix data corruption
-- Date: 2026-01-10
-- ============================================================================

-- This migration resets all secondary_category values to NULL for Travel transactions
-- This is safe because:
-- 1. It only affects Travel transactions (category = 'Travel')
-- 2. It only sets secondary_category to NULL (doesn't delete transactions)
-- 3. Users can re-categorize Travel transactions after this

-- Reset all Travel transactions' secondary_category to NULL
UPDATE transactions_v2
SET secondary_category = NULL
WHERE category = 'Travel'
  AND secondary_category IS NOT NULL;

-- Clean up Travel entries from secondary_category_mappings
-- This removes the mappings, but they'll be recreated when users add new secondary categories
DELETE FROM secondary_category_mappings
WHERE primary_category = 'Travel';

-- Add comment
COMMENT ON FUNCTION filter_transactions_by_categories IS 
  'Filters transactions by categorySecondaryMap with proper OR logic. Handles complex AND conditions within OR clauses that Supabase PostgREST .or() cannot handle.';

