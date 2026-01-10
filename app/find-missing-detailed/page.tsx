'use client';

import { useEffect, useState } from 'react';
import { findMissingTransactionsDetailed } from '@/lib/actions/find-missing-transactions-detailed';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function FindMissingDetailedPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await findMissingTransactionsDetailed();
        setData(result);
      } catch (e) {
        console.error('Error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Finding missing transactions...</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Missing Transactions Analysis</h1>

          {/* Summary */}
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-red-800">⚠️ Missing Transactions Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">CSV Total</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalCsvTotal)}</p>
                <p className="text-xs text-gray-500">{data.summary.totalCsvCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Database Total</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.totalDbTotal)}</p>
                <p className="text-xs text-gray-500">{data.summary.totalDbCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Missing Count</p>
                <p className="text-2xl font-bold text-red-600">{data.summary.totalMissingCount}</p>
                <p className="text-xs text-gray-500">transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Missing Amount</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.totalMissingTotal)}</p>
                <p className="text-xs text-gray-500">not in database</p>
              </div>
            </div>
            {data.summary.totalNormalizationErrors > 0 && (
              <div className="mt-4 p-3 bg-yellow-100 rounded">
                <p className="text-sm">
                  <strong>Normalization Errors:</strong> {data.summary.totalNormalizationErrors} transactions failed to normalize
                  (these are separate from the missing transactions above)
                </p>
              </div>
            )}
          </div>

          {/* By File */}
          <div className="space-y-6">
            {data.byFile.map((file: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4">{file.filename}</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">CSV Count</p>
                    <p className="text-lg font-bold">{file.csvCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">CSV Total</p>
                    <p className="text-lg font-bold">{formatCurrency(file.csvTotal)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">DB Count</p>
                    <p className="text-lg font-bold text-green-600">{file.dbCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Missing Count</p>
                    <p className="text-lg font-bold text-red-600">{file.missingCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Missing Amount</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(file.missingTotal)}</p>
                  </div>
                </div>

                {file.error && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-yellow-800">{file.error}</p>
                  </div>
                )}

                {file.missingTransactions && file.missingTransactions.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">
                      Missing Transactions ({file.missingCount} total, showing first {file.missingTransactions.length})
                    </h4>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Merchant</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                            <th className="px-3 py-2 text-right">Spending</th>
                          </tr>
                        </thead>
                        <tbody>
                          {file.missingTransactions.map((t: any, i: number) => (
                            <tr key={i} className="border-b">
                              <td className="px-3 py-2">{t.date}</td>
                              <td className="px-3 py-2">{t.merchant}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(t.amount)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCurrency(t.spendingAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

