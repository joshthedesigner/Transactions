'use client';

import { useEffect, useState } from 'react';
import { debugFrontendCalculation } from '@/lib/actions/debug-frontend-calculation';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DebugFrontendCalculationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await debugFrontendCalculation();
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
              <p className="text-blue-800">Debugging frontend calculation...</p>
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
          <h1 className="text-3xl font-bold mb-6">Frontend Calculation Debug</h1>

          {/* Calculation Results */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Calculation Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">getSummaryMetrics Result</p>
                <p className="text-2xl font-bold">{formatCurrency(data.calculation.totalSpent)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Raw Calculation</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.rawTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Difference</p>
                <p className={`text-2xl font-bold ${data.difference > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.difference)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Spending Transactions</p>
                <p className="text-2xl font-bold">{data.calculation.spendingCount}</p>
                <p className="text-xs text-gray-500">of {data.calculation.totalTransactions} total</p>
              </div>
            </div>
          </div>

          {/* Issues */}
          {data.issues && data.issues.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-yellow-800">⚠️ Issues Found</h2>
              {data.issues.map((issue: any, idx: number) => (
                <div key={idx} className="mb-4 p-4 bg-white rounded border border-yellow-300">
                  <h3 className="font-semibold text-yellow-800 mb-2">
                    {issue.type.replace(/_/g, ' ').toUpperCase()}: {issue.count} transactions = {formatCurrency(issue.total)}
                  </h3>
                  {issue.transactions.length > 0 && (
                    <div className="text-sm">
                      <p className="font-semibold mb-1">Sample transactions:</p>
                      <div className="max-h-40 overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="px-2 py-1 text-left">Amount</th>
                              <th className="px-2 py-1 text-left">Convention</th>
                              <th className="px-2 py-1 text-left">Filename</th>
                              <th className="px-2 py-1 text-right">Spending Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {issue.transactions.map((t: any, i: number) => (
                              <tr key={i} className="border-b">
                                <td className="px-2 py-1">{formatCurrency(t.amount)}</td>
                                <td className="px-2 py-1">{t.convention || 'NULL'}</td>
                                <td className="px-2 py-1">{t.filename}</td>
                                <td className="px-2 py-1 text-right">{formatCurrency(t.spendingAmount || 0)}</td>
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
          )}

          {/* By File Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">By File Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Filename</th>
                    <th className="px-4 py-3 text-right">Total Transactions</th>
                    <th className="px-4 py-3 text-right">Spending Transactions</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFile.map((file: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-3">{file.filename}</td>
                      <td className="px-4 py-3 text-right">{file.count}</td>
                      <td className="px-4 py-3 text-right">{file.spendingCount}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(file.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {data.byFile.reduce((sum: number, f: any) => sum + f.count, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {data.byFile.reduce((sum: number, f: any) => sum + f.spendingCount, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(data.byFile.reduce((sum: number, f: any) => sum + f.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Sample Transactions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Sample Transactions (First 20)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Convention</th>
                    <th className="px-3 py-2 text-left">Filename</th>
                    <th className="px-3 py-2 text-right">Spending Amount</th>
                    <th className="px-3 py-2 text-center">Is Spending</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sampleTransactions.map((t: any, idx: number) => (
                    <tr key={idx} className={t.isSpending ? '' : 'bg-yellow-50'}>
                      <td className="px-3 py-2">{formatCurrency(t.amount)}</td>
                      <td className="px-3 py-2">{t.convention || 'NULL'}</td>
                      <td className="px-3 py-2">{t.filename}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(t.spendingAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        {t.isSpending ? '✓' : '✗'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

