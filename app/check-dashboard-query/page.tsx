'use client';

import { useEffect, useState } from 'react';
import { checkDashboardQuery } from '@/lib/actions/check-dashboard-query';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckDashboardQueryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await checkDashboardQuery();
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
              <p className="text-blue-800">Checking dashboard query...</p>
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
          <h1 className="text-3xl font-bold mb-6">Dashboard Query Analysis</h1>

          {/* Query Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Query Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Start Date</p>
                <p className="font-bold">{data.query.startDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">End Date</p>
                <p className="font-bold">{data.query.endDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-bold">{data.query.status}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Other Filters</p>
                <p className="font-bold">{data.query.filters}</p>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📈 Query Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Spent</p>
                <p className="text-2xl font-bold">{formatCurrency(data.results.totalSpent)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Spending Transactions</p>
                <p className="text-2xl font-bold">{data.results.spendingCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Credit Transactions</p>
                <p className="text-2xl font-bold text-blue-600">{data.results.creditCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total in Query</p>
                <p className="text-2xl font-bold">{data.results.totalTransactions}</p>
              </div>
            </div>
          </div>

          {/* Comparison */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔍 Comparison</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">All Approved (No Date Filter)</p>
                <p className="text-xl font-bold">{formatCurrency(data.comparison.allApprovedTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Date Filtered (Dashboard Query)</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(data.comparison.dateFilteredTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Outside Date Range</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(data.comparison.outsideDateRangeTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Difference</p>
                <p className={`text-xl font-bold ${data.comparison.difference > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.comparison.difference)}
                </p>
              </div>
            </div>
            {Math.abs(data.comparison.difference - data.comparison.outsideDateRangeTotal) > 0.01 && (
              <div className="mt-4 p-4 bg-red-100 rounded border border-red-300">
                <p className="font-semibold text-red-800">⚠️ DISCREPANCY</p>
                <p className="text-sm text-red-700 mt-1">
                  The difference ({formatCurrency(data.comparison.difference)}) doesn't match the outside date range total 
                  ({formatCurrency(data.comparison.outsideDateRangeTotal)}). This suggests transactions are being filtered 
                  by something other than date range.
                </p>
              </div>
            )}
          </div>

          {/* Sample Transactions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Sample Spending Transactions (First 50)</h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Merchant</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Spending</th>
                    <th className="px-3 py-2 text-left">File</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.spendingTransactions.map((t: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-3 py-2">{t.date}</td>
                      <td className="px-3 py-2">{t.merchant}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(t.amount)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(t.spendingAmount)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{t.filename}</td>
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

