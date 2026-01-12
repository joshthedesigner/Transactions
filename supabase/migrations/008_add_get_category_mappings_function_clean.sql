-- Migration: Add PostgreSQL function to fetch category mappings
-- Purpose: Bypass PostgREST schema cache by using RPC function

-- Create a function that returns category mappings
-- Uses SECURITY INVOKER (safer than SECURITY DEFINER) - runs with caller's privileges
-- RLS policies on the table will still enforce user isolation
CREATE OR REPLACE FUNCTION get_category_mappings()
RETURNS TABLE (
  primary_category TEXT,
  secondary_category TEXT
) 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.primary_category,
    m.secondary_category
  FROM secondary_category_mappings m
  WHERE m.user_id = auth.uid()
  ORDER BY m.primary_category, m.secondary_category;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_category_mappings() TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_category_mappings() IS 
'Returns all secondary category mappings for the current user. Bypasses PostgREST schema cache. Uses SECURITY INVOKER for safety.';

-- Auto-refresh schema cache on DDL changes (prevents future issues)
CREATE OR REPLACE FUNCTION pgrst_watch()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Create event trigger (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger WHERE evtname = 'pgrst_watch'
  ) THEN
    CREATE EVENT TRIGGER pgrst_watch
      ON ddl_command_end
      EXECUTE FUNCTION pgrst_watch();
  END IF;
END $$;

-- Add comment
COMMENT ON FUNCTION pgrst_watch() IS 
'Automatically refreshes PostgREST schema cache when database schema changes (CREATE TABLE, ALTER TABLE, etc.). Prevents schema cache staleness issues.';

