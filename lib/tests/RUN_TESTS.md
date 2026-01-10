# How to Run the 4 Test Steps

## Step-by-Step Instructions

---

## STEP 1: Upload Test CSV

### Option A: Create a Test Page

Create a new page at `app/test-upload/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';

export default function TestUploadPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTestUpload = async () => {
    setLoading(true);
    try {
      // Read test CSV file
      const response = await fetch('/lib/tests/test-data.csv');
      const csvContent = await response.text();
      
      // Create File object
      const file = new File([csvContent], 'test_transactions.csv', { 
        type: 'text/csv' 
      });

      // Create FormData (required for Server Actions)
      const formData = new FormData();
      formData.append('files', file);

      // Upload
      const uploadResult = await uploadTransactionsV2(formData);
      setResult(uploadResult);
      
      console.log('Upload Result:', uploadResult);
    } catch (error) {
      console.error('Upload failed:', error);
      setResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Upload</h1>
      
      <button
        onClick={handleTestUpload}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Uploading...' : 'Upload Test CSV'}
      </button>

      {result && (
        <div className={`mt-4 p-4 rounded ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h2 className="font-bold">{result.success ? '✅ Success' : '❌ Failed'}</h2>
          <p>Message: {result.message}</p>
          {result.success && (
            <>
              <p>Transactions: {result.totalTransactions}</p>
              <p>Total Spending: ${result.totalSpending.toFixed(2)}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Then:**
1. Navigate to `http://localhost:3000/test-upload`
2. Click "Upload Test CSV"
3. Check console and page for results
4. **Expected**: `{ success: true, totalTransactions: 5, totalSpending: 140.81 }`

---

### Option B: Use Browser Console

1. Open your app in browser (`http://localhost:3000`)
2. Open browser console (F12 or Cmd+Option+I)
3. Paste this code:

```javascript
// Step 1: Fetch test CSV
const response = await fetch('/lib/tests/test-data.csv');
const csvContent = await response.text();

// Step 2: Create File object
const file = new File([csvContent], 'test_transactions.csv', { 
  type: 'text/csv' 
});

// Step 3: Import and call upload function
// Note: This requires the function to be available client-side
// If not, use Option A (create a page) instead
```

**Note**: If `uploadTransactionsV2` is server-only, use Option A instead.

---

## STEP 2: Validate Totals with SQL

### Method: Supabase Dashboard

1. **Go to Supabase Dashboard**:
   - Visit your Supabase project dashboard
   - Click "SQL Editor" in the left sidebar

2. **Get your User ID**:
   - First, find your user ID:
   ```sql
   SELECT id, email 
   FROM auth.users 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
   - Copy the `id` value (UUID)

3. **Run the Critical Query**:
   ```sql
   SELECT 
     COUNT(*) as transaction_count,
     SUM(amount_spending) as total_spending
   FROM transactions_v2
   WHERE user_id = 'PASTE_YOUR_USER_ID_HERE'
     AND amount_spending > 0;
   ```

4. **Check Results**:
   - **Expected**: `transaction_count = 3`, `total_spending = 140.81`
   - If it matches, ✅ Step 2 passes!

---

## STEP 3: Test Duplicate Detection

### Option A: Use the Test Page Again

1. Go back to `http://localhost:3000/test-upload`
2. Click "Upload Test CSV" **again** (same file)
3. **Expected Result**: 
   ```json
   {
     "success": false,
     "message": "File already uploaded (duplicate detected)",
     "totalTransactions": 0,
     "totalSpending": 0
   }
   ```

### Option B: Check with SQL First

1. **Get the file hash** from the uploaded file:
   ```sql
   SELECT DISTINCT source_file_hash, source_filename
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND source_filename = 'test_transactions.csv';
   ```

2. **Check if duplicate detection works**:
   ```sql
   SELECT EXISTS (
     SELECT 1 
     FROM transactions_v2
     WHERE user_id = 'YOUR_USER_ID'
       AND source_file_hash = 'HASH_FROM_ABOVE'
   ) as already_uploaded;
   ```
   - Should return `already_uploaded = true`

3. **Then try uploading again** (should fail)

---

## STEP 4: Run Constraint Queries

### Method: Supabase SQL Editor

1. **Open SQL Editor** in Supabase Dashboard

2. **Copy queries from** `lib/tests/test-validation.sql`

3. **Replace placeholder**:
   - Find `:'test_user_id'` or `'00000000-0000-0000-0000-000000000000'`
   - Replace with your actual user ID

4. **Run each query** and verify results:

   **Query 1: Constraint Violations**
   ```sql
   SELECT COUNT(*) as violation_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND (
       (amount_spending > 0 AND (is_credit OR is_payment)) OR
       (amount_spending = 0 AND NOT is_credit AND NOT is_payment)
     );
   ```
   **Expected**: `violation_count = 0`

   **Query 2: Empty Merchants**
   ```sql
   SELECT COUNT(*) as empty_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);
   ```
   **Expected**: `empty_count = 0`

   **Query 3: Negative Spending**
   ```sql
   SELECT COUNT(*) as negative_count
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND amount_spending < 0;
   ```
   **Expected**: `negative_count = 0`

   **Query 4: All Transactions**
   ```sql
   SELECT 
     COUNT(*) as total_rows,
     COUNT(*) FILTER (WHERE amount_spending > 0) as spending_rows,
     COUNT(*) FILTER (WHERE is_credit) as credit_rows,
     COUNT(*) FILTER (WHERE is_payment) as payment_rows
   FROM transactions_v2
   WHERE user_id = 'YOUR_USER_ID'
     AND source_filename = 'test_transactions.csv';
   ```
   **Expected**: `total_rows = 5`, `spending_rows = 3`, `credit_rows = 1`, `payment_rows = 1`

---

## ✅ Quick Checklist

After running all 4 steps:

- [ ] **Step 1**: Upload succeeded → 5 transactions, $140.81
- [ ] **Step 2**: SQL query returns → 3 transactions, $140.81
- [ ] **Step 3**: Duplicate upload rejected → Error message shown
- [ ] **Step 4**: All constraint queries → Return 0 violations

---

## 🐛 Troubleshooting

### Step 1 Fails: "File not found"
- Make sure `test-data.csv` exists at `/lib/tests/test-data.csv`
- Or use absolute path: `/Users/joshgold/Desktop/Transactionapp/lib/tests/test-data.csv`

### Step 1 Fails: "Not authenticated"
- Make sure you're logged in to your app
- Check that `uploadTransactionsV2` has access to user session

### Step 2: Wrong totals
- Check if you're using the correct user_id
- Verify all 5 transactions were inserted
- Check if any transactions have `amount_spending = 0` (should be excluded)

### Step 3: Duplicate not detected
- Check that `source_file_hash` is being generated correctly
- Verify the hash matches between uploads
- Check database for existing file with same hash

### Step 4: Constraint violations found
- Review the violating rows
- Check if `is_credit`/`is_payment` flags are set correctly
- Verify `amount_spending` calculations

---

## 📝 Alternative: Run Full Test Suite

If you want to run the complete TypeScript test suite:

1. **Create a test API route** at `app/api/run-tests/route.ts`:

```typescript
import { runAllTests } from '@/lib/tests/test-transactions-v2';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Note: This will only show console output, not return results
    // For full results, modify runAllTests to return data
    await runAllTests();
    return NextResponse.json({ success: true, message: 'Tests completed - check console' });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
```

2. **Visit**: `http://localhost:3000/api/run-tests`
3. **Check browser console** for test output

---

*Follow these steps in order to validate your transactions_v2 implementation!*

