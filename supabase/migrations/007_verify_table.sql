-- ============================================================================
-- Verification Query: Check if secondary_category_mappings table exists
-- Run this in Supabase SQL Editor to verify the migration worked
-- ============================================================================

-- Check if table exists
SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_name = 'secondary_category_mappings';

-- Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'secondary_category_mappings'
ORDER BY ordinal_position;

-- Check indexes
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'secondary_category_mappings';

-- Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'secondary_category_mappings';

-- Count existing mappings (if any)
SELECT COUNT(*) as mapping_count
FROM secondary_category_mappings;

