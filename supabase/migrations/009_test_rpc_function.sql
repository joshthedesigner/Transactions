-- Test the RPC function to see if it works
SELECT * FROM get_category_mappings();

-- Check if function exists
SELECT 
  proname as function_name,
  prosecdef as security_definer,
  proconfig as config
FROM pg_proc 
WHERE proname = 'get_category_mappings';

-- Check permissions
SELECT 
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'get_category_mappings';

