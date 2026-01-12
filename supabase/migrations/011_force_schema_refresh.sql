-- Force PostgREST to refresh its schema cache
-- This should make the RPC function visible to the API
NOTIFY pgrst, 'reload schema';

-- Also verify the function is accessible
SELECT 
  routine_name,
  routine_schema,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'get_category_mappings'
  AND routine_schema = 'public';

