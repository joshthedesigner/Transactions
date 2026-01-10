'use client';

import { useEffect, useState } from 'react';
import { testSummaryMetrics } from '@/lib/actions/test-summary-metrics';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function TestSummaryMetricsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await testSummaryMetrics();
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
              <p className="text-blue-800">Testing getSummaryMetrics...</p>
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

  const hasDifference = data.difference.totalSpent > 0.01 || data.difference.transactionCount > 0;

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">getSummaryMetrics Test</h1>

          {/* Comparison */}
          <div className={`rounded-lg p-6 mb-6 ${
            hasDifference ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
          }`}>
            <h2 className="text-xl font-semibold mb-4">📊 Comparison</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">getSummaryMetrics</p>
                <p className="text-2xl font-bold">{formatCurrency(data.getSummaryMetricsResult.totalSpent)}</p>
                <p className="text-xs text-gray-500">{data.getSummaryMetricsResult.transactionCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Manual Calculation</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.manualCalculation.totalSpent)}</p>
                <p className="text-xs text-gray-500">{data.manualCalculation.transactionCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Difference</p>
                <p className={`text-2xl font-bold ${hasDifference ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.difference.totalSpent)}
                </p>
                <p className="text-xs text-gray-500">{data.difference.transactionCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Total Transactions</p>
                <p className="text-2xl font-bold">{data.dbTransactionCount}</p>
              </div>
            </div>
            {hasDifference && (
              <div className="mt-4 p-4 bg-red-100 rounded border border-red-300">
                <p className="font-semibold text-red-800">⚠️ DISCREPANCY FOUND</p>
                <p className="text-sm text-red-700 mt-1">
                  getSummaryMetrics is returning a different value than manual calculation.
                  This indicates a bug in the calculation logic.
                </p>
              </div>
            )}
          </div>

          {/* By File */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">By File Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Filename</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFile.map((file: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-3">{file.filename}</td>
                      <td className="px-4 py-3 text-right">{file.count}</td>
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
                      {formatCurrency(data.byFile.reduce((sum: number, f: any) => sum + f.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

