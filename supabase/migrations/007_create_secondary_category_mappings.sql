-- ============================================================================
-- Migration: Create secondary_category_mappings table
-- Purpose: Map secondary categories to primary categories (nested structure)
-- Date: 2026-01-XX
-- ============================================================================

-- Create secondary_category_mappings table
-- This table stores which secondary categories belong to which primary categories
-- Allows same secondary category name to exist under multiple primary categories
CREATE TABLE IF NOT EXISTS secondary_category_mappings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_category TEXT NOT NULL,
  secondary_category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: same user can't have duplicate primary+secondary combinations
  UNIQUE(user_id, primary_category, secondary_category)
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_secondary_category_mappings_user_primary
  ON secondary_category_mappings(user_id, primary_category);

CREATE INDEX IF NOT EXISTS idx_secondary_category_mappings_user_secondary
  ON secondary_category_mappings(user_id, secondary_category);

-- Add comment
COMMENT ON TABLE secondary_category_mappings IS 
'Maps secondary categories to primary categories. Allows same secondary category name to exist under multiple primary categories.';

-- Enable Row Level Security
ALTER TABLE secondary_category_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see/modify their own mappings
CREATE POLICY "Users can view their own secondary category mappings"
  ON secondary_category_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own secondary category mappings"
  ON secondary_category_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own secondary category mappings"
  ON secondary_category_mappings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own secondary category mappings"
  ON secondary_category_mappings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Migration: Populate mappings from existing transaction data
-- Purpose: Infer mappings from existing transactions that have both category and secondary_category
-- ============================================================================

-- Insert mappings based on existing transaction data
-- For each unique combination of (user_id, category, secondary_category) in transactions_v2,
-- create a mapping if it doesn't already exist
INSERT INTO secondary_category_mappings (user_id, primary_category, secondary_category)
SELECT DISTINCT
  t.user_id,
  t.category,
  t.secondary_category
FROM transactions_v2 t
WHERE t.category IS NOT NULL
  AND t.secondary_category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM secondary_category_mappings m
    WHERE m.user_id = t.user_id
      AND m.primary_category = t.category
      AND m.secondary_category = t.secondary_category
  )
ON CONFLICT (user_id, primary_category, secondary_category) DO NOTHING;

