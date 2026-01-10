# Transaction Tracker App - Complete Specification & History

## 📋 PROJECT OVERVIEW

### Purpose
A personal finance tracking application that imports transactions from CSV files (Chase, Amex, etc.), calculates spending totals, and displays analytics.

### User Profile
- **Non-technical designer**
- Needs simple, reliable transaction tracking
- Primary data sources: 4 CSV files from different credit cards
- Expected total: **$91,180.01** across **~1,516 transactions**

---

## 🎯 CORE REQUIREMENTS

### What the App Should Do

1. **Upload CSV files** from different banks/credit cards
2. **Parse transactions** automatically (detect columns, dates, amounts)
3. **Handle different amount conventions**:
   - Chase files: negative = spending, positive = credit
   - Amex files: positive = spending, negative = credit
4. **Calculate accurate spending totals** (exclude payments, refunds, credits)
5. **Display dashboard** with:
   - Total spending amount
   - Number of transactions
   - Number of files uploaded
   - Recent transactions list
   - Recent files list

### Critical Success Criteria

✅ **Upload flow shows**: $91,180.01 from 1,516 transactions  
✅ **Dashboard shows**: Same $91,180.01 from 1,516 transactions  
✅ **All 4 files visible** in dashboard file list  
✅ **No missing transactions**

---

## 🏗️ CURRENT ARCHITECTURE

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Language**: TypeScript

### Database Schema

#### `source_files` Table
```sql
- id: SERIAL PRIMARY KEY
- filename: TEXT
- uploaded_at: TIMESTAMPTZ (default NOW)
- amount_sign_convention: TEXT ('negative' | 'positive')
- user_id: UUID (foreign key to auth.users)
```

#### `transactions` Table
```sql
- id: SERIAL PRIMARY KEY
- date: DATE
- merchant_raw: TEXT
- merchant_normalized: TEXT
- amount: DECIMAL(10,2)  -- STORED AS RAW (sign preserved from CSV)
- category_id: INTEGER (nullable)
- confidence_score: DECIMAL(3,2) (nullable)
- status: TEXT ('pending_review' | 'approved')
- source_file_id: INTEGER (foreign key to source_files)
- import_error_reason: TEXT (nullable)
- import_error_message: TEXT (nullable)
- created_at: TIMESTAMPTZ
- user_id: UUID (foreign key to auth.users)
```

#### `categories` Table
```sql
- id: SERIAL PRIMARY KEY
- name: TEXT (Housing, Utilities, Groceries, etc.)
```

### File Structure
```
/app
  /components
    - Analytics.tsx (Dashboard display)
    - FileUpload.tsx (Upload UI)
    - AppLayout.tsx (Main layout with nav)
  /page.tsx (Home - shows Analytics)
  
/lib
  /actions
    - upload-transactions-v2.ts (Main upload logic)
    - dashboard.ts (Dashboard data fetching)
  /utils
    - csv-parser.ts (Parse CSV/Excel files)
    - column-detector.ts (Auto-detect date/merchant/amount columns)
    - normalizer.ts (Clean/validate transactions)
    - amount-calculator.ts (Handle amount sign conventions)
    - amount-convention-detector.ts (Detect if file uses positive/negative for spending)
```

---

## ⚙️ HOW IT WORKS (Current Implementation)

### Upload Flow (`uploadTransactionsV2`)

1. **User selects files** (multiple CSV/Excel files)
2. **For each file**:
   - Parse CSV → array of rows
   - Detect columns (date, merchant, amount)
   - Detect amount convention (positive vs negative for spending)
   - Create `source_files` record with convention
   - Normalize transactions (parse dates, clean merchants, filter payments)
   - Insert transactions into database
   - Calculate total value using `calculateSpendingAmount()`
3. **Display results**: Total transactions, total value per file

### Amount Convention Logic

**Key Function**: `calculateSpendingAmount(rawAmount, convention)`

```typescript
// Chase convention (negative = spending)
convention = 'negative'
rawAmount = -50.00
→ spendingAmount = 50.00 ✓

// Amex convention (positive = spending)  
convention = 'positive'
rawAmount = 50.00
→ spendingAmount = 50.00 ✓

// Credits are EXCLUDED from spending
rawAmount = 100.00 with 'negative' convention
→ spendingAmount = 0 (this is a credit, not spending)
```

### Dashboard Display Logic

1. **Fetch transactions**: `.eq('status', 'approved')`
2. **For each transaction**:
   - Get `source_file.amount_sign_convention`
   - Calculate: `spendingAmount = calculateSpendingAmount(transaction.amount, convention)`
   - Sum all spendingAmounts
3. **Display**: Total spending, transaction count, file list

