-- Comprehensive diagnosis of RPC function issue

-- 1. Check if function exists and its definition
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition,
  p.prosecdef as is_security_definer,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_category_mappings'
  AND n.nspname = 'public';

-- 2. Test the function directly (this should work if you're logged in)
-- Note: This will only work if you're authenticated in Supabase
SELECT * FROM get_category_mappings();

-- 3. Check if PostgREST can see the function
-- PostgREST looks for functions in the public schema with proper permissions
SELECT 
  routine_name,
  routine_schema,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_name = 'get_category_mappings'
  AND routine_schema = 'public';

-- 4. Check current user context (important for SECURITY INVOKER)
SELECT 
  current_user,
  session_user,
  auth.uid() as current_auth_uid;

-- 5. Check if there's data to return
SELECT COUNT(*) as mapping_count
FROM secondary_category_mappings
WHERE user_id = auth.uid();

