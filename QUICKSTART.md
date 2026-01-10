# Quick Start Guide

## Step 1: Install Dependencies

Run this command in your terminal:

```bash
npm install
```

This will install all required packages including Next.js, React, Supabase, OpenAI, and charting libraries.

## Step 2: Create Environment Variables

Create a file named `.env.local` in the root directory (`/Users/joshgold/Desktop/Transactionapp/.env.local`) with the following content:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### How to get these values:

**Supabase:**
1. Go to [supabase.com](https://supabase.com) and create a project (or use existing)
2. Go to Project Settings → API
3. Copy the "Project URL" → Use as `NEXT_PUBLIC_SUPABASE_URL`
4. Copy the "anon public" key → Use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**OpenAI:**
1. Go to [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys section
3. Create a new API key → Use as `OPENAI_API_KEY`

## Step 3: Set Up Database

1. In your Supabase dashboard, go to the **SQL Editor**
2. Click **New Query**
3. Open the file `supabase/migrations/001_initial_schema.sql` from this project
4. Copy ALL the contents of that file
5. Paste it into the Supabase SQL Editor
6. Click **Run** (or press Cmd+Enter / Ctrl+Enter)

This will create all necessary tables, categories, and security policies.

## Step 4: Start Development Server

Run this command:

```bash
npm run dev
```

You should see output like:
```
✓ Ready in 2.3s
○ Local:        http://localhost:3000
```

## Step 5: Open in Browser

Navigate to: **http://localhost:3000**

## Step 6: Create Account & Test

1. You'll be redirected to the login page
2. Click "Don't have an account? Sign up"
3. Enter your email and create a password
4. Check your email for confirmation link (if email confirmation is enabled)
5. Sign in and start uploading CSV files!

## Testing with Sample CSV

Create a test CSV file (`test.csv`) with these columns:

```csv
Date,Description,Amount
2024-01-15,Amazon Purchase,-29.99
2024-01-16,Starbucks,-5.50
2024-01-17,Grocery Store,-85.23
2024-01-18,Netflix Subscription,-15.99
```

Save it and upload via the "Upload" tab in the app.

## Common Issues & Solutions

### Issue: "OpenAI API key not configured"
- Make sure `.env.local` exists and has `OPENAI_API_KEY` set
- Restart the dev server after creating `.env.local`

### Issue: "Not authenticated" errors
- Check that Supabase environment variables are set correctly
- Verify you ran the database migration
- Check Supabase project is active (not paused)

### Issue: Cannot connect to Supabase
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the "anon public" key (not service role)
- Ensure your Supabase project is not paused

### Issue: CSV upload fails
- Ensure CSV has Date, Description/Merchant, and Amount columns
- Column names should match common patterns (see SETUP.md)
- Check browser console for specific error messages

## Next Steps After Setup

1. ✅ Upload a test CSV file
2. ✅ Check the Review Queue for transactions needing review
3. ✅ Accept or change categories for transactions
4. ✅ View Analytics to see your spending patterns
5. ✅ Test the learning system by correcting categories and uploading again

## Need Help?

- Check `SETUP.md` for detailed documentation
- Check `README.md` for project overview
- Review error messages in browser console (F12) and terminal




