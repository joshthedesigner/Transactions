#!/bin/bash
# Test script to verify environment variables are loaded correctly

echo "Testing Environment Variables..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ .env.local file not found!"
  exit 1
fi

echo "✅ .env.local file exists"
echo ""

# Check each required variable
check_var() {
  local var_name=$1
  local value=$(grep "^${var_name}=" .env.local | cut -d '=' -f2- | tr -d '\r' | head -1)
  
  if [ -z "$value" ] || [ "$value" = "your_supabase_api_key_here" ] || [ "$value" = "your_supabase_key_here" ] || [ "$value" = "your_supabase_project_url_here" ] || [ "$value" = "your_openai_api_key_here" ]; then
    echo "❌ ${var_name}: NOT SET or using placeholder"
    return 1
  else
    if [ ${#value} -gt 50 ]; then
      echo "✅ ${var_name}: SET (${#value} chars) - ${value:0:30}..."
    else
      echo "✅ ${var_name}: SET"
    fi
    return 0
  fi
}

# Check required variables
errors=0
check_var "NEXT_PUBLIC_SUPABASE_URL" || errors=$((errors + 1))
check_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" || errors=$((errors + 1))
check_var "OPENAI_API_KEY" || errors=$((errors + 1))

echo ""

if [ $errors -eq 0 ]; then
  echo "✅ All required environment variables are properly set!"
  echo ""
  echo "You can now run: npm run dev"
  exit 0
else
  echo "❌ Found $errors missing or placeholder environment variable(s)"
  echo ""
  echo "To fix:"
  echo "1. Open .env.local"
  echo "2. Replace placeholders with actual values"
  echo "3. For Supabase key: Go to https://supabase.com/dashboard/project/fdpedjtzukhnfnaxttxh/settings/api"
  echo "   - Copy the 'anon public' key (or use service_role if needed)"
  exit 1
fi




