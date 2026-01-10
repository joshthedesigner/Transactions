# Database Setup - IMPORTANT!

## ⚠️ You need to run the database migration before the app will work!

The app requires database tables to be created in Supabase. Follow these steps:

## Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/fdpedjtzukhnfnaxttxh
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New Query"**

## Step 2: Copy the Migration SQL

1. Open the file: `supabase/migrations/001_initial_schema.sql` in this project
2. Copy **ALL** the contents (it's about 100+ lines)
3. Paste it into the Supabase SQL Editor

## Step 3: Run the Migration

1. Click the **"Run"** button (or press Cmd+Enter / Ctrl+Enter)
2. You should see "Success. No rows returned" or similar success message

## What This Creates

The migration creates:
- ✅ `categories` table (with 11 fixed categories)
- ✅ `transactions` table (for storing your transactions)
- ✅ `source_files` table (to track uploaded files)
- ✅ `merchant_rules` table (for the learning system)
- ✅ Row Level Security (RLS) policies (so users only see their own data)
- ✅ Indexes for performance

## Verify It Worked

After running the migration, you should see these tables in Supabase:
1. Go to **"Table Editor"** in Supabase dashboard
2. You should see: `categories`, `transactions`, `source_files`, `merchant_rules`

## If You See Errors

Common issues:
- **"relation already exists"** - Tables already exist, that's okay
- **"permission denied"** - Make sure you're using the correct Supabase project
- **"syntax error"** - Make sure you copied the entire SQL file

## Next Steps

Once the migration is complete:
1. Refresh your app
2. Try uploading your CSV file again
3. The app should now work!




