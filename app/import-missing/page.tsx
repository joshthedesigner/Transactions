'use client';

import { useEffect, useState } from 'react';
import { importMissingTransactions } from '@/lib/actions/import-missing-transactions';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function ImportMissingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!confirm('Import all missing transactions from CSV files? This will add transactions that are in the CSV but not in the database.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await importMissingTransactions();
      setData(result);
    } catch (e) {
      console.error('Error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Import Missing Transactions</h1>

          {!data && !loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <p className="text-lg mb-4">
                This will scan all CSV files and import any transactions that are missing from the database.
              </p>
              <button
                onClick={handleImport}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
              >
                Import Missing Transactions
              </button>
            </div>
          )}

          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Importing missing transactions...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">✅ Import Complete</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Imported</p>
                    <p className="text-2xl font-bold">{data.totalImported} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold">{formatCurrency(data.totalAmount)}</p>
                  </div>
                </div>
              </div>

              {/* Results by File */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📁 Results by File</h2>
                <div className="space-y-4">
                  {data.results.map((result: any, idx: number) => (
                    <div key={idx} className={`p-4 rounded border-2 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{result.filename}</p>
                          {result.success ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-sm">✅ Imported: {result.imported} transactions</p>
                              {result.totalMissing !== undefined && (
                                <p className="text-sm text-gray-600">
                                  Missing: {result.totalMissing} | Amount: {formatCurrency(result.totalAmount || 0)}
                                </p>
                              )}
                              {result.approved !== undefined && (
                                <p className="text-sm text-gray-600">
                                  Approved: {result.approved} | Pending: {result.pending}
                                </p>
                              )}
                              {result.message && (
                                <p className="text-sm text-gray-600">{result.message}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600 mt-2">❌ Error: {result.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm">
                  <strong>Next Steps:</strong> Refresh the dashboard to see the updated totals. 
                  If any transactions are pending review, approve them in the Review Queue.
                </p>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