---

## ❌ CRITICAL PROBLEMS ENCOUNTERED

### Problem 1: Inconsistent Totals (PRIMARY ISSUE)

**Symptom**: Upload shows $91,180, Dashboard shows $62,000-65,000

**Root Causes Discovered**:

1. **59 empty source files** in database
   - Files created but transactions failed to insert
   - Each failed upload attempt created a new source_file record
   - Dashboard counts files incorrectly (showing 3 instead of 4)

2. **Missing transactions**
   - Only 1,000 transactions in DB instead of 1,516
   - ~516 transactions (~$29,000) never inserted
   - Files with 0 transactions: `Chase3887` (should have 260)
   - Files with partial data: `Chase2909` (has 73, should have 329)

3. **Silent failures**
   - Upload creates source_file record ✓
   - Upload fails to insert transactions ✗
   - No error surfaced to user
   - User thinks upload succeeded

### Problem 2: Convention Confusion

**Issue**: Amount stored as raw value, but calculation depends on convention lookup

**Example**:
```
Transaction.amount = -50.00 (stored in DB)
source_file.convention = 'negative'
Dashboard calculates: calculateSpendingAmount(-50.00, 'negative') = 50.00 ✓

BUT if convention is null or wrong:
Dashboard calculates: calculateSpendingAmount(-50.00, 'positive') = 0 ✗
(Treated as credit instead of spending)
```

**Why It Breaks**:
- Convention stored separately in `source_files` table
- If source file link breaks, convention is lost
- Fallback to 'negative' may not match actual file convention
- No way to validate calculation matches upload calculation

### Problem 3: Data Integrity Issues

**62 Source Files But Only 3-4 Should Exist**:
- Multiple upload attempts created duplicate source_file records
- Empty files clutter database
- File count displayed incorrectly
- Cleanup attempts have been unsuccessful

**Transaction Status Filtering**:
- Old upload flow marked low-confidence transactions as `pending_review`
- Dashboard filters `.eq('status', 'approved')`
- Files with only pending transactions are invisible
- User confused about missing files

---

## ✅ WHAT'S WORKING

1. **CSV Parsing**: Successfully reads Chase and Amex files
2. **Column Detection**: Auto-detects date, merchant, amount columns
3. **Convention Detection**: Correctly identifies positive vs negative spending
4. **Payment Filtering**: Successfully excludes "AUTOMATIC PAYMENT" and "CREDIT CARD PAYMENT"
5. **Upload UI**: Clean, shows detailed results per file
6. **Authentication**: Supabase auth works
7. **Row Level Security**: Users only see their own data

---

## ❌ WHAT'S NOT WORKING

1. **Transaction insertion fails silently** (~34% of transactions never inserted)
2. **Database cluttered** with 59 empty source files
3. **Dashboard shows wrong totals** (missing ~$29,000)
4. **Convention lookup fragile** (depends on foreign key relationship)
5. **No validation** that upload total = dashboard total
6. **Multiple upload attempts** create duplicate file records instead of updating
7. **Error handling insufficient** - users don't see why transactions fail to import

---

## 🔍 ROOT CAUSE ANALYSIS

### Why Transactions Fail to Insert

**Hypothesis 1**: Database constraints
- Unique constraint violations?
- Foreign key errors?
- Data type mismatches?

**Hypothesis 2**: Normalization failures
- Date parsing errors
- Amount parsing errors  
- Merchant validation errors
- **BUT**: Normalizer returns errors array, should be surfaced

**Hypothesis 3**: Transaction rollback
- Source file created ✓
- Transactions inserted ✓
- Something triggers rollback?
- Leaves source file but no transactions

**Hypothesis 4**: Batch insert failures
- Inserting 200+ transactions at once
- Supabase/Postgres times out?
- Partial success not handled?

### Why Calculations Differ

**The Core Issue**: **Two-step calculation with separate data**

```
Upload time:
  rawAmount → detectConvention(file) → calculateSpendingAmount() → $91,180 ✓

Display time:
  rawAmount → lookup source_file.convention → calculateSpendingAmount() → $62,000 ✗
```

**Problem**: If convention lookup fails or is inconsistent, calculations differ

---

## 💡 PROPOSED SOLUTIONS

### Solution 1: Store Calculated Spending Amount

**Instead of**:
```sql
transactions.amount = -50.00  -- raw
-- Convention stored separately in source_files
```

**Do this**:
```sql
transactions.amount_raw = -50.00
transactions.amount_spending = 50.00  -- PRE-CALCULATED at upload
transactions.amount_convention = 'negative'  -- STORED WITH TRANSACTION
```

