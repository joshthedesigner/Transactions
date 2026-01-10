# Migration 002: Add Amount Sign Convention

## Quick Fix for Current Error

You're seeing this error because the database needs to be updated with the new `amount_sign_convention` column.

## Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/fdpedjtzukhnfnaxttxh
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New Query"**

## Step 2: Copy and Run the Migration

Copy this SQL and paste it into the SQL Editor:

```sql
-- Add amount_sign_convention column to source_files table
-- This tracks how each file represents spending:
-- 'negative' = spending is negative (e.g., Chase credit cards)
-- 'positive' = spending is positive (e.g., debit cards, activity.csv)
ALTER TABLE source_files 
ADD COLUMN IF NOT EXISTS amount_sign_convention TEXT 
CHECK (amount_sign_convention IN ('negative', 'positive'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_source_files_convention ON source_files(amount_sign_convention);
```

## Step 3: Run It

1. Click the **"Run"** button (or press Cmd+Enter / Ctrl+Enter)
2. You should see "Success. No rows returned" or similar success message

## What This Does

- Adds `amount_sign_convention` column to track how each file represents spending
- Allows the app to correctly calculate totals for different bank formats
- Fixes the calculation discrepancies you were experiencing

## After Running

1. Refresh your app
2. The error should be gone
3. For best results, re-upload your CSV files so the convention is detected and stored

## Alternative: Run from File

You can also copy the entire contents of `supabase/migrations/002_add_amount_convention.sql` and run it.




