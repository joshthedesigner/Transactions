'use client';

import { useEffect, useState } from 'react';
import { checkFailedTransactions } from '@/lib/actions/check-failed-transactions';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckFailedPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        setLoading(true);
        const data = await checkFailedTransactions();
        setResult(data);
      } catch (e) {
        setResult({ error: e instanceof Error ? e.message : 'Unknown error' });
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">Check Failed Transactions</h1>
          
          {loading ? (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Checking...</p>
            </div>
          ) : result ? (
            <div className={`rounded-lg p-6 ${
              result.error 
                ? 'bg-red-50 border border-red-200' 
                : result.hasFailed 
                  ? 'bg-yellow-50 border border-yellow-200' 
                  : 'bg-green-50 border border-green-200'
            }`}>
              {result.error ? (
                <>
                  <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
                  <p className="text-red-700">{result.error}</p>
                  {result.error.includes('Migration not run') && (
                    <div className="mt-4 p-4 bg-white rounded border border-red-300">
                      <p className="font-semibold mb-2">To fix this:</p>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Run the migration: <code className="bg-gray-100 px-2 py-1 rounded">supabase/migrations/002_add_import_error.sql</code></li>
                        <li>Or execute this SQL in your database:</li>
                      </ol>
                      <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
{`ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS import_error_reason TEXT,
ADD COLUMN IF NOT EXISTS import_error_message TEXT;`}
                      </pre>
                    </div>
                  )}
                </>
              ) : result.hasFailed ? (
                <>
                  <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                    Found {result.count} Failed Transaction(s)
                  </h2>
                  <p className="text-yellow-700 mb-4">
                    These transactions failed to import and are waiting for review.
                  </p>
                  <a
                    href="/"
                    className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    Go to Review Queue
                  </a>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-green-800 mb-2">No Failed Transactions</h2>
                  <p className="text-green-700">
                    All transactions imported successfully or have been reviewed.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