**Benefits**:
- ✅ Upload and dashboard use same pre-calculated value
- ✅ No foreign key lookup needed
- ✅ Convention preserved even if source file deleted
- ✅ Easy to validate: SUM(amount_spending) = upload total

### Solution 2: Atomic Upload with Validation

**New upload flow**:
```typescript
1. Parse all files
2. Normalize all transactions
3. Calculate all totals
4. BEGIN TRANSACTION
5. Insert source_files
6. Insert ALL transactions (or none)
7. Validate: COUNT and SUM match expected
8. COMMIT if valid, ROLLBACK if not
9. Return success/failure with details
```

### Solution 3: Single Upload, No Duplicates

**Check before upload**:
```typescript
1. Hash filename + upload date
2. Check if source_file exists with same hash
3. If exists:
   - Option A: Skip upload, show existing data
   - Option B: Delete old and re-upload
   - Option C: Update/merge
4. Prevent 59 duplicate empty files
```

### Solution 4: Enhanced Error Surfacing

**Show user exactly what failed**:
```typescript
UploadResult {
  success: boolean
  totalExpected: 1516
  totalInserted: 1000
  totalFailed: 516
  
  files: {
    filename: string
    expectedRows: 329
    insertedRows: 73
    failedRows: 256
    errors: [
      { row: 15, reason: "date_parse", message: "..." }
    ]
  }[]
}
```

---

## 📝 SOURCE DATA (The Truth)

### Expected Files & Totals

1. **activity.csv** (Amex - positive convention)
   - Transactions: 571
   - Total: $45,647.76

2. **Chase2861_Activity20250101_20260101_20260109.CSV**
   - Transactions: 356
   - Total: $15,774.72

3. **Chase2909_Activity20250101_20251231_20260109.CSV**
   - Transactions: 329
   - Total: $10,151.31

4. **Chase3887_Activity20250101_20251231_20260109.CSV**
   - Transactions: 260
   - Total: $19,606.22

**TOTAL**: 1,516 transactions = **$91,180.01**

### Current Database State

**Source Files**: 62 (59 are empty duplicates)
**Transactions**: 1,000 (516 missing)
**Displayed Total**: $62,000-65,000 (off by ~$29,000)

**Files with Transactions**:
- activity.csv: 571 ✓ (correct)
- Chase2861: 356 ✓ (correct)
- Chase2909: 73 ✗ (missing 256)
- Chase3887: 0 ✗ (missing all 260)

---

## ❓ QUESTIONS FOR REBUILD

### Data Model Questions

1. Should we store **raw amount** + **spending amount** separately?
2. Should **convention be stored per transaction** or per file?
3. Should we allow **duplicate file uploads** or prevent them?
4. Should **pending_review** status exist, or auto-approve everything?

### Calculation Questions

5. Should calculation happen **at upload time** (stored) or **at display time** (calculated)?
6. How should we handle **credits/refunds** - store as negative spending or filter out entirely?
7. Should we store **file hash** to detect duplicates?

### UX Questions

8. When upload partially fails, should we:
   - Rollback everything (all or nothing)?
   - Keep successful inserts, report failures?
   - Allow user to retry failed rows?

9. Should dashboard show:
   - Only approved transactions?
   - All transactions (approved + pending)?
   - Toggle between both?

10. If totals don't match, should app:
    - Block user and force investigation?
    - Show warning but allow usage?
    - Auto-fix discrepancies?

### Architecture Questions

11. Should we use **database transactions** (BEGIN/COMMIT) for uploads?
12. Should we add **checksum validation** (upload total = DB total)?
13. Should we add **audit log** of all uploads and changes?
14. Should we **denormalize** (store everything in transactions table) or keep normalized?

---

## 🎯 DESIRED END STATE

### Upload Flow Should:
1. ✅ Accept 4 CSV files
2. ✅ Process in < 30 seconds
3. ✅ Show progress per file
4. ✅ Display: "1,516 transactions, $91,180.01"
5. ✅ Surface ALL errors clearly
6. ✅ Prevent duplicate uploads
7. ✅ Guarantee atomicity (all or nothing)

### Dashboard Should:
1. ✅ Display: "1,516 transactions"
2. ✅ Display: "$91,180.01"
3. ✅ Show all 4 files
4. ✅ Match upload totals EXACTLY
5. ✅ Load in < 2 seconds
6. ✅ Never show stale/wrong data

### Data Integrity Should:
1. ✅ SUM(transactions.spending_amount) = upload total
2. ✅ COUNT(transactions) = upload count
3. ✅ COUNT(source_files with transactions) = files uploaded
4. ✅ No orphaned source_files (0 transactions)
5. ✅ Convention never ambiguous or missing

