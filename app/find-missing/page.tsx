'use client';

import { useEffect, useState } from 'react';
import { findMissingTransactions } from '@/lib/actions/find-missing-transactions';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function FindMissingPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(''); // Empty = all months

  const csvFiles = [
    { path: '/Users/joshgold/Downloads/Chase2861_Activity20250101_20260101_20260109.CSV', filename: 'Chase2861_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase3126_Activity20250101_20260101_20260109.CSV', filename: 'Chase3126_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase1462_Activity20250101_20260101_20260109.CSV', filename: 'Chase1462_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/activity.csv', filename: 'activity.csv' },
  ];

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const allResults = await Promise.all(
          csvFiles.map(file => 
            findMissingTransactions(file.path, file.filename, month || undefined)
              .then(result => ({ ...result, filename: file.filename }))
              .catch(err => ({ 
                filename: file.filename, 
                csvCount: 0, 
                dbCount: 0, 
                missing: [], 
                extra: [],
                error: err.message 
              }))
          )
        );
        setResults(allResults);
      } catch (e) {
        console.error('Error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [month]);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">Find Missing Transactions</h1>

          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Month (YYYY-MM, e.g., 2025-11 for November 2025)
            </label>
            <input
              type="text"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="2025-11"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-2 text-sm text-gray-600">
              Leave empty to check all months
            </p>
          </div>

          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Loading...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-6">
              {results.map((result, idx) => (
                <div key={idx} className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    📄 {result.filename} {result.month && `(${result.month})`}
                  </h2>

                  {result.error ? (
                    <div className="bg-red-50 border border-red-200 rounded p-4">
                      <p className="text-red-800">Error: {result.error}</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-600">Total CSV Rows</p>
                          <p className="text-lg font-bold">{result.totalCSVRows || result.csvCount}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-600">Normalized</p>
                          <p className="text-lg font-bold text-green-600">{result.successfullyNormalized || result.csvCount}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-600">In Database</p>
                          <p className="text-lg font-bold text-blue-600">{result.dbCount}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-600">Missing</p>
                          <p className="text-lg font-bold text-red-600">{result.missing.length}</p>
                        </div>
                      </div>

                      {result.normalizationErrors !== undefined && (
                        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded p-4">
                          <h3 className="font-semibold text-yellow-800 mb-2">
                            Normalization Errors: {result.normalizationErrors}
                          </h3>
                          {result.errorBreakdown && (
                            <div className="text-sm">
                              {Object.entries(result.errorBreakdown).map(([reason, count]) => (
                                <div key={reason} className="flex justify-between">
                                  <span>{reason}:</span>
                                  <span className="font-semibold">{count as number}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {result.failedErrors && result.failedErrors.length > 0 && (
                            <div className="mt-4">
                              <h4 className="font-semibold mb-2">Sample Failed Transactions:</h4>
                              <div className="max-h-48 overflow-y-auto text-xs">
                                <table className="min-w-full">
                                  <thead className="bg-yellow-100">
                                    <tr>
                                      <th className="px-2 py-1 text-left">Reason</th>
                                      <th className="px-2 py-1 text-left">Error</th>
                                      <th className="px-2 py-1 text-left">Date</th>
                                      <th className="px-2 py-1 text-left">Merchant</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {result.failedErrors.map((err: any, i: number) => {
                                      const merchantCol = Object.keys(err.row || {}).find(k => /description|merchant/i.test(k));
                                      const dateCol = Object.keys(err.row || {}).find(k => /date/i.test(k));
                                      return (
                                        <tr key={i} className="border-b">
                                          <td className="px-2 py-1">{err.reason}</td>
                                          <td className="px-2 py-1 text-xs">{err.error}</td>
                                          <td className="px-2 py-1">{err.row[dateCol || ''] || 'N/A'}</td>
                                          <td className="px-2 py-1 text-xs">{String(err.row[merchantCol || ''] || '').substring(0, 30)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {result.missing.length > 0 && (
                        <div className="mt-4">
                          <h3 className="font-semibold text-red-600 mb-2">
                            Missing in Database ({result.missing.length} transactions)
                          </h3>
                          <div className="max-h-96 overflow-y-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-left">Merchant</th>
                                  <th className="px-2 py-1 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.missing.map((t: any, i: number) => (
                                  <tr key={i} className="border-b">
                                    <td className="px-2 py-1">{t.date}</td>
                                    <td className="px-2 py-1">{t.merchant}</td>
                                    <td className="px-2 py-1 text-right">${Math.abs(t.amount).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {result.extra.length > 0 && (
                        <div className="mt-4">
                          <h3 className="font-semibold text-blue-600 mb-2">
                            Extra in Database ({result.extra.length} transactions)
                          </h3>
                          <div className="max-h-96 overflow-y-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-left">Merchant</th>
                                  <th className="px-2 py-1 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.extra.map((t: any) => (
                                  <tr key={t.id} className="border-b">
                                    <td className="px-2 py-1">{t.date}</td>
                                    <td className="px-2 py-1">{t.merchant_raw}</td>
                                    <td className="px-2 py-1 text-right">${Math.abs(t.amount).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Missing Transactions</p>
                    <p className="text-2xl font-bold text-red-600">
                      {results.reduce((sum, r) => sum + (r.missing?.length || 0), 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Missing Amount</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${results.reduce((sum, r) => {
                        const missingTotal = (r.missing || []).reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0);
                        return sum + missingTotal;
                      }, 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Normalization Errors</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {results.reduce((sum, r) => sum + (r.normalizationErrors || 0), 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Extra in DB</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {results.reduce((sum, r) => sum + (r.extra?.length || 0), 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}




