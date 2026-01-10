'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { uploadTransactionsV2 } from '@/lib/actions/upload-transactions-v2';

export default function TestUploadPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        router.push('/login');
      } else {
        setUser(user);
        setLoading(false);
      }
    });
  }, [router]);

  const [result, setResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const handleTestUpload = async () => {
    setUploading(true);
    setResult(null);
    
    try {
      // Fetch test CSV file
      const response = await fetch('/test-data.csv');
      if (!response.ok) {
        throw new Error('Failed to fetch test CSV file');
      }
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
      
      console.log('✅ Upload Result:', uploadResult);
      
      if (uploadResult.success) {
        setStep(2); // Move to next step
      }
    } catch (error) {
      console.error('❌ Upload failed:', error);
      setResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error',
        totalTransactions: 0,
        totalSpending: 0,
        fileResults: [],
      });
    } finally {
      setUploading(false);
    }
  };

  const handleTestDuplicate = async () => {
    setUploading(true);
    setResult(null);
    
    try {
      // Fetch same test CSV file again
      const response = await fetch('/test-data.csv');
      const csvContent = await response.text();
      const file = new File([csvContent], 'test_transactions.csv', { 
        type: 'text/csv' 
      });

      // Create FormData (required for Server Actions)
      const formData = new FormData();
      formData.append('files', file);

      // Try to upload again (should fail)
      const uploadResult = await uploadTransactionsV2(formData);
      setResult(uploadResult);
      
      console.log('🔄 Duplicate Upload Result:', uploadResult);
      
      if (!uploadResult.success) {
        setStep(4); // Move to constraint queries step
      }
    } catch (error) {
      console.error('Error:', error);
      setResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-gray-900">Transaction Tracker - Test Suite</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <a
                href="/"
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">transactions_v2 Test Suite</h1>

        {/* Step 1: Upload Test CSV */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Step 1: Upload Test CSV</h2>
            <p className="text-gray-600 mb-4">
              Upload the test CSV file with 5 transactions (3 spending, 1 credit, 1 payment).
              Expected total: $140.81
            </p>
            
            <button
              onClick={handleTestUpload}
              disabled={uploading}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 font-semibold"
            >
              {uploading ? 'Uploading...' : 'Upload Test CSV'}
            </button>

            {result && (
              <div className={`mt-6 p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <h3 className={`font-bold text-lg mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {result.success ? '✅ Upload Successful' : '❌ Upload Failed'}
                </h3>
                <p className={result.success ? 'text-green-700' : 'text-red-700'}>{result.message}</p>
                {result.success && (
                  <div className="mt-4 space-y-2">
                    <p className="text-green-700">
                      <strong>Transactions:</strong> {result.totalTransactions}
                    </p>
                    <p className="text-green-700">
                      <strong>Total Spending:</strong> ${result.totalSpending.toFixed(2)}
                    </p>
                    <p className="text-green-700 text-sm">
                      Expected: 5 transactions, $140.81 total
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Validate Totals */}
        {step >= 2 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Step 2: Validate Totals (SQL Query)</h2>
            <p className="text-gray-600 mb-4">
              Run this query in Supabase SQL Editor to verify totals match:
            </p>
            
            <div className="bg-gray-50 p-4 rounded border border-gray-200 mb-4">
              <code className="text-sm">
                {`SELECT 
  COUNT(*) as transaction_count,
  SUM(amount_spending) as total_spending
FROM transactions_v2
WHERE user_id = 'YOUR_USER_ID_HERE'
  AND amount_spending > 0;`}
              </code>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              <strong>Expected Result:</strong> transaction_count = 3, total_spending = 140.81
            </p>
            
            <button
              onClick={() => setStep(3)}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-semibold"
            >
              ✓ I've verified the SQL query - Continue to Step 3
            </button>
          </div>
        )}

        {/* Step 3: Test Duplicate */}
        {step >= 3 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Step 3: Test Duplicate Detection</h2>
            <p className="text-gray-600 mb-4">
              Try uploading the same file again. It should be rejected as a duplicate.
            </p>
            
            <button
              onClick={handleTestDuplicate}
              disabled={uploading}
              className="bg-yellow-600 text-white px-6 py-3 rounded-md hover:bg-yellow-700 disabled:opacity-50 font-semibold"
            >
              {uploading ? 'Testing...' : 'Try Uploading Same File Again'}
            </button>

            {result && (
              <div className={`mt-6 p-4 rounded-lg ${!result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <h3 className={`font-bold text-lg mb-2 ${!result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {!result.success ? '✅ Duplicate Correctly Rejected' : '❌ Duplicate Not Detected'}
                </h3>
                <p className={!result.success ? 'text-green-700' : 'text-red-700'}>
                  {result.message}
                </p>
                {!result.success && (
                  <p className="text-green-700 text-sm mt-2">
                    This is correct! The duplicate was detected and rejected.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Constraint Queries */}
        {step >= 4 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Step 4: Run Constraint Validation Queries</h2>
            <p className="text-gray-600 mb-4">
              Copy these queries to Supabase SQL Editor and verify all return 0 violations:
            </p>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <h4 className="font-semibold mb-2">Query 1: Constraint Violations</h4>
                <code className="text-xs block whitespace-pre-wrap">
{`SELECT COUNT(*) as violation_count
FROM transactions_v2
WHERE user_id = 'YOUR_USER_ID'
  AND (
    (amount_spending > 0 AND (is_credit OR is_payment)) OR
    (amount_spending = 0 AND NOT is_credit AND NOT is_payment)
  );
-- Expected: 0`}
                </code>
              </div>

              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <h4 className="font-semibold mb-2">Query 2: Empty Merchants</h4>
                <code className="text-xs block whitespace-pre-wrap">
{`SELECT COUNT(*) as empty_count
FROM transactions_v2
WHERE user_id = 'YOUR_USER_ID'
  AND (merchant IS NULL OR LENGTH(TRIM(merchant)) = 0);
-- Expected: 0`}
                </code>
              </div>

              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <h4 className="font-semibold mb-2">Query 3: Negative Spending</h4>
                <code className="text-xs block whitespace-pre-wrap">
{`SELECT COUNT(*) as negative_count
FROM transactions_v2
WHERE user_id = 'YOUR_USER_ID'
  AND amount_spending < 0;
-- Expected: 0`}
                </code>
              </div>

              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <h4 className="font-semibold mb-2">Query 4: All Transactions Summary</h4>
                <code className="text-xs block whitespace-pre-wrap">
{`SELECT 
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE amount_spending > 0) as spending_rows,
  COUNT(*) FILTER (WHERE is_credit) as credit_rows,
  COUNT(*) FILTER (WHERE is_payment) as payment_rows
FROM transactions_v2
WHERE user_id = 'YOUR_USER_ID'
  AND source_filename = 'test_transactions.csv';
-- Expected: total=5, spending=3, credit=1, payment=1`}
                </code>
              </div>
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
              <h3 className="font-bold text-green-800 mb-2">✅ All Tests Complete!</h3>
              <p className="text-green-700 text-sm">
                If all queries return expected results, your transactions_v2 implementation is working correctly!
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-blue-800 mb-2">📝 Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
            <li>Click "Upload Test CSV" to upload the test file</li>
            <li>Verify the SQL query in Supabase SQL Editor returns 3 transactions, $140.81</li>
            <li>Click "Try Uploading Same File Again" - it should be rejected</li>
            <li>Run the constraint queries in Supabase SQL Editor - all should return 0</li>
          </ol>
        </div>
        </div>
      </main>
    </div>
  );
}

