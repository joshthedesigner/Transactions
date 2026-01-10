'use client';

import { useEffect, useState } from 'react';
import { debugSummaryMetrics } from '@/lib/actions/debug-summary-metrics';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DebugSummaryMetricsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await debugSummaryMetrics();
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
              <p className="text-blue-800">Debugging summary metrics...</p>
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
          <h1 className="text-3xl font-bold mb-6">Summary Metrics Debug</h1>

          {/* Comparison */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Comparison</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">getSummaryMetrics() Result</p>
                <p className="text-2xl font-bold">{formatCurrency(data.getSummaryMetricsResult.totalSpent)}</p>
                <p className="text-sm text-gray-600">{data.getSummaryMetricsResult.transactionCount} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Manual Calculation</p>
                <p className="text-2xl font-bold">{formatCurrency(data.manualCalculation.totalSpent)}</p>
                <p className="text-sm text-gray-600">{data.manualCalculation.transactionCount} transactions</p>
              </div>
            </div>
            {data.discrepancy.totalDifference !== 0 && (
              <div className="mt-4 p-3 bg-red-100 rounded">
                <p className="font-semibold text-red-800">
                  ⚠️ Discrepancy: {formatCurrency(Math.abs(data.discrepancy.totalDifference))}
                </p>
                <p className="text-sm text-red-700">
                  Count difference: {data.discrepancy.countDifference} transactions
                </p>
              </div>
            )}
          </div>

          {/* Chase2861 */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔍 Chase2861 Transactions</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Count</p>
                <p className="text-2xl font-bold">{data.chase2861.count}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold">{formatCurrency(data.chase2861.total)}</p>
              </div>
            </div>
            {data.chase2861.transactions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold mb-2">Sample Transactions:</p>
                {data.chase2861.transactions.map((t: any) => (
                  <div key={t.id} className="p-2 bg-gray-50 rounded">
                    <p className="text-sm">{t.date} - {t.merchant}</p>
                    <p className="text-xs text-gray-600">
                      Amount: {formatCurrency(t.amount)} | File: {t.filename} | Convention: {t.convention || 'null'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {data.chase2861.count === 0 && (
              <p className="text-red-600 font-semibold">⚠️ No Chase2861 transactions found in approved transactions!</p>
            )}
          </div>

          {/* By File */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📁 Totals by File</h2>
            <div className="space-y-2">
              {data.byFile.map((file: any) => (
                <div key={file.filename} className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{file.filename}</p>
                      <p className="text-sm text-gray-600">{file.count} transactions</p>
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(file.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Query Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">🔧 Query Info</h2>
            <div className="space-y-2">
              <p><strong>Date Range:</strong> {data.queryInfo.startDate} to {data.queryInfo.endDate}</p>
              <p><strong>Total Approved Transactions:</strong> {data.queryInfo.totalApprovedTransactions}</p>
              {data.queryInfo.transactionsWithoutSourceFile > 0 && (
                <div className="p-3 bg-yellow-50 rounded">
                  <p className="font-semibold text-yellow-800">
                    ⚠️ {data.queryInfo.transactionsWithoutSourceFile} transactions without source_file relationship!
                  </p>
                  <p className="text-sm text-yellow-700">
                    These transactions might be calculated incorrectly.
                  </p>
                </div>
              )}
              {data.queryInfo.transactionsWithNullConvention > 0 && (
                <div className="p-3 bg-orange-50 rounded">
                  <p className="font-semibold text-orange-800">
                    ⚠️ {data.queryInfo.transactionsWithNullConvention} transactions with null convention!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Manual Calculation Exact */}
          {data.manualCalculationExact && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">🔬 Exact Query Match</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Using EXACT same query as getSummaryMetrics</p>
                  <p className="text-2xl font-bold">{formatCurrency(data.manualCalculationExact.totalSpent)}</p>
                  <p className="text-sm text-gray-600">{data.manualCalculationExact.transactionCount} transactions</p>
                  <p className="text-xs text-gray-500">Query returned: {data.manualCalculationExact.queryCount} rows</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Difference from getSummaryMetrics</p>
                  <p className={`text-2xl font-bold ${Math.abs(data.getSummaryMetricsResult.totalSpent - data.manualCalculationExact.totalSpent) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(data.getSummaryMetricsResult.totalSpent - data.manualCalculationExact.totalSpent)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

