-- ============================================================================
-- Migration: Add RPC function for filtering transactions by category map
-- Purpose: Handle complex OR conditions with multiple AND clauses
-- Date: 2026-01-10
-- ============================================================================

-- Function to filter transactions by categorySecondaryMap
-- This solves Supabase's .or() limitation with complex AND conditions
CREATE OR REPLACE FUNCTION filter_transactions_by_categories(
  p_user_id UUID,
  p_category_map JSONB,
  p_only_spending BOOLEAN DEFAULT true,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS SETOF transactions_v2
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return query with all filters using proper SQL boolean logic
  RETURN QUERY
  SELECT t.* FROM transactions_v2 t
  WHERE t.user_id = p_user_id
    AND (p_only_spending = false OR t.amount_spending > 0)
    AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
    AND (
      -- Category filter: build OR conditions dynamically
      CASE 
        WHEN p_category_map IS NOT NULL AND jsonb_typeof(p_category_map) = 'object' THEN
          -- Check if transaction matches any (category, secondary) combination
          EXISTS (
            SELECT 1 FROM jsonb_each(p_category_map) AS cat_entry(primary_cat, secondaries)
            WHERE t.category = cat_entry.primary_cat::text
              AND (
                -- Match specific secondaries
                EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(cat_entry.secondaries) AS sec
                  WHERE sec::text != '__OTHER__' 
                    AND t.secondary_category = sec::text
                )
                OR
                -- Match "Other" (null secondary)
                (
                  t.secondary_category IS NULL
                  AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(cat_entry.secondaries) AS sec
                    WHERE sec::text = '__OTHER__'
                  )
                )
              )
          )
        ELSE
          true  -- No category filter, return all
      END
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION filter_transactions_by_categories(UUID, JSONB, BOOLEAN, DATE, DATE) TO authenticated;

-- Add comment
COMMENT ON FUNCTION filter_transactions_by_categories IS 
  'Filters transactions by categorySecondaryMap with proper OR logic. Handles complex AND conditions within OR clauses that Supabase PostgREST .or() cannot handle.';
