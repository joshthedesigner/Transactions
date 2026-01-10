# Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in the root directory with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### 3. Set Up Supabase Database

1. Go to your Supabase project SQL Editor
2. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Run the migration to create all tables, indexes, and RLS policies

### 4. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
Transactionapp/
├── app/                    # Next.js App Router
│   ├── components/         # React components
│   │   ├── Dashboard.tsx   # Main dashboard with tabs
│   │   ├── FileUpload.tsx  # CSV/Excel upload UI
│   │   ├── ReviewQueue.tsx # Review queue UI
│   │   ├── Analytics.tsx   # Analytics dashboard with charts
│   │   └── LoginForm.tsx   # Authentication form
│   ├── auth/               # Auth callback route
│   └── login/              # Login page
├── lib/
│   ├── actions/            # Server actions
│   │   ├── upload-transactions.ts
│   │   ├── review-queue.ts
│   │   └── analytics.ts
│   ├── utils/              # Utility functions
│   │   ├── csv-parser.ts   # CSV/Excel parsing
│   │   ├── column-detector.ts
│   │   ├── normalizer.ts
│   │   └── categorization/
│   │       ├── rule-based.ts
│   │       ├── ai-categorizer.ts
│   │       └── pipeline.ts
│   ├── types/              # TypeScript types
│   ├── supabase/           # Supabase clients
│   └── constants/          # App constants
└── supabase/
    └── migrations/         # Database migrations
```

## Features Implemented

✅ **CSV/Excel Upload**
- Supports CSV and Excel files (.xlsx, .xls)
- Multi-sheet Excel support
- Automatic column detection (date, merchant, amount)
- Merchant name normalization

✅ **Categorization Pipeline**
- Rule-based categorization (exact and partial merchant matching)
- AI-powered categorization using OpenAI GPT-4o-mini
- Confidence score calculation
- Auto-approval (confidence ≥ 0.75) or review queue (< 0.75)

✅ **Review Queue**
- View all pending transactions
- Accept suggested category
- Change category
- Bulk apply category to same merchant
- Learning system persists corrections as merchant rules

✅ **Analytics Dashboard**
- Monthly spend by category (stacked bar chart)
- Total spend over time (line chart)
- Category detail trend view
- Date range and category filters

✅ **Authentication**
- Supabase Auth integration
- Sign up / Sign in
- Protected routes
- User-specific data with RLS

## Database Schema

The app uses four main tables:

1. **categories** - Fixed list of expense categories
2. **transactions** - Transaction records with categorization
3. **source_files** - Track uploaded files
4. **merchant_rules** - Learning system for merchant categorization

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

## Categorization Flow

1. **Upload** → User uploads CSV/Excel file
2. **Parse** → File is parsed and sheets are extracted
3. **Detect** → Columns are automatically detected
4. **Normalize** → Merchant names are normalized, payments filtered
5. **Rule Check** → Check merchant_rules for exact/partial matches
6. **AI Categorize** → If no rule, use OpenAI for categorization
7. **Calculate Confidence** → Max probability becomes confidence score
8. **Route** → Auto-approve or send to review queue
9. **Learn** → Manual corrections create/update merchant rules

## Next Steps (Optional Enhancements)

1. **Merchant Aliasing** - Add UI to map merchant variations (e.g., "AMZN Mktp" → "Amazon")
2. **Tune Confidence Threshold** - Adjust the 0.75 threshold based on your needs
3. **Bulk Approve UX** - Add checkbox selection for bulk operations
4. **Export Data** - Add ability to export transactions to CSV
5. **Transaction Search** - Add search and filter functionality
6. **Category Management** - Allow custom categories (currently fixed list)

## Troubleshooting

### CSV Upload Issues
- Ensure your CSV has columns for date, merchant/description, and amount
- Column names should match common patterns (see `column-detector.ts`)
- Dates should be in a recognizable format

### OpenAI API Issues
- Verify your API key is set correctly
- Check your OpenAI account has sufficient credits
- Monitor API rate limits

### Database Connection Issues
- Verify Supabase URL and anon key are correct
- Ensure RLS policies are set up correctly
- Check Supabase project is active

## Testing the App

1. **Create an Account** - Sign up with your email
2. **Upload a CSV** - Use a test CSV with transaction data
3. **Review Queue** - Check transactions that need review
4. **Accept/Change Categories** - Test the learning system
5. **View Analytics** - Explore spending patterns

## Production Deployment

1. **Vercel Deployment**
   - Push code to GitHub
   - Import project in Vercel
   - Add environment variables
   - Deploy

2. **Environment Variables in Vercel**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`

3. **Supabase Settings**
   - Update redirect URLs in Supabase Auth settings
   - Add your production domain to allowed origins

## Support

For issues or questions, refer to:
- Next.js Documentation: https://nextjs.org/docs
- Supabase Documentation: https://supabase.com/docs
- Recharts Documentation: https://recharts.org/




