-- Check if PostgREST can see the function
-- PostgREST exposes functions in the public schema that return tables or sets

-- Verify function signature matches PostgREST requirements
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.provolatile as volatility,
  p.prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_category_mappings'
  AND n.nspname = 'public';

-- Check if function is in the API schema that PostgREST uses
-- PostgREST typically looks in the 'public' schema by default
SELECT 
  routine_schema,
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_name = 'get_category_mappings'
  AND routine_schema = 'public';

