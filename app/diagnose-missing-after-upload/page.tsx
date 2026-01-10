'use client';

import { useEffect, useState } from 'react';
import { diagnoseMissingAfterUpload } from '@/lib/actions/diagnose-missing-after-upload';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DiagnoseMissingAfterUploadPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await diagnoseMissingAfterUpload();
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
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Analyzing upload results...</p>
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
          <h1 className="text-3xl font-bold mb-6">Upload Analysis</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600">CSV Total</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.csvTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Total</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.dbTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Approved</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.dbApprovedTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(data.summary.dbPendingTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Missing</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.missingTotal)}</p>
                <p className="text-xs text-gray-500">{data.summary.missingCount} transactions</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Normalized</p>
                <p className="font-bold">{data.summary.totalNormalized}</p>
              </div>
              <div>
                <p className="text-gray-600">Failed (fixable)</p>
                <p className="font-bold text-yellow-600">{data.summary.totalFailed}</p>
              </div>
              <div>
                <p className="text-gray-600">DB Failed Records</p>
                <p className="font-bold text-red-600">
                  {data.byFile.reduce((sum: number, f: any) => sum + f.dbFailedCount, 0)}
                </p>
              </div>
            </div>
          </div>

          {/* By File */}
          <div className="space-y-4">
            {data.byFile.map((file: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4">{file.filename}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">CSV Total</p>
                    <p className="text-lg font-bold">{formatCurrency(file.csvTotal)}</p>
                    <p className="text-xs text-gray-500">{file.csvCount} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">DB Total</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(file.dbTotal)}</p>
                    <p className="text-xs text-gray-500">{file.dbCount} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Missing</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(file.missingTotal)}</p>
                    <p className="text-xs text-gray-500">{file.missing} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Breakdown</p>
                    <p className="text-xs">
                      Normalized: {file.normalizedCount}<br/>
                      Failed: {file.failedCount}<br/>
                      DB Failed: {file.dbFailedCount || 0}
                    </p>
                  </div>
                </div>

                {file.missingTransactions && file.missingTransactions.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-red-600 mb-2">
                      Missing Transactions ({file.missing} total, showing first 20):
                    </h4>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Status</th>
                            <th className="px-2 py-1 text-left">Date</th>
                            <th className="px-2 py-1 text-left">Merchant</th>
                            <th className="px-2 py-1 text-right">Amount</th>
                            <th className="px-2 py-1 text-left">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {file.missingTransactions.map((t: any, i: number) => (
                            <tr key={i} className={t.status === 'failed' ? 'bg-red-50' : ''}>
                              <td className="px-2 py-1">
                                <span className={`px-1 py-0.5 text-xs rounded ${
                                  t.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-2 py-1">{t.date}</td>
                              <td className="px-2 py-1">{t.merchant}</td>
                              <td className="px-2 py-1 text-right">{formatCurrency(t.spendingAmount)}</td>
                              <td className="px-2 py-1 text-xs text-gray-500">
                                {t.errorReason && (
                                  <span className="capitalize">{t.errorReason.replace(/_/g, ' ')}</span>
                                )}
                              </td>
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

