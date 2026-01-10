# Rebuild Prompt: Transaction Tracker App

## 🎯 Core Problem

Build a personal finance tracker that:
1. Uploads 4 CSV files (1,516 transactions, $91,180.01 total)
2. Displays dashboard showing EXACT same total
3. Never loses data or calculates wrong totals

**Current Issue**: Upload shows $91,180, dashboard shows $62,000. 516 transactions missing from database.

---

## 📊 Requirements

### Must Have
- Upload multiple CSV/Excel files at once
- Auto-detect columns (date, merchant, amount)
- Handle different amount sign conventions:
  - Chase: negative = spending (e.g., -$50 = $50 spent)
  - Amex: positive = spending (e.g., $50 = $50 spent)
- Exclude payments and credits from spending totals
- Display dashboard with:
  - Total spending (must match upload)
  - Transaction count (must match upload)
  - List of files uploaded
  - Recent transactions

### Critical: Data Integrity
- Upload total = Dashboard total (always, no exceptions)
- No missing transactions
- No duplicate file uploads creating ghost records
- No silent failures

---

## 🏗️ Recommended Architecture

### Simplified Database Schema

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Source
  source_filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL,
  
  -- Transaction
  date DATE NOT NULL,
  merchant TEXT NOT NULL,
  
  -- CRITICAL: Store both raw and calculated amounts
  amount_raw DECIMAL(10,2) NOT NULL,        -- Exactly as in CSV
  amount_spending DECIMAL(10,2) NOT NULL,   -- Pre-calculated positive spending
  convention TEXT NOT NULL,                  -- 'positive' or 'negative'
  is_credit BOOLEAN NOT NULL,               -- True for refunds/credits
  
  -- Optional
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why this works**:
- ✅ Spending amount calculated ONCE at upload, stored, never recalculated
- ✅ Convention stored per transaction (not in separate table)
- ✅ Simple SUM query always matches upload total
- ✅ No foreign key lookups needed

---

## 🔧 Upload Logic

```typescript
function uploadFiles(files: File[]) {
  let allTransactions = [];
  let totalExpected = 0;
  
  // 1. Parse all files
  for (file of files) {
    const rows = parseCSV(file);
    const convention = detectConvention(rows); // negative or positive
    
    for (row of rows) {
      // Skip payments
      if (row.merchant.includes('PAYMENT')) continue;
      
      const raw = parseFloat(row.amount);
      const spending = calculateSpending(raw, convention);
      
      allTransactions.push({
        source_filename: file.name,
        date: parseDate(row.date),
        merchant: row.merchant,
        amount_raw: raw,
        amount_spending: spending,
        convention: convention,
        is_credit: spending === 0
      });
      
      totalExpected += spending;
    }
  }
  
  // 2. Insert atomically (all or nothing)
  await db.transaction(async (tx) => {
    await tx.insert(transactions, allTransactions);
    
    // 3. Validate
    const dbTotal = await tx.query(
      'SELECT SUM(amount_spending) FROM transactions WHERE user_id = $1',
      [userId]
    );
    
    if (Math.abs(dbTotal - totalExpected) > 0.01) {
      throw new Error('Total mismatch - rolling back');
    }
  });
  
  return {
    count: allTransactions.length,
    total: totalExpected
  };
}
```

---

## 📱 Dashboard Logic

```typescript
function getDashboardData() {
  // Simple query - no calculations, no lookups
  return db.query(`
    SELECT 
      COUNT(*) as count,
      SUM(amount_spending) as total,
      source_filename,
      COUNT(*) as file_transactions
    FROM transactions
    WHERE user_id = $1
      AND is_credit = false
    GROUP BY source_filename
  `);
}
```

**This will ALWAYS match upload totals** because:
- No calculation at display time
- No foreign key lookups
- Just summing pre-calculated values

---

## 🎨 Tech Stack

**Must use**:
- Next.js 14 (App Router)
- TypeScript
- Supabase (PostgreSQL + Auth)

**UI Requirements**:
- Clean, modern design
- Real-time upload progress
- Show per-file results
- Clear error messages
- Mobile responsive

---

## ⚠️ Critical Rules

### DO:
1. ✅ Calculate spending amount at upload time, store it
2. ✅ Store convention with each transaction
3. ✅ Use database transactions (BEGIN/COMMIT)
4. ✅ Validate totals before committing
5. ✅ Surface ALL errors to user
6. ✅ Prevent duplicate file uploads

### DON'T:
1. ❌ Calculate amounts at display time
2. ❌ Store convention in separate table
3. ❌ Use foreign keys for critical financial data
4. ❌ Allow partial upload success without validation
5. ❌ Fail silently
6. ❌ Trust frontend calculations for validation

---

## 🧪 The One Test

After upload, this query:

```sql
SELECT COUNT(*), SUM(amount_spending) 
FROM transactions 
WHERE user_id = $1;
```

Must return: **1516, $91,180.01**

If it doesn't, the app is broken.

---

## 📦 Test Data

Located at: `/Users/joshgold/Desktop/transactions/`

**Files** (4 total):
1. `activity.csv` - 571 transactions, $45,647.76 (Amex, positive)
2. `Chase2861_*.CSV` - 356 transactions, $15,774.72 (negative)
3. `Chase2909_*.CSV` - 329 transactions, $10,151.31 (negative)
4. `Chase3887_*.CSV` - 260 transactions, $19,606.22 (negative)

**Total**: 1,516 transactions = **$91,180.01**

---

## 🎯 Success Criteria

1. Upload 4 files → See "1,516 transactions, $91,180.01"
2. Refresh page → See "1,516 transactions, $91,180.01"
3. Check database → SUM = $91,180.01
4. Upload same files → Rejected (prevent duplicates)
5. Run 100 times → Same result every time

---

## 💡 Key Insight

**The Problem**: Separating amount storage from calculation

**Current (broken)**:
```
Store: amount = -50
Display: lookup convention → calculate → sometimes wrong
```

**Fixed**:
```
Upload: calculate once → store 50
Display: read 50 → always correct
```

Store the answer, don't recalculate it.

---

## 🚀 Build Checklist

- [ ] Simple schema (no separate source_files table)
- [ ] Store amount_spending (pre-calculated)
- [ ] Store convention per transaction
- [ ] Atomic uploads (database transaction)
- [ ] Validation before commit
- [ ] Clear error messages
- [ ] Prevent duplicate uploads
- [ ] Dashboard = simple SUM query
- [ ] Test with real files
- [ ] Verify: dashboard = upload total

---

## 📋 Questions to Consider

1. Should we hash filenames to detect duplicates?
2. Should we show upload history/audit log?
3. Should we allow re-uploading same file (replace old)?
4. Should we add categories/tagging (optional feature)?
5. Should we export data (CSV, PDF)?

---

**Build this app to be SIMPLE and RELIABLE above all else.**

The current app is ~2,000 lines but can't add numbers correctly.  
The new app should be ~500 lines and handle money accurately.

