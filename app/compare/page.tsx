'use client';

import { useEffect, useState } from 'react';
import { compareAllCSVsWithDatabase } from '@/lib/actions/compare-csv-db';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';
import type { ComparisonResult } from '@/lib/actions/compare-csv-db';

export default function ComparePage() {
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadComparison() {
      try {
        setLoading(true);
        setError(null);
        const data = await compareAllCSVsWithDatabase();
        setResults(data);
      } catch (e) {
        console.error('Comparison error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadComparison();
  }, []);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">CSV vs Database Comparison</h1>

        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-blue-800">Loading comparison...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800 font-semibold">Error: {error}</p>
            <p className="text-red-700 text-sm mt-2">
              Check the terminal/console for detailed error messages.
            </p>
          </div>
        )}

        {!loading && !error && results ? (
          <div className="space-y-6">
            {results.map((result, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📄 {result.filename}</h2>
                
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="font-semibold mb-2">CSV File</h3>
                    <div className="space-y-1 text-sm">
                      <p><strong>Transactions:</strong> {result.csvCount}</p>
                      <p><strong>Total Amount:</strong> ${result.csvTotal.toFixed(2)}</p>
                      <p><strong>Date Range:</strong> {result.dateRange.csv.min} to {result.dateRange.csv.max}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">Database</h3>
                    <div className="space-y-1 text-sm">
                      <p><strong>Transactions:</strong> {result.dbCount}</p>
                      <p><strong>Total Amount:</strong> ${result.dbTotal.toFixed(2)}</p>
                      <p><strong>Date Range:</strong> {result.dateRange.db.min || 'N/A'} to {result.dateRange.db.max || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-md mb-4 ${
                  Math.abs(result.difference) < 0.01 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <p className={`font-semibold ${
                    Math.abs(result.difference) < 0.01 ? 'text-green-800' : 'text-yellow-800'
                  }`}>
                    Difference: ${result.difference.toFixed(2)} 
                    {Math.abs(result.difference) < 0.01 ? ' ✓ Match!' : ' ⚠️ Mismatch'}
                  </p>
                  {result.csvCount !== result.dbCount && (
                    <p className="text-sm mt-1">
                      Transaction count mismatch: CSV has {result.csvCount}, DB has {result.dbCount}
                    </p>
                  )}
                </div>

                {result.error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-red-800 font-semibold">Error processing this file:</p>
                    <p className="text-red-700 text-sm">{result.error}</p>
                  </div>
                )}

                {result.debugInfo && (
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs">
                    <p className="font-semibold mb-1">Debug Info:</p>
                    <p>Source File ID(s): {result.debugInfo.sourceFileId}</p>
                    <p>Matching Source Files: {result.debugInfo.matchingSourceFileCount || 'unknown'}</p>
                    <p>Total User Transactions: {result.debugInfo.totalUserTransactions}</p>
                    <p>Sample Source File IDs: {result.debugInfo.sampleSourceFileIds?.join(', ') || 'none'}</p>
                  </div>
                )}

                {result.missingInDB.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-red-600 mb-2">
                      Missing in Database ({result.missingInDB.length} transactions)
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Date</th>
                            <th className="px-2 py-1 text-left">Merchant</th>
                            <th className="px-2 py-1 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.missingInDB.slice(0, 20).map((t, i) => (
                            <tr key={i} className="border-b">
                              <td className="px-2 py-1">{t.date}</td>
                              <td className="px-2 py-1">{t.merchant}</td>
                              <td className="px-2 py-1 text-right">${Math.abs(t.amount).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {result.missingInDB.length > 20 && (
                        <p className="text-xs text-gray-500 mt-2">
                          ... and {result.missingInDB.length - 20} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {result.extraInDB.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-blue-600 mb-2">
                      Extra in Database ({result.extraInDB.length} transactions)
                    </h3>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Date</th>
                            <th className="px-2 py-1 text-left">Merchant</th>
                            <th className="px-2 py-1 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.extraInDB.slice(0, 20).map((t) => (
                            <tr key={t.id} className="border-b">
                              <td className="px-2 py-1">{t.date}</td>
                              <td className="px-2 py-1">{t.merchant_raw}</td>
                              <td className="px-2 py-1 text-right">${Math.abs(t.amount).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {result.extraInDB.length > 20 && (
                        <p className="text-xs text-gray-500 mt-2">
                          ... and {result.extraInDB.length - 20} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
              <div className="space-y-2">
                <p>
                  <strong>Total CSV Amount:</strong> $
                  {results.reduce((sum, r) => sum + r.csvTotal, 0).toFixed(2)}
                </p>
                <p>
                  <strong>Total DB Amount:</strong> $
                  {results.reduce((sum, r) => sum + r.dbTotal, 0).toFixed(2)}
                </p>
                <p>
                  <strong>Total Difference:</strong> $
                  {results.reduce((sum, r) => sum + r.difference, 0).toFixed(2)}
                </p>
                <p>
                  <strong>Total CSV Transactions:</strong>{' '}
                  {results.reduce((sum, r) => sum + r.csvCount, 0)}
                </p>
                <p>
                  <strong>Total DB Transactions:</strong>{' '}
                  {results.reduce((sum, r) => sum + r.dbCount, 0)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-yellow-800">No comparison data available</p>
          </div>
        )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