---

## 📦 RECOMMENDATION FOR REBUILD

### Simplified Data Model

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Source tracking
  source_filename TEXT NOT NULL,
  source_uploaded_at TIMESTAMPTZ NOT NULL,
  
  -- Transaction data (from CSV)
  transaction_date DATE NOT NULL,
  merchant TEXT NOT NULL,
  
  -- Amount handling (STORE BOTH)
  amount_raw DECIMAL(10,2) NOT NULL,  -- Exactly as in CSV
  amount_spending DECIMAL(10,2) NOT NULL,  -- Pre-calculated positive spending
  amount_convention TEXT NOT NULL,  -- 'positive' | 'negative'
  is_credit BOOLEAN NOT NULL DEFAULT false,  -- True if refund/credit
  
  -- Categorization (optional)
  category TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_spending ON transactions(user_id, amount_spending) 
  WHERE amount_spending > 0;
```

### Key Changes

1. **No separate source_files table** - filename stored per transaction
2. **Both raw and spending amounts stored** - no calculation at display time
3. **Convention stored per transaction** - never ambiguous
4. **is_credit flag** - explicit, not inferred
5. **Simpler schema** - easier to reason about

### Upload Logic

```typescript
async function uploadTransactions(files: File[]) {
  const allTransactions = [];
  
  // Parse all files first
  for (const file of files) {
    const rows = parseCSV(file);
    const convention = detectConvention(rows);
    
    for (const row of rows) {
      const rawAmount = parseAmount(row.amount);
      const spendingAmount = calculateSpendingAmount(rawAmount, convention);
      const isCredit = spendingAmount === 0;
      
      allTransactions.push({
        source_filename: file.name,
        source_uploaded_at: new Date(),
        transaction_date: parseDate(row.date),
        merchant: row.merchant,
        amount_raw: rawAmount,
        amount_spending: spendingAmount,
        amount_convention: convention,
        is_credit: isCredit,
      });
    }
  }
  
  // Insert atomically
  const result = await db.transaction(async (tx) => {
    const inserted = await tx.insert(transactions).values(allTransactions);
    
    // Validate
    const expectedTotal = allTransactions.reduce((sum, t) => sum + t.amount_spending, 0);
    const dbTotal = await tx.select(sum(amount_spending)).from(transactions);
    
    if (Math.abs(expectedTotal - dbTotal) > 0.01) {
      throw new Error('Total mismatch - rolling back');
    }
    
    return { count: inserted.length, total: expectedTotal };
  });
  
  return result;
}
```

### Dashboard Logic

```typescript
async function getDashboardData() {
  // Simple query - no joins, no lookups
  const transactions = await db
    .select({
      count: count(),
      total: sum(amount_spending)
    })
    .from(transactions)
    .where(eq(user_id, currentUser));
  
  // This will ALWAYS match upload totals
  return transactions;
}
```

---

## 🚀 SUCCESS METRICS

### How We'll Know It Works

1. **Upload 4 files** → See "1,516 transactions, $91,180.01"
2. **Refresh dashboard** → See "1,516 transactions, $91,180.01"  
3. **Check database** → `SELECT SUM(amount_spending)` = $91,180.01
4. **Upload same files again** → Rejected or merged, not duplicated
5. **Run 100 times** → Results identical every time

### The One Test That Matters

```sql
-- This should ALWAYS equal upload total
SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions
WHERE user_id = $1;

-- Expected: 1516, $91,180.01
```

If this query doesn't match upload results, **the app is broken**.

---

## 📋 FILES TO REFERENCE

Current implementation files to study:
- `/lib/actions/upload-transactions-v2.ts` - Upload logic
- `/lib/utils/amount-calculator.ts` - Amount calculation
- `/lib/utils/normalizer.ts` - Transaction normalization
- `/lib/actions/dashboard.ts` - Dashboard data fetching
- `/app/components/Analytics.tsx` - Dashboard display

Test files available at:
- `/Users/joshgold/Desktop/transactions/*.csv`

---

## 💭 FINAL NOTES

### What Worked Well
- Convention detection algorithm
- CSV parsing
- Payment/refund filtering
- UI/UX of upload flow
- Real-time progress feedback

### What Failed
- **Trust in data integrity** (biggest issue)
- Separation of amount storage and calculation
- Silent failure handling
- Duplicate upload prevention
- Foreign key dependency for critical data

### Core Lesson

**Don't calculate financial totals at display time using foreign key lookups.**

Store the calculated values at upload time. The upload process knows the truth. The dashboard should just display it.

---

*Generated: 2026-01-10*
*User: Non-technical designer*
*Goal: Rebuild with 100% data integrity*

