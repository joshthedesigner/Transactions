'use client';

import { useEffect, useState } from 'react';
import { diagnoseMetricsDiscrepancy } from '@/lib/actions/diagnose-metrics';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DiagnoseMetricsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('2020-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await diagnoseMetricsDiscrepancy(
          startDate || undefined,
          endDate || undefined
        );
        setData(result);
      } catch (e) {
        console.error('Diagnosis error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [startDate, endDate]);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">Metrics Diagnosis</h1>

          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
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

          {!loading && !error && data && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Transactions</p>
                    <p className="text-2xl font-bold">{data.totalTransactions.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Chase Total</p>
                    <p className="text-2xl font-bold">${data.calculation.chaseTotal.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Other Total</p>
                    <p className="text-2xl font-bold">${data.calculation.otherTotal.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Grand Total</p>
                    <p className="text-2xl font-bold text-blue-600">${data.calculation.grandTotal.toFixed(2)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 border-t pt-4">
                  <div>
                    <p className="text-sm text-gray-600">Approved</p>
                    <p className="text-xl font-semibold text-green-600">{data.approvedCount?.toLocaleString() || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Pending Review</p>
                    <p className="text-xl font-semibold text-yellow-600">{data.pendingCount?.toLocaleString() || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Spending Transactions</p>
                    <p className="text-xl font-semibold">{data.spendingCount?.toLocaleString() || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Credit/Refund Transactions</p>
                    <p className="text-xl font-semibold">{data.creditCount?.toLocaleString() || 0}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-600">
                  Date Range: {data.dateRange.start} to {data.dateRange.end}
                </p>
              </div>

              {/* By Month */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📅 Breakdown by Month</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Month</th>
                        <th className="px-4 py-2 text-right">Count</th>
                        <th className="px-4 py-2 text-right">Chase</th>
                        <th className="px-4 py-2 text-right">Other</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byMonth.map((month: any) => (
                        <tr key={month.month} className="border-b">
                          <td className="px-4 py-2">{month.month}</td>
                          <td className="px-4 py-2 text-right">{month.count}</td>
                          <td className="px-4 py-2 text-right">${month.chaseTotal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">${month.otherTotal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-semibold">${month.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Source File */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📄 Breakdown by Source File</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Filename</th>
                        <th className="px-4 py-2 text-right">Count</th>
                        <th className="px-4 py-2 text-right">+ Count</th>
                        <th className="px-4 py-2 text-right">- Count</th>
                        <th className="px-4 py-2 text-right">+ Total</th>
                        <th className="px-4 py-2 text-right">- Total</th>
                        <th className="px-4 py-2 text-right">Calculated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySourceFile.map((file: any) => (
                        <tr key={file.filename} className="border-b">
                          <td className="px-4 py-2">{file.filename}</td>
                          <td className="px-4 py-2 text-right">{file.count}</td>
                          <td className="px-4 py-2 text-right">{file.positiveCount}</td>
                          <td className="px-4 py-2 text-right">{file.negativeCount}</td>
                          <td className="px-4 py-2 text-right">${file.positiveTotal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">${file.negativeTotal.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-semibold">${file.calculatedTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample Transactions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">🔍 Sample Transactions (first 20)</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Date</th>
                        <th className="px-2 py-1 text-left">Merchant</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                        <th className="px-2 py-1 text-left">File</th>
                        <th className="px-2 py-1 text-left">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sampleTransactions.map((t: any) => (
                        <tr key={t.id} className="border-b">
                          <td className="px-2 py-1">{t.date}</td>
                          <td className="px-2 py-1">{t.merchant}</td>
                          <td className="px-2 py-1 text-right">${t.amount.toFixed(2)}</td>
                          <td className="px-2 py-1 text-xs">{t.filename}</td>
                          <td className="px-2 py-1">{t.isChase ? 'Chase' : 'Other'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}




