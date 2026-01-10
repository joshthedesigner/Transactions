# Transaction Tracker

A production-ready personal expense tracking web application built with Next.js, Supabase, and OpenAI.

## Features

- **CSV/Excel Upload**: Support for CSV and multi-sheet Excel files
- **Intelligent Categorization**: AI-powered transaction categorization with confidence scores
- **Review Queue**: Manual review for low-confidence categorizations
- **Learning System**: Manual corrections train future categorizations
- **Analytics Dashboard**: Visual charts for spending analysis
- **User Authentication**: Secure authentication with Supabase Auth

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js Server Actions
- **Database**: Supabase Postgres
- **Auth**: Supabase Auth
- **AI**: OpenAI API (GPT-4o-mini)
- **Charts**: Recharts

## Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

3. Set up Supabase database:

Run the migration file at `supabase/migrations/001_initial_schema.sql` in your Supabase SQL editor to create all necessary tables and policies.

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The application uses four main tables:

- **categories**: Fixed list of expense categories
- **transactions**: Transaction records with categorization
- **source_files**: Track uploaded files
- **merchant_rules**: Learning system for merchant categorization

## Categorization Pipeline

1. **CSV Parsing**: Parse CSV/Excel files with multi-sheet support
2. **Normalization**: Normalize merchant names and detect columns
3. **Rule-Based**: Check merchant_rules for exact/partial matches
4. **AI Categorization**: Use OpenAI for probability-based categorization
5. **Confidence Calculation**: Calculate confidence score from max probability
6. **Routing**: Auto-approve (≥0.75) or route to review queue (<0.75)

## Categories

Fixed categories include:
- Housing
- Utilities
- Groceries
- Dining
- Transportation
- Travel
- Shopping
- Health
- Entertainment
- Subscriptions
- Misc

## Deployment

The app is ready for deployment on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables
4. Deploy

Make sure to run the database migrations in Supabase before deploying.




